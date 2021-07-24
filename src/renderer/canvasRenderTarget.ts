import { IRenderTarget } from "./api";

class CanvasRenderTarget implements IRenderTarget {
  private canvas: HTMLCanvasElement = null;
  private device: GPUDevice = null;
  private context: GPUPresentationContext = null;

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

    this.setSize(
      canvas.clientWidth * window.devicePixelRatio,
      canvas.clientHeight * window.devicePixelRatio
    );

    // add a ResizeObserver for the canvas, to get the swap chain textures updated:
    const resizeObserver = new ResizeObserver(
      (entries: ResizeObserverEntry[]) => {
        for (const entry of entries) {
          if (entry.target !== this.canvas) {
            continue;
          }
          this.setSize(
            entry.contentBoxSize[0].inlineSize,
            entry.contentBoxSize[0].blockSize
          );
        }
      }
    );
    resizeObserver.observe(this.canvas);
  }

  setSize(w: number, h: number): void {
    if (w === this.renderWidth && h === this.renderHeight) {
      return;
    }

    this.renderWidth = w;
    this.renderHeight = h;

    this.canvas.width = this.renderWidth;
    this.canvas.height = this.renderHeight;

    this.context = this.canvas.getContext(
      "webgpu"
    ) as unknown as GPUPresentationContext;

    this.context.configure({
      device: this.device,
      format: "bgra8unorm", //context.getSwapChainPreferredFormat(this.device.adapter),
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      // size: {
      //   width: entry.contentBoxSize[0].inlineSize,
      //   height: entry.contentBoxSize[0].blockSize,
      // },
    });
    console.log("Canvas Swap chain configured");

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

    this.colorTexture = this.context.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();
  }

  getWidth(): number {
    return this.renderWidth;
  }

  getHeight(): number {
    return this.renderHeight;
  }

  swap(): void {
    // Acquire next image from swapchain
    this.colorTexture = this.context.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();
  }

  async getPixels(): Promise<ArrayBuffer> {
    const bufferSize = this.renderHeight * this.renderWidth * 4;
    // create gpu buffer
    const outBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const cmdenc = this.device.createCommandEncoder();
    cmdenc.copyTextureToBuffer(
      { texture: this.colorTexture },
      { buffer: outBuffer },
      { width: this.renderWidth, height: this.renderHeight }
    );
    this.device.queue.submit([cmdenc.finish()]);
    // wait for completion?
    await this.device.queue.onSubmittedWorkDone();

    await outBuffer.mapAsync(GPUMapMode.READ, 0, bufferSize);
    const arraybuf = outBuffer.getMappedRange(); //0, buffersize);
    outBuffer.unmap();
    // destroy gpu buffer?
    outBuffer.destroy();
    // is arraybuf still valid?
    return arraybuf;
  }

  getColorTextureView(): GPUTextureView {
    return this.colorTextureView;
  }

  getDepthTextureView(): GPUTextureView {
    return this.depthTextureView;
  }
}
export default CanvasRenderTarget;
