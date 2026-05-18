export type StrokeShapeId = "round" | "square";

export type StampMask = {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
};

export type StrokeShapeOptions = {
  antiAlias: boolean;
};

export type StrokeShapeDefinition = {
  id: StrokeShapeId;
  name: string;
  createMask: (size: number, options: StrokeShapeOptions) => StampMask;
};
