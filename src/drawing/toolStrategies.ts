import { getFitCamera } from "./renderer";
import { cloneImageData } from "./project";
import { renderBrushStroke } from "./brush/engine";
import { hashStrokeSeed, seededRandom } from "./brush/seededRandom";
import type { BrushRotationMode, BrushSmoothingMode } from "./brush/types";
import type { BrushTipId } from "./brush/tips";
import { getStrokeShapeDefinition, type StampMask, type StrokeShapeId } from "./strokeShapes";
import type { Camera, DrawingProject, Layer, PaletteColor, Tool } from "./types";
import { parseTonePattern, type TonePattern } from "../ui/tone/tonePattern";

export type DrawingToolId = Tool;
export type PenShape = StrokeShapeId;
export type ShapeType = "line" | "ellipse" | "triangle" | "rectangle";
export type ToneMode = "pen" | "bucket";

export type ToolSettings = {
  color: PaletteColor["rgba"];
  size: number;
  toneDensity: number;
  penShape: PenShape;
  brushTipId: BrushTipId;
  brushSpacing: number;
  brushScatter: number;
  rotationMode: BrushRotationMode;
  rotationDegrees: number;
  rotationJitterDegrees: number;
  scaleJitter: number;
  smoothing: BrushSmoothingMode;
  shapeType: ShapeType;
  toneMode: ToneMode;
  tonePattern: TonePattern;
  shapeFill: boolean;
  shapeOptionSnap?: boolean;
  shapeShiftFill?: boolean;
  antialias?: boolean;
};

export type Point = {
  x: number;
  y: number;
};

type BaseSession = {
  toolId: DrawingToolId;
  startPoint: Point;
  lastPoint: Point;
  points: Point[];
  settings: ToolSettings;
  mainSnapshot: ImageData;
  mainSnapshotWithoutActiveLayer: ImageData;
  layerSnapshot: ImageData;
  layerCanvas: HTMLCanvasElement;
  layerContext: CanvasRenderingContext2D;
  mainContext: CanvasRenderingContext2D;
  camera: Camera;
  projectWidth: number;
  projectHeight: number;
  shapePhase?: "axis" | "width";
  shapeCrossPoint?: Point;
};

export type DrawingSession = BaseSession & {
  committed?: boolean;
};

export interface DrawingTool {
  readonly id: DrawingToolId;
  readonly label: string;
  readonly defaultSize: number;
  beginStroke(args: {
    project: DrawingProject;
    layer: Layer;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    point: Point;
    settings: ToolSettings;
  }): DrawingSession;
  updateStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<void>;
  finalizeStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<ImageData>;
  drawPreview(context: CanvasRenderingContext2D, settings: ToolSettings): Promise<void>;
}

abstract class BaseDrawingTool implements DrawingTool {
  abstract readonly id: DrawingToolId;
  abstract readonly label: string;
  abstract readonly defaultSize: number;

  beginStroke(args: {
    project: DrawingProject;
    layer: Layer;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    point: Point;
    settings: ToolSettings;
  }): DrawingSession {
    const camera = getFitCamera(args.canvas, args.project);
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = args.project.width;
    layerCanvas.height = args.project.height;

    const layerContext = layerCanvas.getContext("2d", { willReadFrequently: true });
    if (!layerContext) {
      throw new Error("Canvas 2D context is not available.");
    }

    layerContext.imageSmoothingEnabled = !!args.settings.antialias;
    layerContext.putImageData(args.layer.imageData, 0, 0);

    const mainSnapshot = args.context.getImageData(0, 0, args.canvas.width, args.canvas.height);

    return {
      toolId: this.id,
      startPoint: args.point,
      lastPoint: args.point,
      points: [args.point],
      settings: {
        color: [...args.settings.color] as PaletteColor["rgba"],
        size: args.settings.size,
        toneDensity: args.settings.toneDensity,
        penShape: args.settings.penShape,
        brushTipId: args.settings.brushTipId,
        brushSpacing: args.settings.brushSpacing,
        brushScatter: args.settings.brushScatter,
        rotationMode: args.settings.rotationMode,
        rotationDegrees: args.settings.rotationDegrees,
        rotationJitterDegrees: args.settings.rotationJitterDegrees,
        scaleJitter: args.settings.scaleJitter,
        smoothing: args.settings.smoothing,
        shapeType: args.settings.shapeType,
        toneMode: args.settings.toneMode,
        tonePattern: args.settings.tonePattern,
        shapeFill: args.settings.shapeFill,
        shapeOptionSnap: args.settings.shapeOptionSnap ?? false,
        shapeShiftFill: args.settings.shapeShiftFill ?? false,
        antialias: args.settings.antialias ?? false,
      },
      mainSnapshot,
      mainSnapshotWithoutActiveLayer: removeLayerFromMainSnapshot(mainSnapshot, layerCanvas, camera, args.canvas.width, args.canvas.height),
      layerSnapshot: cloneImageData(args.layer.imageData),
      layerCanvas,
      layerContext,
      mainContext: args.context,
      camera,
      projectWidth: args.project.width,
      projectHeight: args.project.height,
    };
  }

  async updateStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<void> {
    session.settings = cloneToolSettings(settings);
    if (session.points.length === 0 || !samePoint(session.points[session.points.length - 1], point)) {
      session.points.push(point);
    }

    session.lastPoint = point;
    this.restoreLayerSnapshot(session);
    await this.paintStroke(session, settings);
    this.restoreMainSnapshot(session);
    this.compositeLayerOnMain(session);
  }

