import type { StampRenderOptions, StampColor } from "./types";

export function renderStamps(options: StampRenderOptions): void {
  const { context, stamps, masks, color, patternAlphaAt } = options;
  if (stamps.length === 0) {
    return;
  }

  const bounds = getStampBounds(stamps, masks, context.canvas.width, context.canvas.height);
  if (!bounds) {
    return;
  }

  const imageData = context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);

  for (let index = 0; index < stamps.length; index += 1) {
    const stamp = stamps[index];
    const mask = masks[index];
    if (!mask) {
      continue;
    }
    stampMask(imageData, mask, stamp.x - bounds.x, stamp.y - bounds.y, color, patternAlphaAt, bounds.x, bounds.y);
  }

  context.putImageData(imageData, bounds.x, bounds.y);
}

function getStampBounds(
  stamps: StampRenderOptions["stamps"],
  masks: StampRenderOptions["masks"],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < stamps.length; index += 1) {
    const stamp = stamps[index];
    const mask = masks[index];
    if (!mask) {
      continue;
    }
    const originX = Math.round(stamp.x) - Math.floor(mask.width / 2);
    const originY = Math.round(stamp.y) - Math.floor(mask.height / 2);
    minX = Math.min(minX, originX);
    minY = Math.min(minY, originY);
    maxX = Math.max(maxX, originX + mask.width);
    maxY = Math.max(maxY, originY + mask.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  const x = Math.max(0, Math.floor(minX));
  const y = Math.max(0, Math.floor(minY));
  const right = Math.min(canvasWidth, Math.ceil(maxX));
  const bottom = Math.min(canvasHeight, Math.ceil(maxY));
  if (right <= x || bottom <= y) {
    return null;
  }
  return { x, y, width: right - x, height: bottom - y };
}

function stampMask(
  imageData: ImageData,
  mask: { width: number; height: number; alpha: Uint8ClampedArray },
  centerX: number,
  centerY: number,
  color: StampColor,
  patternAlphaAt?: (projectX: number, projectY: number) => number,
  projectOffsetX = 0,
  projectOffsetY = 0,
): void {
  const originX = Math.round(centerX) - Math.floor(mask.width / 2);
  const originY = Math.round(centerY) - Math.floor(mask.height / 2);

  for (let maskY = 0; maskY < mask.height; maskY += 1) {
    const y = originY + maskY;
    if (y < 0 || y >= imageData.height) {
      continue;
    }

    for (let maskX = 0; maskX < mask.width; maskX += 1) {
      const x = originX + maskX;
      if (x < 0 || x >= imageData.width) {
        continue;
      }

      const shapeAlpha = mask.alpha[maskY * mask.width + maskX] / 255;
      if (shapeAlpha <= 0) {
        continue;
      }

      const patternAlpha = patternAlphaAt ? patternAlphaAt(projectOffsetX + x, projectOffsetY + y) : 1;
      const finalAlpha = Math.round(shapeAlpha * Math.max(0, Math.min(1, patternAlpha)) * 255);
      if (finalAlpha <= 0) {
        continue;
      }

      blendSourceOver(imageData.data, (y * imageData.width + x) * 4, color, finalAlpha);
    }
  }
}

function blendSourceOver(data: Uint8ClampedArray, index: number, color: StampColor, maskAlpha: number): void {
  const sourceAlpha = (color[3] / 255) * (maskAlpha / 255);
  const destinationAlpha = data[index + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  if (outputAlpha <= 0) {
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
    return;
  }

  data[index] = Math.round((color[0] * sourceAlpha + data[index] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  data[index + 1] = Math.round((color[1] * sourceAlpha + data[index + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  data[index + 2] = Math.round((color[2] * sourceAlpha + data[index + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  data[index + 3] = Math.round(outputAlpha * 255);
}
