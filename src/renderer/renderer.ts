import { mat4 } from "gl-matrix";

import { createGPUBuffer } from "./bufferUtil";
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
  private context: GPUCanvasContext = null;

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
      console.log("ADAPTER  :  " + this.adapter.name);
      console.log("FEATURES :  ");
      this.adapter.features.forEach((f) => console.log("    " + f));
      console.log("LIMITS   :");
      console.log(this.adapter.limits);

      await this.loadAllShaders();
    } catch (e) {
      console.error(e);
      this.initFallback();
    }
  }

  async initWebGPU(): Promise<void> {
    await this.ensureDevice();
    // ... Upload resources, etc.
    this.queue = this.device.queue;
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

    this.context = canvas.getContext("webgpu") as unknown as GPUCanvasContext;

    // Create Swapchain
    const swapChainDesc: GPUCanvasConfiguration = {
      device: this.device,
      format: "bgra8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };
    this.context.configure(swapChainDesc);
    console.log("GPU Canvas configured");

    // Create Depth Backing
    const depthTextureDesc: GPUTextureDescriptor = {
      size: {
        width: this.renderWidth,
        height: this.renderHeight,
      },
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: "2d",
      format: "depth24plus-stencil8",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };

    this.depthTexture = this.device.createTexture(depthTextureDesc);
    this.depthTextureView = this.depthTexture.createView();

    this.colorTexture = this.context.getCurrentTexture();
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

  createRenderPipeline(shaderobj: Shader): GPURenderPipeline {
    // Input Assembly
    const vertexState = shaderobj.getVertexStateDesc();

    // Depth/Stencil State
    const depthStencilState: GPUDepthStencilState = {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    };

    // Blend State
    const colorState: GPUColorTargetState = {
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

    // Rasterization
    const rasterizationState: GPUPrimitiveState = {
      frontFace: "cw",
      cullMode: "none",
      topology: "triangle-list",
    };

    // Create the Pipeline
    const pipelineDesc: GPURenderPipelineDescriptor = {
      layout: shaderobj.getPipelineLayout(),

      vertex: shaderobj.getVertexStage(),
      // array of "output" slots
      fragment: { ...shaderobj.getFragmentStage(), targets: [colorState] },

      depthStencil: depthStencilState,
      primitive: rasterizationState,
    };
    return this.device.createRenderPipeline(pipelineDesc);
  }

  // Write commands to send to the GPU
  encodeCommands(camera: Camera): void {
    const colorAttachment: GPURenderPassColorAttachment = {
      view: this.colorTextureView,
      loadValue: { r: 0, g: 0, b: 0, a: 1 },
      storeOp: "store",
    };

    const depthAttachment: GPURenderPassDepthStencilAttachment = {
      view: this.depthTextureView,
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
    for (let i = 0; i < this.scene.length; ++i) {
      // apply the model transform
      const projViewModel = mat4.mul(
        mat4.create(),
        projView,
        this.scene[i].transform
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
        this.scene[i].uniformBuffer,
        0,
        16 * 4
      );
    }

    // renderpassdesc describes the framebuffer we are rendering to
    this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
    this.passEncoder.setViewport(
      0,
      0,
      this.renderWidth,
      this.renderHeight,
      0,
      1
    );
    this.passEncoder.setScissorRect(0, 0, this.renderWidth, this.renderHeight);

    for (let i = 0; i < this.scene.length; ++i) {
      this.passEncoder.setPipeline(this.scene[i].pipeline);
      this.passEncoder.setBindGroup(0, this.scene[i].shaderuniformbindgroup);
      this.passEncoder.setVertexBuffer(
        0,
        this.scene[i].mesh.getPositionBuffer()
      );
      this.passEncoder.setVertexBuffer(1, this.scene[i].mesh.getColorBuffer());
      this.passEncoder.setIndexBuffer(
        this.scene[i].mesh.getIndexBuffer(),
        "uint16"
      );
      this.passEncoder.drawIndexed(3, 1, 0, 0, 0);
    }
    this.passEncoder.endPass();

    this.queue.submit([this.commandEncoder.finish()]);
  }

  render(camera: Camera): void {
    // Acquire next image from swapchain
    this.colorTexture = this.context.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();

    // Write and submit commands to queue
    this.encodeCommands(camera);
  }

  addSceneObject(
    pipeline: GPURenderPipeline,
    myMesh: Mesh,
    shaderobj: Shader,
    transform: mat4
  ): void {
    const uniformData = new Float32Array([
      // ♟️ ModelViewProjection Matrix
      1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
      1.0,

      // 🔴 Primary Color
      0.9, 0.1, 0.3, 1.0,

      // 🟣 Accent Color
      0.8, 0.2, 0.8, 1.0,
    ]);

    // stick this data into a gpu buffer
    const uniformBuffer: GPUBuffer = createGPUBuffer(
      uniformData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      this.device
    );
    // attach this buffer to the shader
    const shaderuniformbindgroup =
      shaderobj.createShaderBindGroup(uniformBuffer);

    this.scene.push({
      pipeline,
      mesh: myMesh,
      shaderuniformbindgroup,
      uniformBuffer,
      transform,
    });
  }
}
