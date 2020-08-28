import { IGraphics, ISceneRenderer, IRenderTarget } from "./api";
import Mesh from "./mesh";
import Shader from "./shader";

// consider using readFileSync here to skip the fetch step in shader.ts
import triangle_frag_spv from "./shaders/triangle.frag.spv";
import triangle_vert_spv from "./shaders/triangle.vert.spv";
import volume_frag_spv from "./shaders/volume.frag.spv";
import volume_vert_spv from "./shaders/volume.vert.spv";
import MyRenderer from "./renderer";
import CanvasRenderTarget from "./canvasRenderTarget";

class Graphics implements IGraphics {
  private adapter: GPUAdapter = null;
  private device: GPUDevice = null;

  private queue: GPUQueue = null;

  async init(): Promise<void> {
    try {
      if (!navigator.gpu) {
        throw new Error("WebGPU is not supported on this browser.");
      }
      await this.initWebGPU();
      console.log("WebGPU initialized.");
      console.log("ADAPTER:  " + this.adapter.name);
      console.log("EXTENSIONS :  ");
      this.adapter.extensions.forEach((ext) => console.log("    " + ext));
    } catch (e) {
      console.error(e);
      this.initFallback();
    }
  }
  cleanup(): void {}

  async createDefaultRenderer(): Promise<ISceneRenderer> {
    const r = new MyRenderer(this.device);
    await r.initPostCtor();
    return r;
  }

  //createNormalsRenderer(): ISceneRenderer {}

  createCanvasRenderTarget(canvas: HTMLCanvasElement): IRenderTarget {
    return new CanvasRenderTarget(canvas, this.device);
  }

  createMesh(
    indices: Uint16Array,
    vertices: Float32Array,
    normals: Float32Array,
    uvs?: Float32Array
  ): Mesh {
    return new Mesh(this.device, vertices, normals, uvs, indices);
  }

  private async initWebGPU(): Promise<void> {
    await this.ensureDevice();
    // ... Upload resources, etc.
    this.queue = this.device.defaultQueue;
  }

  private initFallback(): void {
    /* try WebGL, 2D Canvas, or other fallback */
    console.error("SYSTEM CAN NOT INITIALIZE WEBGPU");
  }

  private async ensureDevice(): Promise<void> {
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
  private async ensureAdapter(): Promise<void> {
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
  private async ensureDeviceOnCurrentAdapter(): Promise<void> {
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
}
export default Graphics;