  async finalizeStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<ImageData> {
    await this.updateStroke(session, point, settings);
    return session.layerContext.getImageData(0, 0, session.projectWidth, session.projectHeight);
  }

  abstract drawPreview(context: CanvasRenderingContext2D, settings: ToolSettings): Promise<void>;

  protected abstract paintStroke(session: DrawingSession, settings: ToolSettings): void | Promise<void>;

  protected restoreLayerSnapshot(session: DrawingSession): void {
    session.layerContext.setTransform(1, 0, 0, 1, 0, 0);
    session.layerContext.globalCompositeOperation = "source-over";
    session.layerContext.shadowBlur = 0;
    session.layerContext.shadowColor = "transparent";
    session.layerContext.clearRect(0, 0, session.projectWidth, session.projectHeight);
    session.layerContext.putImageData(session.layerSnapshot, 0, 0);
  }

  protected restoreMainSnapshot(session: DrawingSession): void {
    const context = session.mainContext;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.putImageData(session.mainSnapshotWithoutActiveLayer, 0, 0);
  }

  protected compositeLayerOnMain(session: DrawingSession): void {
    const context = session.mainContext;
    context.save();
    context.imageSmoothingEnabled = !!session.settings.antialias;
    context.setTransform(session.camera.zoom, 0, 0, session.camera.zoom, session.camera.panX, session.camera.panY);
    context.drawImage(session.layerCanvas, 0, 0);
    context.restore();
  }
}

class PenTool extends BaseDrawingTool {
  readonly id = "pen";
  readonly label = "Pen";
  readonly defaultSize = 2;

  protected paintStroke(session: DrawingSession, settings: ToolSettings): void {
    drawPenStroke(session.layerContext, session.points, settings);
  }

  async drawPreview(context: CanvasRenderingContext2D, settings: ToolSettings): Promise<void> {
    drawPreviewSurface(context);
    drawPenStroke(
      context,
      [
        { x: 16, y: 26 },
        { x: 48, y: 18 },
        { x: 78, y: 34 },
        { x: 110, y: 16 },
        { x: 142, y: 28 },
      ],
      settings,
    );
  }
}

class BrushTool extends BaseDrawingTool {
  readonly id = "brush";
  readonly label = "Brush";
  readonly defaultSize = 16;

  protected async paintStroke(session: DrawingSession, settings: ToolSettings): Promise<void> {
    await renderBrushStroke({
      context: session.layerContext,
      points: session.points,
      color: settings.color,
      size: settings.size,
      spacingPercent: settings.brushSpacing,
      scatterPercent: settings.brushScatter,
      brushTipId: settings.brushTipId,
      antiAlias: settings.antialias ?? false,
      rotationMode: settings.rotationMode,
      rotationDegrees: settings.rotationDegrees,
      rotationJitterDegrees: settings.rotationJitterDegrees,
      scaleJitter: settings.scaleJitter,
      smoothing: settings.smoothing,
      seed: getSessionSeed(session, settings, 17),
    });
  }

  async drawPreview(context: CanvasRenderingContext2D, settings: ToolSettings): Promise<void> {
    drawPreviewSurface(context);
    await renderBrushStroke({
      context,
      points: [
        { x: 20, y: 72 },
        { x: 52, y: 42 },
        { x: 90, y: 78 },
        { x: 142, y: 36 },
      ],
      color: settings.color,
      size: settings.size,
      spacingPercent: settings.brushSpacing,
      scatterPercent: settings.brushScatter,
      brushTipId: settings.brushTipId,
      antiAlias: settings.antialias ?? false,
      rotationMode: settings.rotationMode,
      rotationDegrees: settings.rotationDegrees,
      rotationJitterDegrees: settings.rotationJitterDegrees,
      scaleJitter: settings.scaleJitter,
      smoothing: settings.smoothing,
      seed: hashStrokeSeed([{ x: 20, y: 72 }], 17),
    });
  }
}

class ToneTool extends BaseDrawingTool {
  readonly id = "tone";
  readonly label = "Tone";
  readonly defaultSize = 8;

  beginStroke(args: Parameters<BaseDrawingTool["beginStroke"]>[0]): DrawingSession {
    const session = super.beginStroke(args);
    if (args.settings.toneMode === "bucket") {
      this.applyToneFill(session, args.point, args.settings);
      session.committed = true;
    }
    return session;
  }

  async updateStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<void> {
    if (settings.toneMode === "bucket") {
      return;
    }

    if (session.points.length === 0 || !samePoint(session.points[session.points.length - 1], point)) {
      session.points.push(point);
    }

    session.lastPoint = point;
    this.restoreLayerSnapshot(session);
    await this.paintStroke(session, settings);
    this.restoreMainSnapshot(session);
    this.compositeLayerOnMain(session);
  }

  async finalizeStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<ImageData> {
    if (settings.toneMode === "bucket" && !session.committed) {
      this.applyToneFill(session, point, settings);
      session.committed = true;
    }

    return session.layerContext.getImageData(0, 0, session.projectWidth, session.projectHeight);
  }

  protected async paintStroke(session: DrawingSession, settings: ToolSettings): Promise<void> {
    if (settings.toneMode !== "pen") {
      return;
    }

    await renderBrushStroke({
      context: session.layerContext,
      points: session.points,
      color: settings.color,
      size: settings.size,
      spacingPercent: 25,
      scatterPercent: 0,
      brushTipId: settings.penShape,
      antiAlias: settings.antialias ?? false,
      seed: getSessionSeed(session, settings, 29),
      patternAlphaAt: createTonePatternAlphaSampler(settings),
    });
  }

