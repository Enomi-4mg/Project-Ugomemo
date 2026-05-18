import type { StampRenderOptions, StampColor } from "./types";

export function renderStamps(options: StampRenderOptions): void {
  const { context, stamps, mask, color, patternAlphaAt } = options;
  if (stamps.length === 0) {
    return;
  }

  const imageData = context.getImageData(0, 0, context.canvas.width, context.canvas.height);

  for (const stamp of stamps) {
    stampMask(imageData, mask, stamp.x, stamp.y, color, patternAlphaAt);
  }

  context.putImageData(imageData, 0, 0);
}

function stampMask(
  imageData: ImageData,
  mask: { width: number; height: number; alpha: Uint8ClampedArray },
  centerX: number,
  centerY: number,
  color: StampColor,
  patternAlphaAt?: (projectX: number, projectY: number) => number,
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

      const patternAlpha = patternAlphaAt ? patternAlphaAt(x, y) : 1;
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
