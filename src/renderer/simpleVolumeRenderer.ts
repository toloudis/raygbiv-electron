import { mat4, glMatrix } from "gl-matrix";

import { IRenderTarget, ISceneRenderer } from "./api";
import { createUniformBuffer } from "./bufferUtil";
import Camera from "./camera";
import Scene from "./scene";
import { SceneObject, SceneVolume } from "./sceneObject";
import { VolumeShader, Shader } from "./shader";
import CanvasRenderTarget from "./canvasRenderTarget";

interface VolumeShadingData {
  shaderuniformbindgroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  uniformBuffer2: GPUBuffer;
}

export interface VolumeRendererSettings {
  brightness: number;
  density: number;
  gammaMin: number;
  gammaMax: number;
  gammaScale: number;
}

export default class SimpleVolumeRenderer implements ISceneRenderer {
  public settings: VolumeRendererSettings;

  private device: GPUDevice = null;

  // Declare command handles
  private commandEncoder: GPUCommandEncoder = null;
  private passEncoder: GPURenderPassEncoder = null;

  private volumeShader: VolumeShader = null;
  private volumeShaderPipeline: GPURenderPipeline = null;

  private gpuScene: Map<SceneObject, VolumeShadingData>;

  constructor(device: GPUDevice) {
    this.device = device;
    this.settings = {
      brightness: 0.5,
      density: 1.0,
      gammaMax: 1.0,
      gammaMin: 0.0,
      gammaScale: 0.5,
    };
    this.gpuScene = new Map<SceneObject, VolumeShadingData>();
  }

  async initPostCtor(): Promise<void> {
    this.volumeShader = new VolumeShader();
    await this.volumeShader.load(this.device);
    // Graphics Pipeline

    this.volumeShaderPipeline = this.createRenderPipeline(this.volumeShader);
  }

