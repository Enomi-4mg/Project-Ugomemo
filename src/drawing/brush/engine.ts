import { createBrushSettings } from "./settings";
import { placeBrushStamps } from "./stampPlacement";
import { renderStamps } from "./stampRenderer";
import type { BrushPoint, BrushRotationMode, BrushSmoothingMode, StampColor, StampPatternSampler } from "./types";
import { resolveBrushTipMask, type BrushTipId } from "./tips";

export async function renderBrushStroke(args: {
  context: CanvasRenderingContext2D;
  points: BrushPoint[];
  color: StampColor;
  size: number;
  spacingPercent: number;
  scatterPercent: number;
  brushTipId: BrushTipId;
  antiAlias: boolean;
  rotationMode?: BrushRotationMode;
  rotationDegrees?: number;
  rotationJitterDegrees?: number;
  scaleJitter?: number;
  smoothing?: BrushSmoothingMode;
  seed: number;
  patternAlphaAt?: StampPatternSampler;
}): Promise<void> {
  const settings = createBrushSettings(args);
  const stamps = placeBrushStamps(args.points, settings);
  const masks = await Promise.all(
    stamps.map((stamp) =>
      resolveBrushTipMask(settings.brushTipId, settings.size, {
        smoothing: settings.effectiveSmoothing,
        rotationDegrees: stamp.rotationDegrees,
        scale: stamp.scale,
      }),
    ),
  );

  renderStamps({
    context: args.context,
    stamps,
    masks,
    color: args.color,
    patternAlphaAt: args.patternAlphaAt,
  });
}
