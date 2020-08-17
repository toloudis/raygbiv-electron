// pad to a multiple of 4
function mypad(x: number): number {
  return x % 4 ? x + (4 - (x % 4)) : x;
}

export default class Mesh {
  private positionBuffer: GPUBuffer = null;
  private colorBuffer: GPUBuffer = null;
  private indexBuffer: GPUBuffer = null;

  constructor(
    device: GPUDevice,
    vertices: Float32Array,
    normals: Float32Array | null,
    colors: Float32Array | null,
    indices: Uint16Array
  ) {
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

    this.positionBuffer = createBuffer(vertices, GPUBufferUsage.VERTEX);
    this.colorBuffer = createBuffer(colors, GPUBufferUsage.VERTEX);
    this.indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX);
  }

  getPositionBuffer(): GPUBuffer {
    return this.positionBuffer;
  }
  getColorBuffer(): GPUBuffer {
    return this.colorBuffer;
  }
  getIndexBuffer(): GPUBuffer {
    return this.indexBuffer;
  }
}
