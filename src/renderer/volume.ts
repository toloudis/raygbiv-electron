import { createGPUBuffer } from "./bufferUtil";
import { createCube } from "./geometries";

export default class Volume {
  private positionBuffer: GPUBuffer = null;
  private indexBuffer: GPUBuffer = null;
  private volumeBuffer: GPUTexture = null;
  private volumeBufferView: GPUTextureView = null;
  // in pixels
  private dims: [number, number, number] = [0, 0, 0];
  // in world units
  private physicalDims: [number, number, number] = [0, 0, 0];
  private tiling: [number, number, number] = [0, 0, 0];

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
    this.dims = [x, y, z];
    this.physicalDims = [px, py, pz];

    this.tiling = [1, 1, 1];
    this.volumeBuffer = createVolumeTexture(
      device,
      volumedata,
      x,
      y,
      z,
      GPUTextureUsage.TEXTURE_BINDING
    );
    // this.tiling = computeTiling(x, y, z);
    // this.volumeBuffer = createTiledVolumeTexture(
    //   device,
    //   volumedata,
    //   x,
    //   y,
    //   z,
    //   this.tiling[0],
    //   this.tiling[1],
    //   GPUTextureUsage.TEXTURE_BINDING
    // );
    this.volumeBufferView = this.volumeBuffer.createView();

    // unit cube
    const cubedata = createCube({ dimensions: [px, py, pz] });

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

  getDims(): [number, number, number] {
    // TODO return copy
    return this.dims;
  }
  getPhysicalDims(): [number, number, number] {
    // TODO return copy
    return this.physicalDims;
  }
  getTiling(): [number, number, number] {
    return this.tiling;
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
    dimension: "3d",
    format: "r8unorm",
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

function computeTiling(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  // compute rows and cols and atlas width and ht, given tw and th
  let nextrows = 1;
  let nextcols = z;
  let ratio = (nextcols * x) / (nextrows * y);
  let nrows = nextrows;
  let ncols = nextcols;
  while (ratio > 1) {
    nrows = nextrows;
    ncols = nextcols;
    nextcols -= 1;
    nextrows = Math.ceil(z / nextcols);
    ratio = (nextcols * x) / (nextrows * y);
  }
  const atlaswidth = ncols * x;
  const atlasheight = nrows * y;
  return [ncols, nrows, 1];
}

function createTiledVolumeTexture(
  device: GPUDevice,
  data: Uint8Array,
  x: number,
  y: number,
  z: number,
  ntilesX: number,
  ntilesY: number,
  usage: GPUTextureUsageFlags
): GPUTexture {
  const atlaswidth = ntilesX * x;
  const atlasheight = ntilesY * y;

  // must be multiple of 4 bytes.
  // if not, then we need to copy into a new buffer with the proper stride
  // for now, assume
  const bytesPerRow = atlaswidth;
  if (bytesPerRow % 256 > 0) {
    console.error("Volume texture needs row stride of multiple of 256");
  }

  const texture = device.createTexture({
    size: {
      width: atlaswidth,
      height: atlasheight,
    },
    dimension: "2d",
    format: "r8unorm",
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
      rowsPerImage: atlasheight,
    },
    {
      texture: texture,
    },
    {
      width: atlaswidth,
      height: atlasheight,
    }
  );

  device.queue.submit([commandEncoder.finish()]);
  textureDataBuffer.destroy();

  return texture;
}
