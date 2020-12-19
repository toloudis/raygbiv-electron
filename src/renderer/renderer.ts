import { mat4 } from "gl-matrix";

import { IRenderTarget, ISceneRenderer } from "./api";
import Camera from "./camera";
import Mesh from "./mesh";
import Scene from "./scene";
import { SceneObject, SceneMesh } from "./sceneObject";
import Shader from "./shader";
import CanvasRenderTarget from "./canvasRenderTarget";

// consider using readFileSync here to skip the fetch step in shader.ts
import triangle_frag_spv from "./shaders/triangle.frag.spv";
import triangle_vert_spv from "./shaders/triangle.vert.spv";

interface MySceneObjectUniforms {
  shaderuniformbindgroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

export default class MyRenderer implements ISceneRenderer {
  private device: GPUDevice = null;

  private queue: GPUQueue = null;

  // ✋ Declare command handles
  private commandEncoder: GPUCommandEncoder = null;
  private passEncoder: GPURenderPassEncoder = null;

  private triangleShader: Shader = null;
  private triangleShaderPipeline: GPURenderPipeline = null;

  private gpuScene: Map<SceneObject, MySceneObjectUniforms>;

  constructor(device: GPUDevice) {
    this.device = device;

    this.gpuScene = new Map<SceneObject, MySceneObjectUniforms>();
  }

  async initPostCtor(): Promise<void> {
    this.triangleShader = new Shader(triangle_vert_spv, triangle_frag_spv);
    await this.triangleShader.load(this.device);
    // Graphics Pipeline

    this.triangleShaderPipeline = this.createRenderPipeline(
      this.triangleShader
    );
  }

  createMesh(
    vertices: Float32Array,
    normals: Float32Array | null,
    colors: Float32Array | null,
    indices: Uint16Array
  ): Mesh {
    return new Mesh(this.device, vertices, normals, colors, indices);
  }

  // Helper function for creating GPUBuffer(s) out of Typed Arrays
  createBuffer(arr: Float32Array | Uint16Array, usage: number): GPUBuffer {
    const desc = { size: arr.byteLength, usage, mappedAtCreation: true };
    console.log("CreateBuffer Mapped " + arr.byteLength);
    // @ts-ignore TS2339
    const [buffer, bufferMapped] = this.device.createBufferMapped(desc);
    //const bufferMapped = buffer.getMappedRange(0, arr.byteLength);

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

    // Depth/Stencil State
    const depthStencilState: GPUDepthStencilStateDescriptor = {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    };

    // Blend State
    const colorState: GPUColorStateDescriptor = {
      format: "bgra8unorm",
      alphaBlend: {
        srcFactor: "src-alpha",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
      colorBlend: {
        srcFactor: "src-alpha",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
      writeMask: GPUColorWrite.ALL,
    };

    // Rasterization
    const rasterizationState: GPURasterizationStateDescriptor = {
      frontFace: "cw",
      cullMode: "none",
    };

    // Create the Pipeline
    const pipelineDesc: GPURenderPipelineDescriptor = {
      layout: shaderobj.getPipelineLayout(),

      vertexStage: shaderobj.getVertexStage(),
      fragmentStage: shaderobj.getFragmentStage(),

      primitiveTopology: "triangle-list",
      // array of "output" slots
      colorStates: [colorState],
      depthStencilState,
      vertexState,
      rasterizationState,
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
    const colorAttachment: GPURenderPassColorAttachmentDescriptor = {
      attachment: renderTarget.getColorTextureView(),
      loadValue: { r: 0, g: 0, b: 0, a: 1 },
      storeOp: "store",
    };

    const depthAttachment: GPURenderPassDepthStencilAttachmentDescriptor = {
      attachment: renderTarget.getDepthTextureView(),
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

      let shadingInfo: MySceneObjectUniforms = this.gpuScene.get(object);
      if (!shadingInfo) {
        // stick this data into a gpu buffer
        const uniformBuffer: GPUBuffer = this.triangleShader.createUniformBuffer();

        // attach this buffer to the shader
        const shaderuniformbindgroup = this.triangleShader.createShaderBindGroup(
          uniformBuffer
        );

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
      // @ts-ignore TS2339
      const [upload, mapping] = this.device.createBufferMapped({
        size: 16 * 4,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      });
      //const mapping = upload.getMappedRange(0, 16 * 4);

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
        (object as SceneMesh).mesh.getIndexBuffer(), (object as SceneMesh).mesh.getIndexFormat() 
      );
      this.passEncoder.drawIndexed(3, 1, 0, 0, 0);
    }
    this.passEncoder.endPass();

    this.device.defaultQueue.submit([this.commandEncoder.finish()]);
  }
}
