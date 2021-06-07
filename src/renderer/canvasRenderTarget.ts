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

    const context: GPUCanvasContext = canvas.getContext(
      "gpupresent"
    ) as unknown as GPUCanvasContext;

    // Create Swapchain
    const swapChainDesc: GPUSwapChainDescriptor = {
      device: this.device,
      format: "bgra8unorm", //context.getSwapChainPreferredFormat(this.device.adapter),
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };
    this.swapchain = context.configureSwapChain(swapChainDesc);
    console.log("Swap chain created");

    // Create Depth Backing
    const depthTextureDesc: GPUTextureDescriptor = {
      size: {
        width: this.renderWidth,
        height: this.renderHeight,
      },
      // arrayLayerCount: 1,
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: "2d",
      format: "depth24plus-stencil8",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };

    this.depthTexture = this.device.createTexture(depthTextureDesc);
    this.depthTextureView = this.depthTexture.createView();

    this.colorTexture = this.swapchain.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();

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
