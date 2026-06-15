import type { PaletteColor } from "../types";
import type { StampMask } from "../strokeShapes";
import type { BrushTipId } from "./tips";

export type BrushPoint = {
  x: number;
  y: number;
};

export type BrushRotationMode = "fixed" | "stroke-direction" | "random";
export type BrushSmoothingMode = "inherit" | "nearest" | "smooth";
export type EffectiveBrushSmoothingMode = Exclude<BrushSmoothingMode, "inherit">;

export type BrushSettings = {
  size: number;
  spacingPercent: number;
  scatterPercent: number;
  brushTipId: BrushTipId;
  antiAlias: boolean;
  rotationMode: BrushRotationMode;
  rotationDegrees: number;
  rotationJitterDegrees: number;
  scaleJitter: number;
  smoothing: BrushSmoothingMode;
  effectiveSmoothing: EffectiveBrushSmoothingMode;
  seed: number;
};

export type BrushStamp = BrushPoint & {
  index: number;
  rotationDegrees: number;
  scale: number;
};

export type StampColor = PaletteColor["rgba"];

export type StampPatternSampler = (projectX: number, projectY: number) => number;

export type StampRenderOptions = {
  context: CanvasRenderingContext2D;
  stamps: BrushStamp[];
  masks: StampMask[];
  color: StampColor;
  patternAlphaAt?: StampPatternSampler;
};
