// pad to a multiple of 4
function pad(x: number, modulo = 4): number {
  return x % modulo ? x + (modulo - (x % modulo)) : x;
}

// Helper function for creating GPUBuffer(s) out of Typed Arrays
export function createGPUBuffer(
  arr: ArrayBuffer,
  usage: GPUBufferUsageFlags,
  device: GPUDevice
) {
  const desc = {
    size: pad(arr.byteLength),
    usage,
    mappedAtCreation: true,
  };
  const buffer = device.createBuffer(desc);
  const bufferMapped = buffer.getMappedRange(0, desc.size);

  const writeArray = new Uint8Array(bufferMapped);
  writeArray.set(new Uint8Array(arr));
  buffer.unmap();
  return buffer;
}

export function createGeometryBuffers(
  vertex_data: ArrayBuffer,
  index_data: ArrayBuffer,
  device: GPUDevice
): { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer } {
  // Create vertex buffer, and upload data
  const vertexBuffer = createGPUBuffer(
    vertex_data,
    GPUBufferUsage.VERTEX,
    device
  );
  // Create index buffer, and upload data
  const indexBuffer = createGPUBuffer(index_data, GPUBufferUsage.INDEX, device);
  return { vertexBuffer, indexBuffer };
}

export function createUniformBuffer(
  initData: ArrayBuffer,
  device: GPUDevice
): GPUBuffer {
  const uniform_buffer = createGPUBuffer(
    initData,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, // | GPUBufferUsage.MAP_WRITE,
    device
  );
  return uniform_buffer;
}

export function concatArrayBuffers(...bufs: ArrayBuffer[]): ArrayBuffer {
  // add up all buffer sizes
  const totalSize = bufs.reduce(
    (accumSize: number, buf: ArrayBuffer) => accumSize + buf.byteLength,
    0
  );
  const result = new Uint8Array(totalSize);
  // copy each buffer into result buffer
  bufs.reduce((offset, buf) => {
    const bufView = new Uint8Array(buf);
    result.set(bufView, offset);
    return offset + buf.byteLength;
  }, 0);
  return result.buffer;
}
