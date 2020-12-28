import { createCube } from "./geometries";

// pad to a multiple of 4
function mypad(x: number): number {
  return x % 4 ? x + (4 - (x % 4)) : x;
}

export default class Volume {
  private positionBuffer: GPUBuffer = null;
  private indexBuffer: GPUBuffer = null;
  private volumeBuffer: GPUTexture = null;

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

    // Helper function for creating GPUBuffer(s) out of Typed Arrays
    const createBuffer = (arr: Float32Array | Uint16Array, usage: number) => {
      const desc = {
        size: mypad(arr.byteLength),
        usage,
        mappedAtCreation: true,
      };
      console.log("create mesh buffer " + arr.byteLength);
      // @ts-ignore TS2339
      const [buffer, bufferMapped] = device.createBufferMapped(desc);
      //const bufferMapped = buffer.getMappedRange(0, arr.byteLength);

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
  if (bytesPerRow % 4 > 0) {
    console.error("Volume needs row stride of 4");
  }

  const texture = device.createTexture({
    size: {
      width: x,
      height: y,
      depth: z,
    },
    format: "r8uint",
    usage: GPUTextureUsage.COPY_DST | usage,
  });

  // @ts-ignore TS2339
  const [textureDataBuffer, mapping] = device.createBufferMapped({
    size: data.byteLength, // TODO PAD TO 4 bytes
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  //const mapping = textureDataBuffer.getMappedRange(0, data.byteLength);
  new Uint8Array(mapping).set(data);
  textureDataBuffer.unmap();

  const commandEncoder = device.createCommandEncoder({});
  commandEncoder.copyBufferToTexture(
    {
      buffer: textureDataBuffer,
      bytesPerRow,
    },
    {
      texture: texture,
    },
    {
      width: x,
      height: y,
      depth: z,
    }
  );

  device.defaultQueue.submit([commandEncoder.finish()]);
  textureDataBuffer.destroy();

  return texture;
}
