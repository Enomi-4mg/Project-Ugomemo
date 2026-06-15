import type { StampMask } from "../../../strokeShapes";
import { imageDataToStampMask, normalizeBrushTipMaskSourceMode } from "./imageDataToStampMask";
import type { BrushTipMaskSourceMode } from "../../tips/types";

export async function loadBitmapStamp(
  source: string,
  options: {
    maskSourceMode?: BrushTipMaskSourceMode;
  } = {},
): Promise<StampMask> {
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
  return imageDataToStampMask(pixels, normalizeBrushTipMaskSourceMode(options.maskSourceMode));
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load bitmap stamp: ${source}`));
    image.src = source;
  });
}
