import { mat4 } from "gl-matrix";

import { IRenderTarget, ISceneRenderer } from "./api";
import Camera from "./camera";
import Mesh from "./mesh";
import Scene from "./scene";
import SceneObject from "./sceneObject";
import Shader from "./shader";
import CanvasRenderTarget from "./canvasRenderTarget";

// // consider using readFileSync here to skip the fetch step in shader.ts
// import triangle_frag_spv from "./shaders/triangle.frag.spv";
// import triangle_vert_spv from "./shaders/triangle.vert.spv";
// import volume_frag_spv from "./shaders/volume.frag.spv";
// import volume_vert_spv from "./shaders/volume.vert.spv";

interface MySceneObject {
  pipeline: GPURenderPipeline;
  mesh: Mesh;
  shaderuniformbindgroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  transform: mat4;
}

export default class MyRenderer implements ISceneRenderer {
  private device: GPUDevice = null;

  private queue: GPUQueue = null;

  // ✋ Declare command handles
  private commandEncoder: GPUCommandEncoder = null;
  private passEncoder: GPURenderPassEncoder = null;

  constructor(device: GPUDevice) {
    this.device = device;
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
      // apply the model transform
      const projViewModel = mat4.mul(mat4.create(), projView, object.transform);
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
        object.uniformBuffer,
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

      this.passEncoder.setPipeline(object.pipeline);
      this.passEncoder.setBindGroup(0, object.shaderuniformbindgroup);
      this.passEncoder.setVertexBuffer(0, object.mesh.getPositionBuffer());
      this.passEncoder.setVertexBuffer(1, object.mesh.getColorBuffer());
      this.passEncoder.setIndexBuffer(object.mesh.getIndexBuffer());
      this.passEncoder.drawIndexed(3, 1, 0, 0, 0);
    }
    this.passEncoder.endPass();

    this.queue.submit([this.commandEncoder.finish()]);
  }
}
