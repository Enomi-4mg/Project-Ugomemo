import type { StampMask, StrokeShapeDefinition, StrokeShapeOptions } from "./types";

export function createRoundMask(size: number, options: StrokeShapeOptions): StampMask {
  const width = Math.max(1, Math.floor(size));
  const height = width;
  const alpha = new Uint8ClampedArray(width * height);
  const radius = width / 2;
  const center = (width - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const index = y * width + x;

      if (!options.antiAlias) {
        alpha[index] = distance <= radius ? 255 : 0;
        continue;
      }

      const edge = radius - distance;
      if (edge >= 0.5) {
        alpha[index] = 255;
      } else if (edge > -0.5) {
        alpha[index] = Math.round((edge + 0.5) * 255);
      } else {
        alpha[index] = 0;
      }
    }
  }

  return { width, height, alpha };
}

export const roundStrokeShape: StrokeShapeDefinition = {
  id: "round",
  name: "Round",
  createMask: createRoundMask,
};
