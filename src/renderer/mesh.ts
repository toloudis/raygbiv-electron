import { createGPUBuffer } from "./bufferUtil";

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
    this.positionBuffer = createGPUBuffer(
      vertices.buffer,
      GPUBufferUsage.VERTEX,
      device
    );
    this.colorBuffer = colors
      ? createGPUBuffer(colors.buffer, GPUBufferUsage.VERTEX, device)
      : null;
    this.indexBuffer = createGPUBuffer(
      indices.buffer,
      GPUBufferUsage.INDEX,
      device
    );
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
  getIndexFormat(): GPUIndexFormat {
    return "uint16";
  }
}