  createRenderPipeline(shaderobj: Shader): GPURenderPipeline {
    // Input Assembly
    const vertexState = shaderobj.getVertexStateDesc();
    const fragStage = shaderobj.getFragmentStage();
    // Depth/Stencil State
    const depthStencilState: GPUDepthStencilState = {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    };

    const target0: GPUColorTargetState = {
      format: "bgra8unorm",
      blend: {
        color: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add",
        },
        alpha: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add",
        },
      },
      writeMask: GPUColorWrite.ALL,
    };

    // Create the Pipeline
    const pipelineDesc: GPURenderPipelineDescriptor = {
      layout: shaderobj.getPipelineLayout(),

      fragment: {
        targets: [target0],
        module: fragStage.module,
        entryPoint: fragStage.entryPoint,
      },

      primitive: {
        topology: "triangle-list",
        frontFace: "cw",
        cullMode: "none",
      },
      depthStencil: depthStencilState,
      vertex: vertexState,
    };
    return this.device.createRenderPipeline(pipelineDesc);
  }

  // Write commands to send to the GPU
  encodeCommands(camera: Camera): void {}

  render(
    target: IRenderTarget,
    camera: Camera,
    scene: Scene,
    simulationTime: number
  ): void {
    const renderTarget = target as CanvasRenderTarget;

    // Write and submit commands to queue
    const colorAttachment: GPURenderPassColorAttachment = {
      view: renderTarget.getColorTextureView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    };

    const depthAttachment: GPURenderPassDepthStencilAttachment = {
      view: renderTarget.getDepthTextureView(),
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
      stencilLoadOp: "load",
      stencilStoreOp: "store",
    };

    const renderPassDesc: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
      depthStencilAttachment: depthAttachment,
    };

    this.commandEncoder = this.device.createCommandEncoder();

    // Encode drawing commands

    // Compute and upload the combined projection and view matrix
    const projView = mat4.mul(
      mat4.create(),
      camera.getProjectionMatrix(),
      camera.getViewMatrix()
    );
    // // apply the model transform
    // const projViewModel = mat4.mul(
    //   mat4.create(),
    //   projView,
    //   object.getTransform()
    // );
    // gpu update all uniform buffers for all objects to update camera
    for (let i = 0; i < scene.volumes.length; ++i) {
      const object: SceneObject = scene.volumes[i];
      // only handle volumes here
      if (!(object instanceof SceneVolume)) {
        continue;
      }
      const viewModel = mat4.mul(
        mat4.create(),
        camera.getViewMatrix(),
        object.getTransform()
      );
      const viewModelInv = mat4.invert(mat4.create(), viewModel);

      // stick this data into a gpu buffer
      const data = new Float32Array(16 * 2);
      // ModelView Matrix
      data.set(viewModel);
      // Projection Matrix
      data.set(camera.getProjectionMatrix(), 16);

      const data2 = new Float32Array(44);
      data2.set([
        // mat4 inverseModelViewMatrix;
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        // vec2 iResolution;
        target.getWidth(),
        target.getHeight(),
        // float isPerspective;
        1,
        // float orthoScale;
        1.0,
        // float GAMMA_MIN;
        this.settings.gammaMin,
        // float GAMMA_MAX;
        this.settings.gammaMax,
        // float GAMMA_SCALE;
        this.settings.gammaScale,
        // float BRIGHTNESS;
        this.settings.brightness,
        // vec3 AABB_CLIP_MIN;
        -0.5,
        -0.5,
        -0.5,
        // float dataRangeMin; // 0..1 (mapped from 0..uint16_max)
        0.0,
        // vec3 AABB_CLIP_MAX;
        0.5,
        0.5,
        0.5,
        // float dataRangeMax; // 0..1 (mapped from 0..uint16_max)
        1.0,
        // float maskAlpha;
        1.0,
        // float DENSITY;
        this.settings.density,
        // int BREAK_STEPS;
        256,
        // SLICES: f32;
        object.volume.getDims()[2],
        // volumeScale: vec3<f32>;
        1.0,
        1.0,
        1.0,
        // orthoThickness: f32;
        1.0,
        // maxProject: i32;
        0,
        // ATLAS_X
        1, //object.volume.getTiling()[0],
        // ATLAS_Y
        1, //object.volume.getTiling()[1],
        // padding
        0,
      ]);
      data2.set(viewModelInv);

      // lazily create shading data here
      let shadingInfo: VolumeShadingData = this.gpuScene.get(object);
      if (!shadingInfo) {
        const uniformBuffer: GPUBuffer = createUniformBuffer(data, this.device);

        console.log(data);
        console.log(data2);
        const uniformBuffer2: GPUBuffer = createUniformBuffer(
          data2,
          this.device
        );

        // create sampler:
        const volSampler: GPUSampler = this.device.createSampler({
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge",
          addressModeW: "clamp-to-edge",
          magFilter: "linear",
          minFilter: "linear",
          mipmapFilter: "linear",
        });
        // attach this buffer to the shader
        const shaderuniformbindgroup = this.volumeShader.createShaderBindGroup(
          uniformBuffer,
          volSampler,
          object.volume.getChannel(0).textureView,
          uniformBuffer2
        );

        shadingInfo = {
          uniformBuffer: uniformBuffer,
          uniformBuffer2: uniformBuffer2,
          shaderuniformbindgroup: shaderuniformbindgroup,
        };
        this.gpuScene.set(object, shadingInfo);
      } else {
        // update uniformBuffer and uniformBuffer2
        var upload = this.device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.COPY_SRC,
          mappedAtCreation: true,
        });
        new Float32Array(upload.getMappedRange()).set(data);
        upload.unmap();
        // Copy the upload buffer to our uniform buffer
        this.commandEncoder.copyBufferToBuffer(
          upload,
          0,
          shadingInfo.uniformBuffer,
          0,
          data.byteLength
        );

        //this.device.queue.writeBuffer();
        upload = this.device.createBuffer({
          size: data2.byteLength,
          usage: GPUBufferUsage.COPY_SRC,
          mappedAtCreation: true,
        });
        new Float32Array(upload.getMappedRange()).set(data2);
        upload.unmap();
        // Copy the upload buffer to our uniform buffer
        this.commandEncoder.copyBufferToBuffer(
          upload,
          0,
          shadingInfo.uniformBuffer2,
          0,
          data2.byteLength
        );
      }

      // apply the model transform
      // const projViewModel = mat4.mul(
      //   mat4.create(),
      //   projView,
      //   object.getTransform()
      // );
      // // TODO don't create this every time?
      // const upload = this.device.createBuffer({
      //   size: 16 * 4,
      //   usage: GPUBufferUsage.COPY_SRC,
      //   mappedAtCreation: true,
      // });
      // const mapping = upload.getMappedRange(0, 16 * 4);

      // new Float32Array(mapping).set(projViewModel);
      // upload.unmap();

      // this.commandEncoder.copyBufferToBuffer(
      //   upload,
      //   0,
      //   shadingInfo.uniformBuffer,
      //   0,
      //   16 * 4
      // );
    }

    // renderpassdesc describes the framebuffer we are rendering to
    this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
    this.passEncoder.setViewport(
      0,
      0,
      renderTarget.getWidth(),
      renderTarget.getHeight(),
      0,
      1
    );
    this.passEncoder.setScissorRect(
      0,
      0,
      renderTarget.getWidth(),
      renderTarget.getHeight()
    );

    for (let i = 0; i < scene.volumes.length; ++i) {
      const object: SceneObject = scene.volumes[i];
      // only handle volumes here
      if (!(object instanceof SceneVolume)) {
        continue;
      }

      let shadingInfo: VolumeShadingData = this.gpuScene.get(object);

      this.passEncoder.setPipeline(this.volumeShaderPipeline);
      this.passEncoder.setBindGroup(0, shadingInfo.shaderuniformbindgroup);
      this.passEncoder.setVertexBuffer(0, object.getVolume().vertex_buffer);
      //this.passEncoder.setVertexBuffer(1, object.getColorBuffer());
      this.passEncoder.setIndexBuffer(
        object.getVolume().index_buffer,
        "uint16" //object.getVolume().getIndexFormat()
      );
      this.passEncoder.drawIndexed(3 * 2 * 6, 1, 0, 0, 0);
    }
    this.passEncoder.end();

    this.device.queue.submit([this.commandEncoder.finish()]);
  }
}
