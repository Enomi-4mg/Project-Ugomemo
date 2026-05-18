import { roundStrokeShape } from "./round";
import { squareStrokeShape } from "./square";
import type { StrokeShapeDefinition, StrokeShapeId } from "./types";

export type { StampMask, StrokeShapeDefinition, StrokeShapeId, StrokeShapeOptions } from "./types";

export const strokeShapeDefinitions: Record<StrokeShapeId, StrokeShapeDefinition> = {
  round: roundStrokeShape,
  square: squareStrokeShape,
};

export function getStrokeShapeDefinition(shapeId: StrokeShapeId): StrokeShapeDefinition {
  return strokeShapeDefinitions[shapeId] ?? strokeShapeDefinitions.round;
}
