import type { BrushRotationMode, BrushSettings, BrushSmoothingMode, EffectiveBrushSmoothingMode } from "./types";
import type { BrushTipId } from "./tips";

export const DEFAULT_BRUSH_SPACING_PERCENT = 25;
export const DEFAULT_BRUSH_SCATTER_PERCENT = 0;
export const DEFAULT_BRUSH_ROTATION_MODE: BrushRotationMode = "fixed";
export const DEFAULT_BRUSH_ROTATION_DEGREES = 0;
export const DEFAULT_BRUSH_ROTATION_JITTER_DEGREES = 0;
export const DEFAULT_BRUSH_SCALE_JITTER = 0;
export const DEFAULT_BRUSH_SMOOTHING: BrushSmoothingMode = "inherit";

export function createBrushSettings(args: {
  size: number;
  spacingPercent?: number;
  scatterPercent?: number;
  brushTipId: BrushTipId;
  antiAlias?: boolean;
  rotationMode?: BrushRotationMode;
  rotationDegrees?: number;
  rotationJitterDegrees?: number;
  scaleJitter?: number;
  smoothing?: BrushSmoothingMode;
  seed: number;
}): BrushSettings {
  const smoothing = normalizeBrushSmoothing(args.smoothing);
  return {
    size: Math.max(1, Math.floor(args.size)),
    spacingPercent: clampBrushPercent(args.spacingPercent ?? DEFAULT_BRUSH_SPACING_PERCENT),
    scatterPercent: clampBrushPercent(args.scatterPercent ?? DEFAULT_BRUSH_SCATTER_PERCENT),
    brushTipId: args.brushTipId,
    antiAlias: args.antiAlias ?? false,
    rotationMode: normalizeBrushRotationMode(args.rotationMode),
    rotationDegrees: normalizeFiniteNumber(args.rotationDegrees, DEFAULT_BRUSH_ROTATION_DEGREES),
    rotationJitterDegrees: clampNumber(args.rotationJitterDegrees ?? DEFAULT_BRUSH_ROTATION_JITTER_DEGREES, 0, 360),
    scaleJitter: clampNumber(args.scaleJitter ?? DEFAULT_BRUSH_SCALE_JITTER, 0, 1),
    smoothing,
    effectiveSmoothing: getEffectiveBrushSmoothing(smoothing, args.antiAlias ?? false),
    seed: args.seed,
  };
}

export function getBrushStampInterval(size: number, spacingPercent: number): number {
  return Math.max(0.5, Math.max(1, size) * (clampBrushPercent(spacingPercent) / 100));
}

export function clampBrushPercent(value: number): number {
  return Math.min(300, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

export function normalizeBrushRotationMode(value: unknown): BrushRotationMode {
  return value === "stroke-direction" || value === "random" || value === "fixed" ? value : DEFAULT_BRUSH_ROTATION_MODE;
}

export function normalizeBrushSmoothing(value: unknown): BrushSmoothingMode {
  return value === "nearest" || value === "smooth" || value === "inherit" ? value : DEFAULT_BRUSH_SMOOTHING;
}

export function getEffectiveBrushSmoothing(smoothing: BrushSmoothingMode, antiAlias: boolean): EffectiveBrushSmoothingMode {
  if (smoothing === "inherit") {
    return antiAlias ? "smooth" : "nearest";
  }
  return smoothing;
}

function normalizeFiniteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, safeValue));
}