  async drawPreview(context: CanvasRenderingContext2D, settings: ToolSettings): Promise<void> {
    drawPreviewSurface(context);

    if (settings.toneMode === "bucket") {
      drawToneBucketPreview(context, settings);
      return;
    }

    await renderBrushStroke({
      context,
      points: [
        { x: 16, y: 26 },
        { x: 48, y: 18 },
        { x: 78, y: 34 },
        { x: 110, y: 16 },
        { x: 142, y: 28 },
      ],
      color: settings.color,
      size: settings.size,
      spacingPercent: 25,
      scatterPercent: 0,
      brushTipId: settings.penShape,
      antiAlias: settings.antialias ?? false,
      seed: hashStrokeSeed([{ x: 16, y: 26 }], 29),
      patternAlphaAt: createTonePatternAlphaSampler(settings),
    });
  }

  protected applyToneFill(session: DrawingSession, point: Point, settings: ToolSettings): void {
    const source = session.layerContext.getImageData(0, 0, session.projectWidth, session.projectHeight);
    const regionMask = floodFillMask(source, point, session.projectWidth, session.projectHeight);
    if (!regionMask.some(Boolean)) {
      return;
    }

    const expandedMask = expandMask(regionMask, session.projectWidth, session.projectHeight, settings.toneDensity >= 10 ? 2 : 1);
    const fillCanvas = createPatternCanvas(session.projectWidth, session.projectHeight);
    const fillContext = fillCanvas.getContext("2d");
    if (!fillContext) {
      return;
    }

    const pattern = createTonePattern(fillContext, settings);
    if (!pattern) {
      return;
    }

    fillContext.clearRect(0, 0, session.projectWidth, session.projectHeight);
    fillContext.fillStyle = pattern;
    fillContext.fillRect(0, 0, session.projectWidth, session.projectHeight);

    const maskCanvas = createPatternCanvas(session.projectWidth, session.projectHeight);
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) {
      return;
    }

    const maskImage = new ImageData(session.projectWidth, session.projectHeight);
    for (let index = 0; index < expandedMask.length; index += 1) {
      if (expandedMask[index]) {
        maskImage.data[index * 4 + 3] = 255;
      }
    }

    maskContext.putImageData(maskImage, 0, 0);
    fillContext.globalCompositeOperation = "destination-in";
    fillContext.drawImage(maskCanvas, 0, 0);

    this.restoreLayerSnapshot(session);
    session.layerContext.save();
    session.layerContext.globalCompositeOperation = "destination-over";
    session.layerContext.drawImage(fillCanvas, 0, 0);
    session.layerContext.restore();

    this.restoreMainSnapshot(session);
    session.mainContext.save();
    session.mainContext.imageSmoothingEnabled = !!session.settings.antialias;
    session.mainContext.setTransform(session.camera.zoom, 0, 0, session.camera.zoom, session.camera.panX, session.camera.panY);
    session.mainContext.drawImage(session.layerCanvas, 0, 0);
    session.mainContext.restore();
  }
}

class EraserTool extends BaseDrawingTool {
  readonly id = "eraser";
  readonly label = "Eraser";
  readonly defaultSize = 12;

  beginStroke(args: Parameters<BaseDrawingTool["beginStroke"]>[0]): DrawingSession {
    const session = super.beginStroke(args);
    this.prepareRealtimeStroke(session);
    return session;
  }

  async updateStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<void> {
    if (session.points.length === 0 || !samePoint(session.points[session.points.length - 1], point)) {
      session.points.push(point);
    }

    session.lastPoint = point;
    this.restoreLayerSnapshot(session);
    await this.paintStroke(session, settings);
    this.restoreMainSnapshot(session);
    this.compositeLayerOnMain(session);
  }

  protected paintStroke(session: DrawingSession, settings: ToolSettings): void {
    this.prepareRealtimeStroke(session);
    erasePath(session.layerContext, session.points, settings);
  }

  async drawPreview(context: CanvasRenderingContext2D, settings: ToolSettings): Promise<void> {
    drawPreviewSurface(context);
    context.save();
    context.fillStyle = "#111111";
    context.fillRect(20, 22, 120, 28);
    context.restore();

    strokePath(
      context,
      [
        { x: 26, y: 36 },
        { x: 52, y: 32 },
        { x: 86, y: 40 },
        { x: 124, y: 28 },
      ],
      settings,
      "rgba(0, 0, 0, 1)",
      "destination-out",
    );
  }

  private prepareRealtimeStroke(session: DrawingSession): void {
    session.layerContext.globalCompositeOperation = "destination-out";
  }
}

class ShapeTool extends BaseDrawingTool {
  readonly id = "shape";
  readonly label = "Shape";
  readonly defaultSize = 2;

  protected paintStroke(session: DrawingSession, settings: ToolSettings): void {
    drawShape(session.layerContext, session.startPoint, session.lastPoint, settings);
  }

  async updateStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<void> {
    session.settings = cloneToolSettings(settings);
    if (session.shapePhase === "width") {
      session.shapeCrossPoint = point;
      this.restoreLayerSnapshot(session);
      drawShape(session.layerContext, session.startPoint, session.lastPoint, settings, point);
      this.restoreMainSnapshot(session);
      this.compositeLayerOnMain(session);
      return;
    }

    await super.updateStroke(session, point, settings);
  }

  async finalizeStroke(session: DrawingSession, point: Point, settings: ToolSettings): Promise<ImageData> {
    await this.updateStroke(session, point, settings);
    return session.layerContext.getImageData(0, 0, session.projectWidth, session.projectHeight);
  }

