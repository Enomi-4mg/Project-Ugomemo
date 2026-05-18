import { getStrokeShapeDefinition } from "../strokeShapes";
import { createBrushSettings } from "./settings";
import { placeBrushStamps } from "./stampPlacement";
import { renderStamps } from "./stampRenderer";
import type { BrushPoint, StampColor, StampPatternSampler } from "./types";
import type { StrokeShapeId } from "../strokeShapes";

export function renderBrushStroke(args: {
  context: CanvasRenderingContext2D;
  points: BrushPoint[];
  color: StampColor;
  size: number;
  spacingPercent: number;
  scatterPercent: number;
  stampShape: StrokeShapeId;
  antiAlias: boolean;
  seed: number;
  patternAlphaAt?: StampPatternSampler;
}): void {
  const settings = createBrushSettings(args);
  const shape = getStrokeShapeDefinition(settings.stampShape);
  const mask = shape.createMask(settings.size, { antiAlias: settings.antiAlias });
  const stamps = placeBrushStamps(args.points, settings);

  renderStamps({
    context: args.context,
    stamps,
    mask,
    color: args.color,
    patternAlphaAt: args.patternAlphaAt,
  });
}
