import { mypad } from "./bufferUtil";
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
    this.volumeBufferView = this.volumeBuffer.createView({
      //format?: GPUTextureFormat;
      dimension: "3d" as GPUTextureViewDimension,
      //aspect?: GPUTextureAspect;
      //baseArrayLayer?: number;
      //baseMipLevel?: number;
      //arrayLayerCount?: number;
      //mipLevelCount?: number;
    });

    // Helper function for creating GPUBuffer(s) out of Typed Arrays
    const createBuffer = (arr: Float32Array | Uint16Array, usage: number) => {
      const desc = {
        size: mypad(arr.byteLength),
        usage,
        mappedAtCreation: true,
      };
      console.log("create mesh buffer " + arr.byteLength);
      const buffer = device.createBuffer(desc);
      const bufferMapped = buffer.getMappedRange(0, desc.size);

      const writeArray =
        arr instanceof Uint16Array
          ? new Uint16Array(bufferMapped)
          : new Float32Array(bufferMapped);
      writeArray.set(arr);
      buffer.unmap();
      return buffer;
    };

    // unit cube
    const cubedata = createCube();

    this.positionBuffer = createBuffer(
      cubedata.positions,
      GPUBufferUsage.VERTEX
    );
    this.indexBuffer = createBuffer(cubedata.indices, GPUBufferUsage.INDEX);
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

  const paddedBufferSize = mypad(data.byteLength);
  const textureDataBuffer = device.createBuffer({
    size: paddedBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  const mapping = textureDataBuffer.getMappedRange(0, paddedBufferSize);
  new Uint8Array(mapping).set(data);
  textureDataBuffer.unmap();

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
