import type { StampMask } from "../../../strokeShapes";
import type { BrushTipMaskSourceMode } from "../../tips/types";

export const DEFAULT_BRUSH_TIP_MASK_SOURCE_MODE: BrushTipMaskSourceMode = "alpha";

export function normalizeBrushTipMaskSourceMode(value: unknown): BrushTipMaskSourceMode {
  return value === "luminance" ||
    value === "inverted-luminance" ||
    value === "alpha-luminance" ||
    value === "alpha-inverted-luminance" ||
    value === "alpha"
    ? value
    : DEFAULT_BRUSH_TIP_MASK_SOURCE_MODE;
}

export function imageDataToStampMask(imageData: ImageData, maskSourceMode: BrushTipMaskSourceMode = DEFAULT_BRUSH_TIP_MASK_SOURCE_MODE): StampMask {
  const mode = normalizeBrushTipMaskSourceMode(maskSourceMode);
  const alpha = new Uint8ClampedArray(imageData.width * imageData.height);

  for (let index = 0; index < alpha.length; index += 1) {
    const pixelIndex = index * 4;
    const sourceAlpha = imageData.data[pixelIndex + 3];
    const luminance = getLuminance(imageData.data[pixelIndex], imageData.data[pixelIndex + 1], imageData.data[pixelIndex + 2]);
    const invertedLuminance = 255 - luminance;

    if (mode === "luminance") {
      alpha[index] = clampMaskAlpha(luminance);
    } else if (mode === "inverted-luminance") {
      alpha[index] = clampMaskAlpha(invertedLuminance);
    } else if (mode === "alpha-luminance") {
      alpha[index] = clampMaskAlpha((sourceAlpha * luminance) / 255);
    } else if (mode === "alpha-inverted-luminance") {
      alpha[index] = clampMaskAlpha((sourceAlpha * invertedLuminance) / 255);
    } else {
      alpha[index] = sourceAlpha;
    }
  }

  return { width: imageData.width, height: imageData.height, alpha };
}

function getLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function clampMaskAlpha(value: number): number {
  return Math.min(255, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}
