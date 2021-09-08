import { createGPUBuffer } from "./bufferUtil";
import { createCube } from "./geometries";

export default class Volume {
  private positionBuffer: GPUBuffer = null;
  private indexBuffer: GPUBuffer = null;
  private volumeBuffer: GPUTexture = null;
  private volumeBufferView: GPUTextureView = null;

  constructor(
    device: GPUDevice,
    volumedata: Uint8Array,
    x: number,
    y: number,
    z: number,
    px: number,
    py: number,
    pz: number
  ) {
    this.volumeBuffer = createVolumeTexture(
      device,
      volumedata,
      x,
      y,
      z,
      GPUTextureUsage.SAMPLED
    );
    this.volumeBufferView = this.volumeBuffer.createView();

    // unit cube
    const cubedata = createCube();

    this.positionBuffer = createGPUBuffer(
      cubedata.positions.buffer,
      GPUBufferUsage.VERTEX,
      device
    );
    this.indexBuffer = createGPUBuffer(
      cubedata.indices.buffer,
      GPUBufferUsage.INDEX,
      device
    );
  }

  getPositionBuffer(): GPUBuffer {
    return this.positionBuffer;
  }
  getIndexBuffer(): GPUBuffer {
    return this.indexBuffer;
  }
  getIndexFormat(): GPUIndexFormat {
    return "uint16";
  }

  getVolumeBufferView(): GPUTextureView {
    return this.volumeBufferView;
  }
}

function createVolumeTexture(
  device: GPUDevice,
  data: Uint8Array,
  x: number,
  y: number,
  z: number,
  usage: GPUTextureUsageFlags
): GPUTexture {
  // must be multiple of 4 bytes.
  // if not, then we need to copy into a new buffer with the proper stride
  // for now, assume
  const bytesPerRow = x;
  if (bytesPerRow % 256 > 0) {
    console.error("Volume texture needs row stride of multiple of 256");
  }

  const texture = device.createTexture({
    size: {
      width: x,
      height: y,
      depthOrArrayLayers: z,
    },
    format: "r8uint",
    usage: GPUTextureUsage.COPY_DST | usage,
  });

  const textureDataBuffer = createGPUBuffer(
    data.buffer,
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    device
  );

  const commandEncoder = device.createCommandEncoder({});
  commandEncoder.copyBufferToTexture(
    {
      buffer: textureDataBuffer,
      bytesPerRow,
      rowsPerImage: y,
    },
    {
      texture: texture,
    },
    {
      width: x,
      height: y,
      depthOrArrayLayers: z,
    }
  );

  device.queue.submit([commandEncoder.finish()]);
  textureDataBuffer.destroy();

  return texture;
}
