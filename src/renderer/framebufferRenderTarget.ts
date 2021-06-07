import { IRenderTarget } from "./api";

class FramebufferRenderTarget implements IRenderTarget {
  private device: GPUDevice = null;

  private depthTexture: GPUTexture = null;
  private depthTextureView: GPUTextureView = null;
  // the color texture ref will be swapped as part of the swapchain
  private colorTexture: GPUTexture = null;
  private colorTextureView: GPUTextureView = null;

  private renderWidth: number = 0;
  private renderHeight: number = 0;

  constructor(device: GPUDevice, width: number, height: number) {
    this.device = device;

    this.setSize(width, height);
  }

  setSize(w: number, h: number): void {
    if (w === this.renderWidth && h === this.renderHeight) {
      return;
    }

    this.renderWidth = w;
    this.renderHeight = h;

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

    const colorTextureDesc: GPUTextureDescriptor = {
      size: {
        width: this.renderWidth,
        height: this.renderHeight,
      },
      // arrayLayerCount: 1,
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: "2d",
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };

    this.colorTexture = this.device.createTexture(colorTextureDesc);
    this.colorTextureView = this.colorTexture.createView();
  }

  getWidth(): number {
    return this.renderWidth;
  }

  getHeight(): number {
    return this.renderHeight;
  }

  swap(): void {
    // do nothing? force drawing queue flush?
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
export default FramebufferRenderTarget;
