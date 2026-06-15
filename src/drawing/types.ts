export type Tool = "pen" | "brush" | "tone" | "eraser" | "shape";

export type PaletteColor = {
  id: string;
  name: string;
  rgba: [number, number, number, number];
  css: string;
};

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  colorIds: [string, string];
  zDepth: number;
  imageData: ImageData;
};

export type Frame = {
  id: string;
  layers: Layer[];
};

export type Camera = {
  zoom: number;
  panX: number;
  panY: number;
};

export type ProjectBrushAsset = {
  id: string;
  name: string;
  path?: string;
  kind: "bitmap";
  source: "app" | "project";
  storedFilePath?: string;
  maskSourceMode?: "alpha" | "luminance" | "inverted-luminance" | "alpha-luminance" | "alpha-inverted-luminance";
  smoothing?: "inherit" | "nearest" | "smooth";
};

export type DrawingProject = {
  width: number;
  height: number;
  fps: number;
  palette: PaletteColor[];
  backgroundColorId: string;
  frames: Frame[];
  currentPageIndex: number;
  activeLayerId: string;
  camera: Camera;
  brushAssets: ProjectBrushAsset[];
};

export type Snapshot = {
  frames: Frame[];
  currentPageIndex: number;
  activeLayerId: string;
};
