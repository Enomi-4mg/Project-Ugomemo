import type { StampMask } from "../../../strokeShapes";

export async function loadBitmapStamp(source: string): Promise<StampMask> {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);

  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = pixels.data[index * 4 + 3];
  }

  return { width: canvas.width, height: canvas.height, alpha };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load bitmap stamp: ${source}`));
    image.src = source;
  });
}
