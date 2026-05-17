import type { DrawingProject, Frame, Layer, PaletteColor, Snapshot } from "./types";

export const MAX_PAGES = 999;

export const PALETTE: PaletteColor[] = [
  { id: "white", name: "White", rgba: [255, 255, 255, 255], css: "#ffffff" },
  { id: "black", name: "Black", rgba: [0, 0, 0, 255], css: "#000000" },
  { id: "red", name: "Red", rgba: [232, 0, 0, 255], css: "#e80000" },
  { id: "blue", name: "Blue", rgba: [0, 72, 255, 255], css: "#0048ff" },
  { id: "green", name: "Green", rgba: [0, 176, 80, 255], css: "#00b050" },
  { id: "yellow", name: "Yellow", rgba: [255, 224, 0, 255], css: "#ffe000" },
];

const layerDefinitions = [
  ["a", "A", ["white", "black"], 1],
  ["b", "B", ["red", "blue"], 3],
  ["c", "C", ["green", "yellow"], 6],
] as const;

export function createProject(width = 320, height = 240): DrawingProject {
  return {
    width,
    height,
    fps: 6,
    palette: PALETTE,
    backgroundColorId: "white",
    frames: [createFrame(width, height, 0)],
    currentPageIndex: 0,
    activeLayerId: "b",
    camera: {
      zoom: 1,
      panX: 0,
      panY: 0,
    },
  };
}

export function createFrame(width: number, height: number, index: number): Frame {
  return {
    id: `page-${index + 1}`,
    layers: createDefaultLayers(width, height),
  };
}

export function createDefaultLayers(width: number, height: number): Layer[] {
  return layerDefinitions.map(([id, name, colorIds, zDepth]) =>
    createLayer(id, name, width, height, colorIds, zDepth),
  );
}

export function createLayer(
  id: string,
  name: string,
  width: number,
  height: number,
  colorIds: readonly string[] = ["black", "red"],
  zDepth = 1,
): Layer {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  return {
    id,
    name,
    visible: true,
    colorIds: normalizeLayerColors(colorIds),
    zDepth,
    imageData: context.createImageData(width, height),
  };
}

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

export function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    colorIds: [...layer.colorIds],
    imageData: cloneImageData(layer.imageData),
  };
}

export function cloneFrame(frame: Frame): Frame {
  return {
    ...frame,
    layers: frame.layers.map(cloneLayer),
  };
}

export function createSnapshot(project: DrawingProject): Snapshot {
  return {
    frames: project.frames.map(cloneFrame),
    currentPageIndex: project.currentPageIndex,
    activeLayerId: project.activeLayerId,
  };
}

export function restoreSnapshot(project: DrawingProject, snapshot: Snapshot): DrawingProject {
  return {
    ...project,
    frames: snapshot.frames.map(cloneFrame),
    currentPageIndex: Math.min(snapshot.currentPageIndex, Math.max(0, snapshot.frames.length - 1)),
    activeLayerId: snapshot.activeLayerId,
  };
}

export function getPaletteColor(project: DrawingProject, colorId: string): PaletteColor {
  return project.palette.find((color) => color.id === colorId) ?? project.palette[0];
}

export function getActiveLayerColors(project: DrawingProject): PaletteColor[] {
  const layer = getCurrentFrame(project).layers.find((candidate) => candidate.id === project.activeLayerId) ?? getCurrentFrame(project).layers[0];
  return layer.colorIds.map((colorId) => getPaletteColor(project, colorId));
}

export function getCurrentFrame(project: DrawingProject): Frame {
  return project.frames[project.currentPageIndex] ?? project.frames[0];
}

export function getCurrentLayers(project: DrawingProject): Layer[] {
  return getCurrentFrame(project).layers;
}

export function replaceCurrentFrame(project: DrawingProject, frame: Frame): DrawingProject {
  return {
    ...project,
    frames: project.frames.map((candidate, index) => (index === project.currentPageIndex ? frame : candidate)),
  };
}

export function replaceCurrentLayers(project: DrawingProject, layers: Layer[]): DrawingProject {
  return replaceCurrentFrame(project, {
    ...getCurrentFrame(project),
    layers,
  });
}

export function clampPageIndex(project: DrawingProject, pageIndex: number): number {
  return Math.min(Math.max(pageIndex, 0), Math.max(project.frames.length - 1, 0));
}

function normalizeLayerColors(colorIds: readonly string[]): [string, string] {
  return [colorIds[0] ?? "black", colorIds[1] ?? colorIds[0] ?? "black"];
}

export function fillLayer(layer: Layer, color: PaletteColor["rgba"]): void {
  for (let i = 0; i < layer.imageData.data.length; i += 4) {
    layer.imageData.data[i] = color[0];
    layer.imageData.data[i + 1] = color[1];
    layer.imageData.data[i + 2] = color[2];
    layer.imageData.data[i + 3] = color[3];
  }
}
