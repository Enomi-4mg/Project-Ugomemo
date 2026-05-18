import type { BrushSettings } from "./types";
import type { StrokeShapeId } from "../strokeShapes";

export const DEFAULT_BRUSH_SPACING_PERCENT = 25;
export const DEFAULT_BRUSH_SCATTER_PERCENT = 0;

export function createBrushSettings(args: {
  size: number;
  spacingPercent?: number;
  scatterPercent?: number;
  stampShape: StrokeShapeId;
  antiAlias?: boolean;
  seed: number;
}): BrushSettings {
  return {
    size: Math.max(1, Math.floor(args.size)),
    spacingPercent: clampBrushPercent(args.spacingPercent ?? DEFAULT_BRUSH_SPACING_PERCENT),
    scatterPercent: clampBrushPercent(args.scatterPercent ?? DEFAULT_BRUSH_SCATTER_PERCENT),
    stampShape: args.stampShape,
    antiAlias: args.antiAlias ?? false,
    seed: args.seed,
  };
}

export function getBrushStampInterval(size: number, spacingPercent: number): number {
  return Math.max(0.5, Math.max(1, size) * (clampBrushPercent(spacingPercent) / 100));
}

export function clampBrushPercent(value: number): number {
  return Math.min(300, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}