  async drawPreview(context: CanvasRenderingContext2D, settings: ToolSettings): Promise<void> {
    drawPreviewSurface(context);
    const margin = 18;
    drawShape(
      context,
      { x: margin, y: margin },
      { x: context.canvas.width - margin, y: context.canvas.height - margin },
      settings,
      settings.shapeType === "triangle" || settings.shapeType === "ellipse" || settings.shapeType === "rectangle"
        ? { x: context.canvas.width / 2, y: context.canvas.height - margin }
        : undefined,
    );
  }
}

export const drawingToolOrder: DrawingToolId[] = ["pen", "brush", "tone", "eraser", "shape"];

export const drawingToolRegistry: Record<DrawingToolId, DrawingTool> = {
  pen: new PenTool(),
  brush: new BrushTool(),
  tone: new ToneTool(),
  eraser: new EraserTool(),
  shape: new ShapeTool(),
};

function drawPenStroke(context: CanvasRenderingContext2D, points: Point[], settings: ToolSettings): void {
  if (points.length === 0) {
    return;
  }

  const size = Math.max(1, Math.floor(settings.size));
  const shape = getStrokeShapeDefinition(settings.penShape);
  const mask = shape.createMask(size, { antiAlias: settings.antialias ?? false });
  const imageData = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
  const stampInterval = Math.max(0.5, size / 3);

  const stamp = (point: Point) => {
    stampMask(imageData, mask, point, settings.color);
  };

  if (points.length === 1) {
    stamp(points[0]);
    context.putImageData(imageData, 0, 0);
    return;
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(distance / stampInterval));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      stamp({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }

  context.putImageData(imageData, 0, 0);
}

function stampMask(imageData: ImageData, mask: StampMask, point: Point, color: PaletteColor["rgba"]): void {
  const originX = Math.round(point.x) - Math.floor(mask.width / 2);
  const originY = Math.round(point.y) - Math.floor(mask.height / 2);

  for (let maskY = 0; maskY < mask.height; maskY += 1) {
    const y = originY + maskY;
    if (y < 0 || y >= imageData.height) {
      continue;
    }

    for (let maskX = 0; maskX < mask.width; maskX += 1) {
      const x = originX + maskX;
      if (x < 0 || x >= imageData.width) {
        continue;
      }

      const maskAlpha = mask.alpha[maskY * mask.width + maskX];
      if (maskAlpha === 0) {
        continue;
      }

      blendSourceOver(imageData.data, (y * imageData.width + x) * 4, color, maskAlpha);
    }
  }
}

function blendSourceOver(data: Uint8ClampedArray, index: number, color: PaletteColor["rgba"], maskAlpha: number): void {
  const sourceAlpha = (color[3] / 255) * (maskAlpha / 255);
  const destinationAlpha = data[index + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  if (outputAlpha <= 0) {
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
    return;
  }

  data[index] = Math.round((color[0] * sourceAlpha + data[index] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  data[index + 1] = Math.round((color[1] * sourceAlpha + data[index + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  data[index + 2] = Math.round((color[2] * sourceAlpha + data[index + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  data[index + 3] = Math.round(outputAlpha * 255);
}

function getSessionSeed(session: DrawingSession, settings: ToolSettings, salt: number): number {
  return hashStrokeSeed([session.startPoint], salt + settings.size * 31 + settings.brushSpacing * 7 + settings.brushScatter * 13);
}

function drawToneBucketPreview(context: CanvasRenderingContext2D, settings: ToolSettings): void {
  const previewWidth = context.canvas.width;
  const previewHeight = context.canvas.height;
  const mask = new ImageData(previewWidth, previewHeight);

  for (let y = 24; y < previewHeight - 24; y += 1) {
    for (let x = 24; x < previewWidth - 24; x += 1) {
      const index = (y * previewWidth + x) * 4;
      mask.data[index + 3] = 255;
    }
  }

  const patternCanvas = createPatternCanvas(previewWidth, previewHeight);
  const patternContext = patternCanvas.getContext("2d");
  if (!patternContext) {
    return;
  }

  const pattern = createTonePattern(patternContext, settings);
  if (!pattern) {
    return;
  }

  patternContext.fillStyle = pattern;
  patternContext.fillRect(0, 0, previewWidth, previewHeight);
  patternContext.globalCompositeOperation = "destination-in";

  const maskCanvas = createPatternCanvas(previewWidth, previewHeight);
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) {
    return;
  }

  maskContext.putImageData(mask, 0, 0);
  patternContext.drawImage(maskCanvas, 0, 0);
  context.drawImage(patternCanvas, 0, 0);
  context.strokeStyle = "#ff4fa3";
  context.lineWidth = 2;
  context.strokeRect(24, 24, previewWidth - 48, previewHeight - 48);
}

function createTonePattern(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  settings: ToolSettings,
): CanvasPattern | null {
  const { base, size: patternSize } = parseTonePattern(settings.tonePattern);
  const density = getToneDensityFactor(settings.toneDensity);
  const cellSize = patternSize === "large" ? 72 : patternSize === "medium" ? 48 : 28;
  const patternCanvas = createPatternCanvas(cellSize, cellSize);
  const patternContext = patternCanvas.getContext("2d");

  if (!patternContext) {
    return null;
  }

  patternContext.clearRect(0, 0, cellSize, cellSize);
  patternContext.fillStyle = rgbaToCss(settings.color);
  patternContext.strokeStyle = rgbaToCss(settings.color);
  patternContext.lineWidth = Math.max(1, Math.round(1 + density * (patternSize === "large" ? 2 : patternSize === "medium" ? 1.5 : 1)));

  if (base === "dot") {
    const spacing = Math.max(3, Math.round((patternSize === "large" ? 18 : patternSize === "medium" ? 12 : 8) - density * 5));
    const radius = Math.max(1, Math.round((patternSize === "large" ? 5 : patternSize === "medium" ? 3 : 2) + density));

    for (let y = radius; y < cellSize; y += spacing) {
      for (let x = radius; x < cellSize; x += spacing) {
        patternContext.beginPath();
        patternContext.arc(x, y, radius, 0, Math.PI * 2);
        patternContext.fill();
      }
    }
  } else if (base === "line") {
    const spacing = Math.max(3, Math.round((patternSize === "large" ? 20 : patternSize === "medium" ? 14 : 9) - density * 6));
    patternContext.lineWidth = Math.max(1, Math.round((patternSize === "large" ? 3 : patternSize === "medium" ? 2 : 1) + density));

    for (let x = -cellSize; x < cellSize * 2; x += spacing) {
      patternContext.beginPath();
      patternContext.moveTo(x, 0);
      patternContext.lineTo(x + cellSize, cellSize);
      patternContext.stroke();
    }
  } else {
    const random = seededRandom(settings.toneDensity * 97 + (patternSize === "large" ? 37 : patternSize === "medium" ? 23 : 11));
    const probability = Math.min(0.35, 0.1 + density * 0.22);
    const noiseSize = patternSize === "large" ? 3 : patternSize === "medium" ? 2 : 1;

    for (let y = 0; y < cellSize; y += 1) {
      for (let x = 0; x < cellSize; x += 1) {
        if (random() > probability) {
          continue;
        }

        patternContext.fillRect(x, y, noiseSize, noiseSize);
      }
    }
  }

  return context.createPattern(patternCanvas as unknown as CanvasImageSource, "repeat");
}

function createTonePatternAlphaSampler(settings: ToolSettings): (projectX: number, projectY: number) => number {
  const { base, size: patternSize } = parseTonePattern(settings.tonePattern);
  const density = getToneDensityFactor(settings.toneDensity);

  if (base === "dot") {
    const spacing = Math.max(3, Math.round((patternSize === "large" ? 18 : patternSize === "medium" ? 12 : 8) - density * 5));
    const radius = Math.max(1, (patternSize === "large" ? 5 : patternSize === "medium" ? 3 : 2) + density);
    return (projectX, projectY) => {
      const localX = positiveModulo(projectX, spacing);
      const localY = positiveModulo(projectY, spacing);
      const dx = localX - spacing / 2;
      const dy = localY - spacing / 2;
      const edge = radius - Math.sqrt(dx * dx + dy * dy);
      if (!(settings.antialias ?? false)) {
        return edge >= 0 ? 1 : 0;
      }
      return Math.max(0, Math.min(1, edge + 0.5));
    };
  }

  if (base === "line") {
    const spacing = Math.max(3, Math.round((patternSize === "large" ? 20 : patternSize === "medium" ? 14 : 9) - density * 6));
    const lineWidth = Math.max(1, (patternSize === "large" ? 3 : patternSize === "medium" ? 2 : 1) + density);
    return (projectX, projectY) => {
      const diagonalPosition = positiveModulo(projectX - projectY, spacing);
      const distance = Math.min(diagonalPosition, spacing - diagonalPosition);
      const edge = lineWidth / 2 - distance;
      if (!(settings.antialias ?? false)) {
        return edge >= 0 ? 1 : 0;
      }
      return Math.max(0, Math.min(1, edge + 0.5));
    };
  }

  const probability = Math.min(0.35, 0.1 + density * 0.22);
  const noiseSize = patternSize === "large" ? 3 : patternSize === "medium" ? 2 : 1;
  const seed = settings.toneDensity * 97 + (patternSize === "large" ? 37 : patternSize === "medium" ? 23 : 11);
  return (projectX, projectY) => {
    const cellX = Math.floor(projectX / noiseSize);
    const cellY = Math.floor(projectY / noiseSize);
    return hashGridNoise(cellX, cellY, seed) <= probability ? 1 : 0;
  };
}

function getToneDensityFactor(density: number): number {
  return Math.min(1, Math.max(0, (density - 1) / 23));
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function hashGridNoise(x: number, y: number, seed: number): number {
  let hash = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function strokePath(
  context: CanvasRenderingContext2D,
  points: Point[],
  settings: ToolSettings,
  strokeStyle: string | CanvasPattern,
  compositeOperation: GlobalCompositeOperation,
): void {
  if (points.length === 0) {
    return;
  }
  if (!settings.antialias) {
    // Pixel-stamp variant for patterned strokes
    const size = Math.max(1, Math.floor(settings.size));
    const half = Math.floor(size / 2);
    context.save();
    context.globalCompositeOperation = compositeOperation;
    context.fillStyle = strokeStyle as unknown as string | CanvasPattern;

    const stamp = (x: number, y: number) => {
      const rx = Math.round(x) - half;
      const ry = Math.round(y) - half;
      context.fillRect(rx, ry, size, size);
    };

    if (points.length === 1) {
      stamp(points[0].x, points[0].y);
      context.restore();
      return;
    }

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        stamp(x, y);
      }
    }

    context.restore();
    return;
  }

  context.save();
  context.imageSmoothingEnabled = true;
  context.globalCompositeOperation = compositeOperation;
  context.lineWidth = Math.max(1, settings.size);
  context.lineCap = settings.penShape;
  context.lineJoin = settings.penShape === "round" ? "round" : "miter";
  context.strokeStyle = strokeStyle;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }

  context.stroke();
  context.restore();
}

function erasePath(context: CanvasRenderingContext2D, points: Point[], settings: ToolSettings): void {
  if (points.length === 0) {
    return;
  }
  if (!settings.antialias) {
    // Pixel-perfect erase: stamp integer squares along the path
    const size = Math.max(1, Math.floor(settings.size));
    const half = Math.floor(size / 2);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "rgba(0, 0, 0, 1)";

    const stamp = (x: number, y: number) => {
      const rx = Math.round(x) - half;
      const ry = Math.round(y) - half;
      context.fillRect(rx, ry, size, size);
    };

    if (points.length === 1) {
      stamp(points[0].x, points[0].y);
      context.restore();
      return;
    }

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        stamp(x, y);
      }
    }

    context.restore();
    return;
  }

  // Smooth erase (antialiased)
  const radius = Math.max(1, settings.size / 2);
  context.save();
  context.imageSmoothingEnabled = true;
  context.globalCompositeOperation = "destination-out";
  context.lineWidth = Math.max(1, settings.size);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(0, 0, 0, 1)";
  context.fillStyle = "rgba(0, 0, 0, 1)";

  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }

  context.stroke();

  const first = points[0];
  const last = points[points.length - 1];
  context.beginPath();
  context.arc(first.x, first.y, radius, 0, Math.PI * 2);
  context.arc(last.x, last.y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

type PatternCanvas = HTMLCanvasElement | OffscreenCanvas;

function createPatternCanvas(width: number, height: number): PatternCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function removeLayerFromMainSnapshot(
  mainSnapshot: ImageData,
  layerCanvas: HTMLCanvasElement,
  camera: Camera,
  width: number,
  height: number,
): ImageData {
  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = width;
  scratchCanvas.height = height;
  const scratchContext = scratchCanvas.getContext("2d", { willReadFrequently: true });

  if (!scratchContext) {
    return mainSnapshot;
  }

  scratchContext.putImageData(mainSnapshot, 0, 0);
  scratchContext.save();
  scratchContext.imageSmoothingEnabled = false;
  scratchContext.globalCompositeOperation = "destination-out";
  scratchContext.setTransform(camera.zoom, 0, 0, camera.zoom, camera.panX, camera.panY);
  scratchContext.drawImage(layerCanvas, 0, 0);
  scratchContext.restore();

  return scratchContext.getImageData(0, 0, width, height);
}

function drawShape(context: CanvasRenderingContext2D, start: Point, end: Point, settings: ToolSettings, crossPoint?: Point): void {
  if (!settings.antialias) {
    drawPixelShape(context, start, end, settings, crossPoint);
    return;
  }

  context.save();
  context.imageSmoothingEnabled = true;
  context.globalCompositeOperation = "source-over";
  context.lineWidth = Math.max(1, settings.size);
  context.lineCap = settings.penShape;
  context.lineJoin = settings.penShape === "round" ? "round" : "miter";
  context.strokeStyle = rgbaToCss(settings.color);
  context.fillStyle = rgbaToCss(settings.color);
  const fillShape = shouldFillShape(settings);

  switch (settings.shapeType) {
    case "line": {
      const nextEnd = settings.shapeOptionSnap ? snapPointAngle(start, end, 15) : end;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(nextEnd.x, nextEnd.y);
      context.stroke();
      break;
    }
    case "ellipse": {
      const geometry = getEllipseGeometry(start, end, crossPoint, settings.shapeOptionSnap ?? false);
      context.beginPath();
      context.ellipse(geometry.center.x, geometry.center.y, geometry.radiusX, geometry.radiusY, geometry.rotation, 0, Math.PI * 2);
      if (fillShape) {
        context.fill();
      } else {
        context.stroke();
      }
      break;
    }
    case "triangle": {
      const triangle = getTrianglePoints(start, end, crossPoint, settings.shapeOptionSnap ?? false);
      context.beginPath();
      context.moveTo(triangle.apex.x, triangle.apex.y);
      context.lineTo(triangle.baseRight.x, triangle.baseRight.y);
      context.lineTo(triangle.baseLeft.x, triangle.baseLeft.y);
      context.closePath();
      if (fillShape) {
        context.fill();
      } else {
        context.stroke();
      }
      break;
    }
    case "rectangle": {
      const rectangle = getRectanglePoints(start, end, crossPoint, settings.shapeOptionSnap ?? false);
      context.beginPath();
      context.moveTo(rectangle.topLeft.x, rectangle.topLeft.y);
      context.lineTo(rectangle.topRight.x, rectangle.topRight.y);
      context.lineTo(rectangle.bottomRight.x, rectangle.bottomRight.y);
      context.lineTo(rectangle.bottomLeft.x, rectangle.bottomLeft.y);
      context.closePath();
      if (fillShape) {
        context.fill();
      } else {
        context.stroke();
      }
      break;
    }
  }

  context.restore();
}

function drawPixelShape(context: CanvasRenderingContext2D, start: Point, end: Point, settings: ToolSettings, crossPoint?: Point): void {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = rgbaToCss(settings.color);
  const fillShape = shouldFillShape(settings);

  switch (settings.shapeType) {
    case "line":
      drawPixelLine(context, start, settings.shapeOptionSnap ? snapPointAngle(start, end, 15) : end, settings.size);
      break;
    case "ellipse": {
      const geometry = getEllipseGeometry(start, end, crossPoint, settings.shapeOptionSnap ?? false);
      drawPixelEllipse(context, geometry, settings.size, fillShape);
      break;
    }
    case "triangle": {
      const triangle = getTrianglePoints(start, end, crossPoint, settings.shapeOptionSnap ?? false);
      if (fillShape) {
        fillPixelTriangle(context, triangle.apex, triangle.baseRight, triangle.baseLeft);
      } else {
        drawPixelLine(context, triangle.apex, triangle.baseRight, settings.size);
        drawPixelLine(context, triangle.baseRight, triangle.baseLeft, settings.size);
        drawPixelLine(context, triangle.baseLeft, triangle.apex, settings.size);
      }
      break;
    }
    case "rectangle": {
      const rectangle = getRectanglePoints(start, end, crossPoint, settings.shapeOptionSnap ?? false);
      if (fillShape) {
        fillPixelTriangle(context, rectangle.topLeft, rectangle.topRight, rectangle.bottomRight);
        fillPixelTriangle(context, rectangle.bottomRight, rectangle.bottomLeft, rectangle.topLeft);
        break;
      }
      drawPixelLine(context, rectangle.topLeft, rectangle.topRight, settings.size);
      drawPixelLine(context, rectangle.topRight, rectangle.bottomRight, settings.size);
      drawPixelLine(context, rectangle.bottomRight, rectangle.bottomLeft, settings.size);
      drawPixelLine(context, rectangle.bottomLeft, rectangle.topLeft, settings.size);
      break;
    }
  }

  context.restore();
}

function shouldFillShape(settings: ToolSettings): boolean {
  return settings.shapeType !== "line" && (settings.shapeFill || !!settings.shapeShiftFill);
}

function drawPixelLine(context: CanvasRenderingContext2D, start: Point, end: Point, size: number): void {
  const strokeSize = Math.max(1, Math.floor(size));
  const half = Math.floor(strokeSize / 2);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(start.x + dx * t) - half;
    const y = Math.round(start.y + dy * t) - half;
    context.fillRect(x, y, strokeSize, strokeSize);
  }
}

function drawPixelEllipse(
  context: CanvasRenderingContext2D,
  geometry: { center: Point; radiusX: number; radiusY: number; rotation: number },
  size: number,
  fill: boolean,
): void {
  const steps = Math.max(12, Math.ceil(Math.PI * 2 * Math.max(geometry.radiusX, geometry.radiusY)));

  if (fill) {
    const cos = Math.cos(geometry.rotation);
    const sin = Math.sin(geometry.rotation);

    for (let offsetY = -geometry.radiusY; offsetY <= geometry.radiusY; offsetY += 1) {
      const span = geometry.radiusX * Math.sqrt(Math.max(0, 1 - (offsetY * offsetY) / (geometry.radiusY * geometry.radiusY)));
      const from = rotatePoint({ x: -span, y: offsetY }, cos, sin, geometry.center);
      const to = rotatePoint({ x: span, y: offsetY }, cos, sin, geometry.center);
      drawPixelLine(context, from, to, 1);
    }
    return;
  }

  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const point = getEllipsePoint(geometry, angle);
    drawPixelLine(
      context,
      point,
      point,
      size,
    );
  }
}

function fillPixelTriangle(context: CanvasRenderingContext2D, a: Point, b: Point, c: Point): void {
  const minY = Math.floor(Math.min(a.y, b.y, c.y));
  const maxY = Math.ceil(Math.max(a.y, b.y, c.y));

  for (let y = minY; y <= maxY; y += 1) {
    const intersections: number[] = [];
    collectScanlineIntersection(intersections, y, a, b);
    collectScanlineIntersection(intersections, y, b, c);
    collectScanlineIntersection(intersections, y, c, a);
    intersections.sort((left, right) => left - right);

    for (let index = 0; index < intersections.length - 1; index += 2) {
      const x1 = Math.round(intersections[index]);
      const x2 = Math.round(intersections[index + 1]);
      context.fillRect(x1, y, Math.max(1, x2 - x1 + 1), 1);
    }
  }
}

function collectScanlineIntersection(intersections: number[], y: number, a: Point, b: Point): void {
  if ((y < a.y && y < b.y) || (y >= a.y && y >= b.y) || a.y === b.y) {
    return;
  }

  const t = (y - a.y) / (b.y - a.y);
  intersections.push(a.x + (b.x - a.x) * t);
}

function getTrianglePoints(apex: Point, baseCenter: Point, crossPoint: Point | undefined, snapEquilateral: boolean): {
  apex: Point;
  baseLeft: Point;
  baseRight: Point;
} {
  const snappedBaseCenter = snapEquilateral ? snapPointAngle(apex, baseCenter, 15) : baseCenter;
  const axis = normalizeVector({ x: snappedBaseCenter.x - apex.x, y: snappedBaseCenter.y - apex.y });
  const height = Math.max(1, Math.hypot(snappedBaseCenter.x - apex.x, snappedBaseCenter.y - apex.y));
  const perpendicular = { x: -axis.y, y: axis.x };
  const baseHalf = snapEquilateral || !crossPoint
    ? height / Math.sqrt(3)
    : Math.max(1, Math.abs((crossPoint.x - snappedBaseCenter.x) * perpendicular.x + (crossPoint.y - snappedBaseCenter.y) * perpendicular.y));

  return {
    apex,
    baseLeft: {
      x: snappedBaseCenter.x - perpendicular.x * baseHalf,
      y: snappedBaseCenter.y - perpendicular.y * baseHalf,
    },
    baseRight: {
      x: snappedBaseCenter.x + perpendicular.x * baseHalf,
      y: snappedBaseCenter.y + perpendicular.y * baseHalf,
    },
  };
}

function getRectanglePoints(start: Point, end: Point, crossPoint: Point | undefined, snapSquare: boolean): {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
} {
  const snappedEnd = snapSquare ? snapPointAngle(start, end, 15) : end;
  const axis = normalizeVector({ x: snappedEnd.x - start.x, y: snappedEnd.y - start.y });
  const length = Math.max(1, Math.hypot(snappedEnd.x - start.x, snappedEnd.y - start.y));
  const perpendicular = { x: -axis.y, y: axis.x };
  const halfWidth = snapSquare || !crossPoint
    ? length / 2
    : Math.max(1, Math.abs((crossPoint.x - snappedEnd.x) * perpendicular.x + (crossPoint.y - snappedEnd.y) * perpendicular.y));

  return {
    topLeft: {
      x: start.x - perpendicular.x * halfWidth,
      y: start.y - perpendicular.y * halfWidth,
    },
    topRight: {
      x: snappedEnd.x - perpendicular.x * halfWidth,
      y: snappedEnd.y - perpendicular.y * halfWidth,
    },
    bottomRight: {
      x: snappedEnd.x + perpendicular.x * halfWidth,
      y: snappedEnd.y + perpendicular.y * halfWidth,
    },
    bottomLeft: {
      x: start.x + perpendicular.x * halfWidth,
      y: start.y + perpendicular.y * halfWidth,
    },
  };
}

function getEllipseGeometry(center: Point, axisPoint: Point, crossPoint: Point | undefined, snapCircle: boolean): {
  center: Point;
  radiusX: number;
  radiusY: number;
  rotation: number;
} {
  const axisX = axisPoint.x - center.x;
  const axisY = axisPoint.y - center.y;
  const radiusX = Math.max(1, Math.hypot(axisX, axisY));
  const rotation = Math.atan2(axisY, axisX);
  const perpendicular = normalizeVector({ x: -axisY, y: axisX });
  const radiusY = snapCircle || !crossPoint
    ? radiusX
    : Math.max(1, Math.abs((crossPoint.x - center.x) * perpendicular.x + (crossPoint.y - center.y) * perpendicular.y));

  return {
    center,
    radiusX,
    radiusY,
    rotation,
  };
}

function getEllipsePoint(geometry: { center: Point; radiusX: number; radiusY: number; rotation: number }, angle: number): Point {
  const cos = Math.cos(geometry.rotation);
  const sin = Math.sin(geometry.rotation);
  return rotatePoint(
    {
      x: Math.cos(angle) * geometry.radiusX,
      y: Math.sin(angle) * geometry.radiusY,
    },
    cos,
    sin,
    geometry.center,
  );
}

function rotatePoint(point: Point, cos: number, sin: number, origin: Point): Point {
  return {
    x: origin.x + point.x * cos - point.y * sin,
    y: origin.y + point.x * sin + point.y * cos,
  };
}

function snapPointAngle(start: Point, end: Point, stepDegrees: number): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= 0) {
    return end;
  }

  const stepRadians = (stepDegrees * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / stepRadians) * stepRadians;
  return {
    x: start.x + Math.cos(angle) * distance,
    y: start.y + Math.sin(angle) * distance,
  };
}

function normalizeVector(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function cloneToolSettings(settings: ToolSettings): ToolSettings {
  return {
    ...settings,
    color: [...settings.color] as PaletteColor["rgba"],
  };
}

function drawPreviewSurface(context: CanvasRenderingContext2D): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  context.strokeStyle = "rgba(255, 79, 163, 0.2)";
  context.lineWidth = 1;

  for (let x = 0; x < context.canvas.width; x += 16) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, context.canvas.height);
    context.stroke();
  }

  for (let y = 0; y < context.canvas.height; y += 16) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(context.canvas.width, y + 0.5);
    context.stroke();
  }

  context.strokeStyle = "#ff4fa3";
  context.lineWidth = 2;
  context.strokeRect(1, 1, context.canvas.width - 2, context.canvas.height - 2);
  context.restore();
}

