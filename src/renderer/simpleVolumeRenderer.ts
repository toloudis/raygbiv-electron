import { mat4, glMatrix } from "gl-matrix";

import { IRenderTarget, ISceneRenderer } from "./api";
import { mypad } from "./bufferUtil";
import Camera from "./camera";
import Scene from "./scene";
import { SceneObject, SceneVolume } from "./sceneObject";
import { VolumeShader, Shader } from "./shader";
import CanvasRenderTarget from "./canvasRenderTarget";

interface MySceneObjectUniforms {
  shaderuniformbindgroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

export default class SimpleVolumeRenderer implements ISceneRenderer {
  private device: GPUDevice = null;

  private queue: GPUQueue = null;

  // ✋ Declare command handles
  private commandEncoder: GPUCommandEncoder = null;
  private passEncoder: GPURenderPassEncoder = null;

  private volumeShader: VolumeShader = null;
  private volumeShaderPipeline: GPURenderPipeline = null;

  private gpuScene: Map<SceneObject, MySceneObjectUniforms>;

  constructor(device: GPUDevice) {
    this.device = device;

    this.gpuScene = new Map<SceneObject, MySceneObjectUniforms>();
  }

  async initPostCtor(): Promise<void> {
    this.volumeShader = new VolumeShader();
    await this.volumeShader.load(this.device);
    // Graphics Pipeline

    this.volumeShaderPipeline = this.createRenderPipeline(this.volumeShader);
  }

  // Helper function for creating GPUBuffer(s) out of Typed Arrays
  createBuffer(arr: Float32Array | Uint16Array, usage: number): GPUBuffer {
    const paddedBufferSize = mypad(arr.byteLength);
    const desc = { size: paddedBufferSize, usage, mappedAtCreation: true };
    console.log("CreateBuffer Mapped " + arr.byteLength);
    const buffer = this.device.createBuffer(desc);
    const bufferMapped = buffer.getMappedRange(0, paddedBufferSize);

    const writeArray =
      arr instanceof Uint16Array
        ? new Uint16Array(bufferMapped)
        : new Float32Array(bufferMapped);
    writeArray.set(arr);
    buffer.unmap();
    return buffer;
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
      loadValue: { r: 0, g: 0, b: 0, a: 1 },
      storeOp: "store",
    };

    const depthAttachment: GPURenderPassDepthStencilAttachment = {
      view: renderTarget.getDepthTextureView(),
      depthLoadValue: 1,
      depthStoreOp: "store",
      stencilLoadValue: "load",
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

      let shadingInfo: MySceneObjectUniforms = this.gpuScene.get(object);
      if (!shadingInfo) {
        // stick this data into a gpu buffer
        const data = new Float32Array(16 * 2);
        // ModelView Matrix
        data.set(viewModel);
        // Projection Matrix
        data.set(camera.getProjectionMatrix(), 16);

        const uniformBuffer: GPUBuffer =
          this.volumeShader.createUniformBuffer(data);

        const data2 = new Float32Array(35);
        data2.set([
          // mat4 inverseModelViewMatrix;
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
          // vec2 iResolution;
          512, 512,
          // float isPerspective;
          1,
          // float orthoScale;
          1.0,
          // float GAMMA_MIN;
          0.0,
          // float GAMMA_MAX;
          1.0,
          // float GAMMA_SCALE;
          1.0,
          // float BRIGHTNESS;
          1.0,
          // vec3 AABB_CLIP_MIN;
          0.0, 0.0, 0.0,
          // float dataRangeMin; // 0..1 (mapped from 0..uint16_max)
          0.0,
          // vec3 AABB_CLIP_MAX;
          1.0, 1.0, 1.0,
          // float dataRangeMax; // 0..1 (mapped from 0..uint16_max)
          1.0,
          // float maskAlpha;
          1.0,
          // float DENSITY;
          1.0,
          // int BREAK_STEPS;
          256,
        ]);
        data2.set(viewModelInv);
        console.log(data);
        console.log(data2);
        const uniformBuffer2: GPUBuffer =
          this.volumeShader.createUniformBuffer(data2);

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
          object.volume.getVolumeBufferView(),
          uniformBuffer2
        );

        shadingInfo = {
          uniformBuffer,
          shaderuniformbindgroup,
        };
        this.gpuScene.set(object, shadingInfo);
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

      let shadingInfo: MySceneObjectUniforms = this.gpuScene.get(object);

      this.passEncoder.setPipeline(this.volumeShaderPipeline);
      this.passEncoder.setBindGroup(0, shadingInfo.shaderuniformbindgroup);
      this.passEncoder.setVertexBuffer(
        0,
        object.getVolume().getPositionBuffer()
      );
      //this.passEncoder.setVertexBuffer(1, object.getColorBuffer());
      this.passEncoder.setIndexBuffer(
        object.getVolume().getIndexBuffer(),
        object.getVolume().getIndexFormat()
      );
      this.passEncoder.drawIndexed(3, 1, 0, 0, 0);
    }
    this.passEncoder.endPass();

    this.device.queue.submit([this.commandEncoder.finish()]);
  }
}
