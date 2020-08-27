import { IRenderTarget } from "./api";

class CanvasRenderTarget implements IRenderTarget {
  private canvas: HTMLCanvasElement = null;
  private device: GPUDevice = null;
  private swapchain: GPUSwapChain = null;

  private depthTexture: GPUTexture = null;
  private depthTextureView: GPUTextureView = null;
  // the color texture ref will be swapped as part of the swapchain
  private colorTexture: GPUTexture = null;
  private colorTextureView: GPUTextureView = null;

  private renderWidth: number = 0;
  private renderHeight: number = 0;

  constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
    this.canvas = canvas;
    this.device = device;

    this.renderWidth = canvas.clientWidth * window.devicePixelRatio;
    this.renderHeight = canvas.clientHeight * window.devicePixelRatio;
    canvas.width = this.renderWidth;
    canvas.height = this.renderHeight;

    const context: GPUCanvasContext = (canvas.getContext(
      "gpupresent"
    ) as unknown) as GPUCanvasContext;

    console.log("Created swapchain texture images");
  }

  setSize(w: number, h: number): void {}

  getWidth(): number {
    return this.renderWidth;
  }

  getHeight(): number {
    return this.renderHeight;
  }

  swap(): void {
    // Acquire next image from swapchain
    this.colorTexture = this.swapchain.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();
  }

  getPixels(): Float32Array {
    return new Float32Array();
  }

  getColorTextureView(): GPUTextureView {
    return this.colorTextureView;
  }

  getDepthTextureView(): GPUTextureView {
    return this.depthTextureView;
  }
}
export default CanvasRenderTarget;
