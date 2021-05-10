import { mypad } from "./bufferUtil";

export async function createTextureFromImage(
  device: GPUDevice,
  src: string,
  usage: GPUTextureUsageFlags
): Promise<GPUTexture> {
  const img = document.createElement("img");
  img.src = src;
  await img.decode();

  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = img.width;
  imageCanvas.height = img.height;

  const imageCanvasContext = imageCanvas.getContext("2d");
  imageCanvasContext.translate(0, img.height);
  imageCanvasContext.scale(1, -1);
  imageCanvasContext.drawImage(img, 0, 0, img.width, img.height);
  const imageData = imageCanvasContext.getImageData(
    0,
    0,
    img.width,
    img.height
  );

  let data = null;

  const bytesPerRow = Math.ceil((img.width * 4) / 256) * 256;
  if (bytesPerRow == img.width * 4) {
    data = imageData.data;
  } else {
    data = new Uint8Array(bytesPerRow * img.height);
    let imagePixelIndex = 0;
    for (let y = 0; y < img.height; ++y) {
      for (let x = 0; x < img.width; ++x) {
        const i = x * 4 + y * bytesPerRow;
        data[i] = imageData.data[imagePixelIndex];
        data[i + 1] = imageData.data[imagePixelIndex + 1];
        data[i + 2] = imageData.data[imagePixelIndex + 2];
        data[i + 3] = imageData.data[imagePixelIndex + 3];
        imagePixelIndex += 4;
      }
    }
  }

  const texture = device.createTexture({
    size: {
      width: img.width,
      height: img.height,
    },
    format: "rgba8unorm",
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
      rowsPerImage: img.height,
    },
    {
      texture: texture,
    },
    {
      width: img.width,
      height: img.height,
    }
  );

  device.queue.submit([commandEncoder.finish()]);
  textureDataBuffer.destroy();

  return texture;
}
