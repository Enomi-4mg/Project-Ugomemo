import type { StampMask } from "../../strokeShapes";

export type ProceduralBrushTipId = "round" | "square";
export type BuiltInBitmapBrushTipId = "bitmap-pixel";
export type CustomBitmapBrushTipId = `custom:${string}`;
export type BrushTipId = ProceduralBrushTipId | BuiltInBitmapBrushTipId | CustomBitmapBrushTipId | (string & {});
export type BrushTipMaskSourceMode =
  | "alpha"
  | "luminance"
  | "inverted-luminance"
  | "alpha-luminance"
  | "alpha-inverted-luminance";

export type BrushTipDefinition =
  | {
      id: ProceduralBrushTipId;
      name: string;
      kind: "procedural";
      createMask: (size: number, options: BrushTipOptions) => StampMask;
    }
  | {
      id: BrushTipId;
      name: string;
      kind: "bitmap";
      sourceType: "built-in" | "custom" | "project";
      source: string;
      storedFilePath?: string;
      importedAt?: string;
      maskSourceMode?: BrushTipMaskSourceMode;
    };

export type BrushTipOptions = {
  size: number;
  antiAlias: boolean;
};
