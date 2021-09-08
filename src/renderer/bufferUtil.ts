// pad to a multiple of 4
function pad(x: number, modulo: number = 4): number {
  return x % modulo ? x + (modulo - (x % modulo)) : x;
}

// Helper function for creating GPUBuffer(s) out of Typed Arrays
export function createGPUBuffer(
  arr: Float32Array | Uint16Array,
  usage: GPUBufferUsageFlags,
  device: GPUDevice
): GPUBuffer {
  const desc = {
    size: pad(arr.byteLength),
    usage,
    mappedAtCreation: true,
  };
  const buffer = device.createBuffer(desc);
  const bufferMapped = buffer.getMappedRange(0, desc.size);

  const writeArray =
    arr instanceof Uint16Array
      ? new Uint16Array(bufferMapped)
      : new Float32Array(bufferMapped);
  writeArray.set(arr);
  buffer.unmap();
  return buffer;
}
