import type { StampMask } from "../../strokeShapes";

export function resizeStampMask(mask: StampMask, size: number, antiAlias: boolean): StampMask {
  const maxSide = Math.max(1, Math.floor(size));
  const sourceMaxSide = Math.max(mask.width, mask.height);
  if (sourceMaxSide <= 0) {
    return { width: maxSide, height: maxSide, alpha: new Uint8ClampedArray(maxSide * maxSide) };
  }

  const scale = maxSide / sourceMaxSide;
  const width = Math.max(1, Math.round(mask.width * scale));
  const height = Math.max(1, Math.round(mask.height * scale));
  if (width === mask.width && height === mask.height) {
    return mask;
  }

  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) / width) * mask.width - 0.5;
      const sourceY = ((y + 0.5) / height) * mask.height - 0.5;
      alpha[y * width + x] = antiAlias ? sampleBilinear(mask, sourceX, sourceY) : sampleNearest(mask, sourceX, sourceY);
    }
  }

  return { width, height, alpha };
}

function sampleNearest(mask: StampMask, x: number, y: number): number {
  const sourceX = clamp(Math.round(x), 0, mask.width - 1);
  const sourceY = clamp(Math.round(y), 0, mask.height - 1);
  return mask.alpha[sourceY * mask.width + sourceX];
}

function sampleBilinear(mask: StampMask, x: number, y: number): number {
  const x0 = clamp(Math.floor(x), 0, mask.width - 1);
  const y0 = clamp(Math.floor(y), 0, mask.height - 1);
  const x1 = clamp(x0 + 1, 0, mask.width - 1);
  const y1 = clamp(y0 + 1, 0, mask.height - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);

  const top = lerp(mask.alpha[y0 * mask.width + x0], mask.alpha[y0 * mask.width + x1], tx);
  const bottom = lerp(mask.alpha[y1 * mask.width + x0], mask.alpha[y1 * mask.width + x1], tx);
  return Math.round(lerp(top, bottom, ty));
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