function floodFillMask(imageData: ImageData, start: Point, width: number, height: number): boolean[] {
  const mask = new Array<boolean>(width * height).fill(false);
  const startX = Math.floor(start.x);
  const startY = Math.floor(start.y);

  if (!inBounds(startX, startY, width, height)) {
    return mask;
  }

  const target = readPixel(imageData, startX, startY);
  const stack: Point[] = [{ x: startX, y: startY }];

  while (stack.length > 0) {
    const point = stack.pop();
    if (!point || !inBounds(point.x, point.y, width, height)) {
      continue;
    }

    const index = point.y * width + point.x;
    if (mask[index]) {
      continue;
    }

    if (!sameColor(readPixel(imageData, point.x, point.y), target)) {
      continue;
    }

    mask[index] = true;
    stack.push({ x: point.x + 1, y: point.y });
    stack.push({ x: point.x - 1, y: point.y });
    stack.push({ x: point.x, y: point.y + 1 });
    stack.push({ x: point.x, y: point.y - 1 });
  }

  return mask;
}

function expandMask(mask: boolean[], width: number, height: number, radius: number): boolean[] {
  const expanded = [...mask];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) {
        continue;
      }

      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (Math.abs(offsetX) + Math.abs(offsetY) > radius) {
            continue;
          }

          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (!inBounds(nextX, nextY, width, height)) {
            continue;
          }

          expanded[nextY * width + nextX] = true;
        }
      }
    }
  }

  return expanded;
}

function readPixel(imageData: ImageData, x: number, y: number): PaletteColor["rgba"] {
  const index = (y * imageData.width + x) * 4;
  const data = imageData.data;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function sameColor(a: PaletteColor["rgba"], b: PaletteColor["rgba"]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function rgbaToCss(color: PaletteColor["rgba"]): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}

function samePoint(a: Point | undefined, b: Point): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y;
}
