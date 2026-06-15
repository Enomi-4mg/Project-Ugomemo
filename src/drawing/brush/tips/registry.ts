import { createRoundMask } from "../../strokeShapes/round";
import { createSquareMask } from "../../strokeShapes/square";
import type { BrushTipDefinition, BrushTipId } from "./types";

const BITMAP_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZThNwAAAABJRU5ErkJggg==";

export const brushTipDefinitions: Record<BrushTipId, BrushTipDefinition> = {
  round: {
    id: "round",
    name: "Round",
    kind: "procedural",
    createMask: (size, options) => createRoundMask(size, options),
  },
  square: {
    id: "square",
    name: "Square",
    kind: "procedural",
    createMask: (size, options) => createSquareMask(size, options),
  },
  "bitmap-pixel": {
    id: "bitmap-pixel",
    name: "Bitmap Pixel",
    kind: "bitmap",
    sourceType: "built-in",
    source: BITMAP_PIXEL_PNG,
    maskSourceMode: "alpha",
  },
};

export function getBrushTipDefinition(brushTipId: BrushTipId): BrushTipDefinition {
  return brushTipDefinitions[brushTipId] ?? brushTipDefinitions.round;
}

export function registerCustomBrushTipDefinitions(definitions: BrushTipDefinition[]): void {
  for (const definition of definitions) {
    if (definition.kind !== "bitmap" || (definition.sourceType !== "custom" && definition.sourceType !== "project") || isBuiltInBrushTipId(definition.id)) {
      continue;
    }
    brushTipDefinitions[definition.id] = definition;
  }
}

export function unregisterCustomBrushTipDefinitions(): void {
  for (const [brushTipId, definition] of Object.entries(brushTipDefinitions)) {
    if (definition.kind === "bitmap" && (definition.sourceType === "custom" || definition.sourceType === "project")) {
      delete brushTipDefinitions[brushTipId];
    }
  }
}

export function unregisterProjectBrushTipDefinitions(): void {
  for (const [brushTipId, definition] of Object.entries(brushTipDefinitions)) {
    if (definition.kind === "bitmap" && definition.sourceType === "project") {
      delete brushTipDefinitions[brushTipId];
    }
  }
}

export function isBuiltInBrushTipId(brushTipId: string): brushTipId is "round" | "square" | "bitmap-pixel" {
  return brushTipId === "round" || brushTipId === "square" || brushTipId === "bitmap-pixel";
}
