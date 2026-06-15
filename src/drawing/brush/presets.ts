import type { BrushRotationMode, BrushSmoothingMode } from "./types";
import type { BrushTipId, BrushTipMaskSourceMode } from "./tips";

export type BrushPreset = {
  id: string;
  name: string;
  tipId: BrushTipId;
  size: number;
  spacing: number;
  scatter: number;
  rotationMode: BrushRotationMode;
  rotationDegrees: number;
  rotationJitterDegrees: number;
  scaleJitter: number;
  smoothing: BrushSmoothingMode;
  maskSourceMode: BrushTipMaskSourceMode;
  source: "built-in" | "custom" | "project";
};

export const builtInBrushPresets: BrushPreset[] = [
  {
    id: "preset:basic_round",
    name: "Basic Round",
    tipId: "round",
    size: 16,
    spacing: 0.25,
    scatter: 0,
    rotationMode: "fixed",
    rotationDegrees: 0,
    rotationJitterDegrees: 0,
    scaleJitter: 0,
    smoothing: "inherit",
    maskSourceMode: "alpha",
    source: "built-in",
  },
  {
    id: "preset:bitmap_pixel",
    name: "Bitmap Pixel",
    tipId: "bitmap-pixel",
    size: 16,
    spacing: 0.25,
    scatter: 0,
    rotationMode: "fixed",
    rotationDegrees: 0,
    rotationJitterDegrees: 0,
    scaleJitter: 0,
    smoothing: "nearest",
    maskSourceMode: "alpha",
    source: "built-in",
  },
];
