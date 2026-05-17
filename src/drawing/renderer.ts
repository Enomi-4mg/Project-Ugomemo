import { getCurrentFrame, getPaletteColor } from "./project";
import type { Camera, DrawingProject, Layer } from "./types";

export type RenderOptions = {
  onionSkin?: boolean;
  pageIndex?: number;
};

export function renderProject(canvas: HTMLCanvasElement, project: DrawingProject, options: RenderOptions = {}): void {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.imageSmoothingEnabled = false;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawWorkspaceGrid(context, canvas.width, canvas.height);
  const camera = getFitCamera(canvas, project);
  context.setTransform(camera.zoom, 0, 0, camera.zoom, camera.panX, camera.panY);
  context.imageSmoothingEnabled = false;
  context.fillStyle = getPaletteColor(project, project.backgroundColorId).css;
  context.fillRect(0, 0, project.width, project.height);

  if (options.onionSkin) {
    renderOnionLayer(context, project, (options.pageIndex ?? project.currentPageIndex) - 1, 0.22);
    renderOnionLayer(context, project, (options.pageIndex ?? project.currentPageIndex) + 1, 0.16);
  }

  const frame = options.pageIndex === undefined ? getCurrentFrame(project) : project.frames[options.pageIndex] ?? getCurrentFrame(project);
  const layersByDepth = [...frame.layers].sort((a, b) => b.zDepth - a.zDepth);

  for (const layer of layersByDepth) {
    if (!layer.visible) {
      continue;
    }

    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = project.width;
    layerCanvas.height = project.height;
    const layerContext = layerCanvas.getContext("2d");

    if (!layerContext) {
      continue;
    }

    layerContext.putImageData(layer.imageData, 0, 0);
    context.drawImage(layerCanvas, 0, 0);
  }

  drawCanvasBorder(context, project, camera);
}

export function getFitCamera(canvas: HTMLCanvasElement, project: DrawingProject): Camera {
  const zoom = Math.max(1, Math.floor(Math.min(canvas.width / project.width, canvas.height / project.height)));
  return {
    zoom,
    panX: Math.floor((canvas.width - project.width * zoom) / 2),
    panY: Math.floor((canvas.height - project.height * zoom) / 2),
  };
}

function renderOnionLayer(
  context: CanvasRenderingContext2D,
  project: DrawingProject,
  pageIndex: number,
  alpha: number,
): void {
  const frame = project.frames[pageIndex];
  const layer = frame?.layers.find((candidate) => candidate.id === project.activeLayerId);

  if (!layer || !layer.visible) {
    return;
  }

  const previousAlpha = context.globalAlpha;
  context.globalAlpha = alpha;
  drawLayer(context, project, layer);
  context.globalAlpha = previousAlpha;
}

function drawLayer(context: CanvasRenderingContext2D, project: DrawingProject, layer: Layer): void {
  const layerCanvas = document.createElement("canvas");
  layerCanvas.width = project.width;
  layerCanvas.height = project.height;
  const layerContext = layerCanvas.getContext("2d");

  if (!layerContext) {
    return;
  }

  layerContext.putImageData(layer.imageData, 0, 0);
  context.drawImage(layerCanvas, 0, 0);
}

function drawWorkspaceGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ff4fa3";

  for (let x = 0; x < width; x += 32) {
    context.fillRect(x, 0, 1, height);
  }

  for (let y = 0; y < height; y += 32) {
    context.fillRect(0, y, width, 1);
  }
}

function drawCanvasBorder(context: CanvasRenderingContext2D, project: DrawingProject, camera: Camera): void {
  context.strokeStyle = "#ff4fa3";
  context.lineWidth = 1 / camera.zoom;
  context.strokeRect(0, 0, project.width, project.height);
}
