import type React from "react";
import { getCurrentLayers, replaceCurrentLayers } from "./project";
import { getFitCamera } from "./renderer";
import type { DrawingProject, Layer, PaletteColor, Tool } from "./types";

export type StrokeOptions = {
  size: number;
  shape: "square" | "round";
};

export function drawLine(
  project: DrawingProject,
  layerId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  tool: Tool,
  color: PaletteColor["rgba"],
  options: StrokeOptions = { size: 1, shape: "square" },
): DrawingProject {
  const layer = getLayer(project, layerId);
  const nextLayer = cloneLayer(layer);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.max(0.35, options.size * 0.35);
  const steps = Math.max(1, Math.ceil(distance / step));

  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const x = Math.round(from.x + dx * progress);
    const y = Math.round(from.y + dy * progress);
    stamp(nextLayer, x, y, tool, color, options);
  }

  return replaceLayer(project, nextLayer);
}

export function floodFill(
  project: DrawingProject,
  layerId: string,
  origin: { x: number; y: number },
  color: PaletteColor["rgba"],
): DrawingProject {
  const layer = cloneLayer(getLayer(project, layerId));

  if (!inBounds(layer, origin.x, origin.y)) {
    return project;
  }

  const target = readPixel(layer, origin.x, origin.y);
  if (sameColor(target, color)) {
    return project;
  }

  const stack = [origin];

  while (stack.length > 0) {
    const point = stack.pop();
    if (!point || !inBounds(layer, point.x, point.y)) {
      continue;
    }

    if (!sameColor(readPixel(layer, point.x, point.y), target)) {
      continue;
    }

    writePixel(layer, point.x, point.y, color);
    stack.push({ x: point.x + 1, y: point.y });
    stack.push({ x: point.x - 1, y: point.y });
    stack.push({ x: point.x, y: point.y + 1 });
    stack.push({ x: point.x, y: point.y - 1 });
  }

  return replaceLayer(project, layer);
}

export function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent | React.PointerEvent,
  project: DrawingProject,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const camera = getFitCamera(canvas, project);
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;

  return {
    x: Math.floor((canvasX - camera.panX) / camera.zoom),
    y: Math.floor((canvasY - camera.panY) / camera.zoom),
  };
}

function stamp(
  layer: Layer,
  centerX: number,
  centerY: number,
  tool: Tool,
  color: PaletteColor["rgba"],
  options: StrokeOptions,
): void {
  const radius = Math.floor(options.size / 2);

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const isRound = options.shape === "round";
      const distance = Math.hypot(offsetX, offsetY);

      if (isRound && distance > radius + 0.15) {
        continue;
      }

      applyPixel(layer, centerX + offsetX, centerY + offsetY, tool, color);
    }
  }
}

function applyPixel(layer: Layer, x: number, y: number, tool: Tool, color: PaletteColor["rgba"]): void {
  if (!inBounds(layer, x, y)) {
    return;
  }

  if (tool === "eraser") {
    writePixel(layer, x, y, [0, 0, 0, 0]);
    return;
  }

  writePixel(layer, x, y, color);
}

function getLayer(project: DrawingProject, layerId: string): Layer {
  const layer = getCurrentLayers(project).find((candidate) => candidate.id === layerId);
  if (!layer) {
    throw new Error(`Layer not found: ${layerId}`);
  }
  return layer;
}

function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    imageData: new ImageData(new Uint8ClampedArray(layer.imageData.data), layer.imageData.width, layer.imageData.height),
  };
}

function replaceLayer(project: DrawingProject, nextLayer: Layer): DrawingProject {
  return replaceCurrentLayers(
    project,
    getCurrentLayers(project).map((layer) => (layer.id === nextLayer.id ? nextLayer : layer)),
  );
}

function inBounds(layer: Layer, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < layer.imageData.width && y < layer.imageData.height;
}

function readPixel(layer: Layer, x: number, y: number): [number, number, number, number] {
  const index = (y * layer.imageData.width + x) * 4;
  const data = layer.imageData.data;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function writePixel(layer: Layer, x: number, y: number, color: PaletteColor["rgba"]): void {
  const index = (y * layer.imageData.width + x) * 4;
  layer.imageData.data[index] = color[0];
  layer.imageData.data[index + 1] = color[1];
  layer.imageData.data[index + 2] = color[2];
  layer.imageData.data[index + 3] = color[3];
}

function sameColor(a: PaletteColor["rgba"], b: PaletteColor["rgba"]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
