import type { StampMask, StrokeShapeDefinition, StrokeShapeOptions } from "./types";

export function createSquareMask(size: number, options: StrokeShapeOptions): StampMask {
  const width = Math.max(1, Math.floor(size));
  const height = width;
  const alpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!options.antiAlias || width <= 2) {
        alpha[index] = 255;
        continue;
      }

      const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y);
      alpha[index] = edgeDistance === 0 ? 224 : 255;
    }
  }

  return { width, height, alpha };
}

export const squareStrokeShape: StrokeShapeDefinition = {
  id: "square",
  name: "Square",
  createMask: createSquareMask,
};
