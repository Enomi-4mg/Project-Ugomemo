import type { PaletteColor } from "../types";
import type { StampMask, StrokeShapeId } from "../strokeShapes";

export type BrushPoint = {
  x: number;
  y: number;
};

export type BrushSettings = {
  size: number;
  spacingPercent: number;
  scatterPercent: number;
  stampShape: StrokeShapeId;
  antiAlias: boolean;
  seed: number;
};

export type BrushStamp = BrushPoint & {
  index: number;
};

export type StampColor = PaletteColor["rgba"];

export type StampPatternSampler = (projectX: number, projectY: number) => number;

export type StampRenderOptions = {
  context: CanvasRenderingContext2D;
  stamps: BrushStamp[];
  mask: StampMask;
  color: StampColor;
  patternAlphaAt?: StampPatternSampler;
};
