import { mat4 } from "gl-matrix";

import Camera from "./camera";
import Mesh from "./mesh";
import Shader from "./shader";
// consider using readFileSync here to skip the fetch step in shader.ts
import triangle_frag_spv from "./shaders/triangle.frag.spv";
import triangle_vert_spv from "./shaders/triangle.vert.spv";
import volume_frag_spv from "./shaders/volume.frag.spv";
import volume_vert_spv from "./shaders/volume.vert.spv";

interface MySceneObject {
  pipeline: GPURenderPipeline;
  mesh: Mesh;
  shaderuniformbindgroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  transform: mat4;
}

export default class MyRenderer {
  private adapter: GPUAdapter = null;
  private device: GPUDevice = null;

  private queue: GPUQueue = null;

  private canvas: HTMLCanvasElement = null;
  private swapchain: GPUSwapChain = null;

  private depthTexture: GPUTexture = null;
  private depthTextureView: GPUTextureView = null;
  // the color texture ref will be swapped as part of the swapchain
  private colorTexture: GPUTexture = null;
  private colorTextureView: GPUTextureView = null;

  // ✋ Declare command handles
  private commandEncoder: GPUCommandEncoder = null;
  private passEncoder: GPURenderPassEncoder = null;

  private scene: MySceneObject[] = [];

  private renderWidth = 2;
  private renderHeight = 2;

  public triangleShader: Shader = null;
  private volumeShader: Shader = null;

  constructor() {
    /* do nothing */
  }

  async begin(): Promise<void> {
    try {
      if (!navigator.gpu) {
        throw new Error("WebGPU is not supported on this browser.");
      }
      await this.initWebGPU();
      console.log("WebGPU initialized.");
      console.log("ADAPTER:  " + this.adapter.name);
      console.log("EXTENSIONS :  ");
      this.adapter.extensions.forEach((ext) => console.log("    " + ext));

      await this.loadAllShaders();
    } catch (e) {
      console.error(e);
      this.initFallback();
    }
  }

  async initWebGPU(): Promise<void> {
    await this.ensureDevice();
    // ... Upload resources, etc.
    this.queue = this.device.defaultQueue;
  }

  initFallback(): void {
    /* try WebGL, 2D Canvas, or other fallback */
    console.error("SYSTEM CAN NOT INITIALIZE WEBGPU");
  }

  async ensureDevice(): Promise<void> {
    // Stop rendering. (If there was already a device, WebGPU calls made before
    // the app notices the device is lost are okay - they are no-ops.)
    this.device = null;

    // Keep current adapter (but make a new one if there isn't a current one.)
    // If we can't get an adapter, ensureDevice rejects and the app falls back.
    await this.ensureAdapter();

    try {
      await this.ensureDeviceOnCurrentAdapter();
      // Got a device.
      return;
    } catch (e) {
      console.error("device request failed", e);
      // That failed; try a new adapter entirely.
      this.adapter = null;
      // If we can't get a new adapter, it causes ensureDevice to reject and the
      // app to fall back.
      await this.ensureAdapter();
      await this.ensureDeviceOnCurrentAdapter();
    }
  }
  async ensureAdapter(): Promise<void> {
    if (!this.adapter) {
      // If no adapter, get one.
      // (If requestAdapter rejects, no matching adapter is available. Exit to
      // fallback.)
      this.adapter = await navigator.gpu.requestAdapter({
        /* options */
        powerPreference: "low-power",
        //        powerPreference: "high-performance",
      });
    }
  }
  async ensureDeviceOnCurrentAdapter(): Promise<void> {
    this.device = await this.adapter.requestDevice({
      /* options */
    });
    this.device.lost.then((info) => {
      // Device was lost.
      console.error("device lost", info);
      // Try to get a device again.
      this.ensureDevice();
    });
  }

  initCanvas(id: string): void {
    const canvas: HTMLCanvasElement = document.getElementById(
      id
    ) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error("Failed to get requested canvas element");
    }
    this.canvas = canvas;
    this.renderWidth = canvas.clientWidth * window.devicePixelRatio;
    this.renderHeight = canvas.clientHeight * window.devicePixelRatio;
    canvas.width = this.renderWidth;
    canvas.height = this.renderHeight;

