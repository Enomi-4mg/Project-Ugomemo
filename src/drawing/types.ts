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
};

export type Snapshot = {
  frames: Frame[];
  currentPageIndex: number;
  activeLayerId: string;
};
