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
