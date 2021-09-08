import { mat4 } from "gl-matrix";

import { IRenderTarget, ISceneRenderer } from "./api";
import Camera from "./camera";
import Scene from "./scene";
import { SceneObject, SceneMesh } from "./sceneObject";
import { Shader, MeshShader } from "./shader";
import CanvasRenderTarget from "./canvasRenderTarget";

interface MySceneObjectUniforms {
  shaderuniformbindgroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

export default class MyRenderer implements ISceneRenderer {
  private device: GPUDevice = null;

  private queue: GPUQueue = null;

  // Declare command handles
  private commandEncoder: GPUCommandEncoder = null;
  private passEncoder: GPURenderPassEncoder = null;

  private triangleShader: MeshShader = null;
  private triangleShaderPipeline: GPURenderPipeline = null;

  private gpuScene: Map<SceneObject, MySceneObjectUniforms>;

  constructor(device: GPUDevice) {
    this.device = device;

    this.gpuScene = new Map<SceneObject, MySceneObjectUniforms>();
  }

  async initPostCtor(): Promise<void> {
    this.triangleShader = new MeshShader();
    await this.triangleShader.load(this.device);
    // Graphics Pipeline

    this.triangleShaderPipeline = this.createRenderPipeline(
      this.triangleShader
    );
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

  // render(camera: Camera): void {
  //   // Acquire next image from swapchain
  //   this.colorTexture = this.swapchain.getCurrentTexture();
  //   this.colorTextureView = this.colorTexture.createView();

  //   // Write and submit commands to queue
  //   this.encodeCommands(camera);
  // }

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
    for (let i = 0; i < scene.objects.length; ++i) {
      const object: SceneObject = scene.objects[i];
      // only handle meshes here
      if (!(object instanceof SceneMesh)) {
        continue;
      }

      let shadingInfo: MySceneObjectUniforms = this.gpuScene.get(object);
      if (!shadingInfo) {
        // stick this data into a gpu buffer
        const uniformBuffer: GPUBuffer =
          this.triangleShader.createUniformBuffer(
            new Float32Array([
              // ModelViewProjection Matrix
              1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
              0.0, 0.0, 1.0,

              // Primary Color
              0.9, 0.1, 0.3, 1.0,

              // Accent Color
              0.8, 0.2, 0.8, 1.0,
            ])
          );

        // attach this buffer to the shader
        const shaderuniformbindgroup =
          this.triangleShader.createShaderBindGroup(uniformBuffer);

        shadingInfo = {
          uniformBuffer,
          shaderuniformbindgroup,
        };
        this.gpuScene.set(object, shadingInfo);
      }

      // apply the model transform
      const projViewModel = mat4.mul(
        mat4.create(),
        projView,
        object.getTransform()
      );
      // TODO don't create this every time?
      const upload = this.device.createBuffer({
        size: 16 * 4,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      });
      const mapping = upload.getMappedRange(0, 16 * 4);

      new Float32Array(mapping).set(projViewModel);
      upload.unmap();

      this.commandEncoder.copyBufferToBuffer(
        upload,
        0,
        shadingInfo.uniformBuffer,
        0,
        16 * 4
      );
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

    for (let i = 0; i < scene.objects.length; ++i) {
      const object: SceneObject = scene.objects[i];
      // only handle meshes here
      if (!(object instanceof SceneMesh)) {
        continue;
      }
      let shadingInfo: MySceneObjectUniforms = this.gpuScene.get(object);

      this.passEncoder.setPipeline(this.triangleShaderPipeline);
      this.passEncoder.setBindGroup(0, shadingInfo.shaderuniformbindgroup);
      this.passEncoder.setVertexBuffer(
        0,
        (object as SceneMesh).mesh.getPositionBuffer()
      );
      this.passEncoder.setVertexBuffer(
        1,
        (object as SceneMesh).mesh.getColorBuffer()
      );
      this.passEncoder.setIndexBuffer(
        (object as SceneMesh).mesh.getIndexBuffer(),
        (object as SceneMesh).mesh.getIndexFormat()
      );
      this.passEncoder.drawIndexed(3, 1, 0, 0, 0);
    }
    this.passEncoder.endPass();

    this.device.queue.submit([this.commandEncoder.finish()]);
  }
}