    const context: GPUCanvasContext = (canvas.getContext(
      "gpupresent"
    ) as unknown) as GPUCanvasContext;

    // Create Swapchain
    const swapChainDesc: GPUSwapChainDescriptor = {
      device: this.device,
      format: "bgra8unorm",
      usage: GPUTextureUsage.OUTPUT_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };
    this.swapchain = context.configureSwapChain(swapChainDesc);
    console.log("Swap chain created");

    // Create Depth Backing
    const depthTextureDesc: GPUTextureDescriptor = {
      size: {
        width: this.renderWidth,
        height: this.renderHeight,
        depth: 1,
      },
      // arrayLayerCount: 1,
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: "2d",
      format: "depth24plus-stencil8",
      usage: GPUTextureUsage.OUTPUT_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };

    this.depthTexture = this.device.createTexture(depthTextureDesc);
    this.depthTextureView = this.depthTexture.createView();

    this.colorTexture = this.swapchain.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();

    console.log("Created swapchain texture images");
  }

  createMesh(
    vertices: Float32Array,
    normals: Float32Array | null,
    colors: Float32Array | null,
    indices: Uint16Array
  ): Mesh {
    return new Mesh(this.device, vertices, normals, colors, indices);
  }

  async loadAllShaders(): Promise<void> {
    this.triangleShader = new Shader(triangle_vert_spv, triangle_frag_spv);
    await this.triangleShader.load(this.device);
    this.volumeShader = new Shader(volume_vert_spv, volume_frag_spv);
    await this.volumeShader.load(this.device);
  }

  // Helper function for creating GPUBuffer(s) out of Typed Arrays
  createBuffer(arr: Float32Array | Uint16Array, usage: number): GPUBuffer {
    const desc = { size: arr.byteLength, usage, mappedAtCreation: true };
    console.log("CreateBuffer Mapped " + arr.byteLength);
    const buffer = this.device.createBuffer(desc);
    const bufferMapped = buffer.getMappedRange(0, arr.byteLength);

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
  encodeCommands(camera: Camera): void {
    const colorAttachment: GPURenderPassColorAttachmentDescriptor = {
      attachment: this.colorTextureView,
      loadValue: { r: 0, g: 0, b: 0, a: 1 },
      storeOp: "store",
    };

    const depthAttachment: GPURenderPassDepthStencilAttachmentDescriptor = {
      attachment: this.depthTextureView,
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
    const upload = this.device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    const mapping = upload.getMappedRange(0, 16 * 4);

    new Float32Array(mapping).set(projView);
    upload.unmap();

    if (this.scene.length > 0) {
      this.commandEncoder.copyBufferToBuffer(
        upload,
        0,
        this.scene[0].uniformBuffer,
        0,
        16 * 4
      );
    }

    // renderpassdesc describes the framebuffer we are rendering to
    this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
    this.passEncoder.setPipeline(this.scene[0].pipeline);
    this.passEncoder.setBindGroup(0, this.scene[0].shaderuniformbindgroup);
    this.passEncoder.setViewport(
      0,
      0,
      this.renderWidth,
      this.renderHeight,
      0,
      1
    );
    this.passEncoder.setScissorRect(0, 0, this.renderWidth, this.renderHeight);
    this.passEncoder.setVertexBuffer(0, this.scene[0].mesh.getPositionBuffer());
    this.passEncoder.setVertexBuffer(1, this.scene[0].mesh.getColorBuffer());
    this.passEncoder.setIndexBuffer(this.scene[0].mesh.getIndexBuffer());
    this.passEncoder.drawIndexed(3, 1, 0, 0, 0);
    this.passEncoder.endPass();

    this.queue.submit([this.commandEncoder.finish()]);
  }

  render(camera: Camera): void {
    // Acquire next image from swapchain
    this.colorTexture = this.swapchain.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();

    // Write and submit commands to queue
    this.encodeCommands(camera);
  }

  addSceneObject(
    pipeline: GPURenderPipeline,
    myMesh: Mesh,
    shaderuniformbindgroup: GPUBindGroup,
    uniformBuffer: GPUBuffer
  ): void {
    this.scene.push({
      pipeline,
      mesh: myMesh,
      shaderuniformbindgroup,
      uniformBuffer,
      transform: mat4.create(),
    });
  }
}
