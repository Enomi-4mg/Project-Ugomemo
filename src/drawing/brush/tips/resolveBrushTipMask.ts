import { createRoundMask } from "../../strokeShapes/round";
import { normalizeBrushTipMaskSourceMode } from "../stamps/bitmap/imageDataToStampMask";
import { loadBitmapStamp } from "../stamps/bitmap/loadBitmapStamp";
import { getBrushTipDefinition } from "./registry";
import { resizeStampMask } from "./resizeStampMask";
import type { StampMask } from "../../strokeShapes";
import type { BrushTipId, BrushTipMaskSourceMode } from "./types";
import type { EffectiveBrushSmoothingMode } from "../types";

const originalBitmapMaskCache = new Map<string, Promise<StampMask>>();
const resizedMaskCache = new Map<string, Promise<StampMask>>();
const ROTATION_BUCKET_DEGREES = 10;
const SCALE_BUCKET = 0.01;

export function resolveBrushTipMask(
  brushTipId: BrushTipId,
  size: number,
  options: {
    smoothing: EffectiveBrushSmoothingMode;
    rotationDegrees?: number;
    scale?: number;
  },
): Promise<StampMask> {
  const normalizedSize = Math.max(1, Math.floor(size));
  const rotationBucket = quantizeRotation(options.rotationDegrees ?? 0);
  const scaleBucket = quantizeScale(options.scale ?? 1);
  const maskSourceMode = getBrushTipMaskSourceMode(brushTipId);
  const cacheKey = `${brushTipId}:mask:${maskSourceMode}:size:${normalizedSize}:smoothing:${options.smoothing}:rotation:${rotationBucket}:scale:${scaleBucket}`;
  const cached = resizedMaskCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = resolveUncachedBrushTipMask(brushTipId, normalizedSize, options.smoothing, rotationBucket, scaleBucket).catch((error) => {
    console.warn(`Brush tip "${brushTipId}" could not be loaded. Falling back to Round.`, error);
    const antiAlias = options.smoothing === "smooth";
    const fallback = createRoundMask(Math.max(1, Math.round(normalizedSize * scaleBucket)), { antiAlias });
    return rotationBucket === 0 ? fallback : rotateStampMask(fallback, rotationBucket, antiAlias);
  });
  resizedMaskCache.set(cacheKey, promise);
  return promise;
}

async function resolveUncachedBrushTipMask(
  brushTipId: BrushTipId,
  size: number,
  smoothing: EffectiveBrushSmoothingMode,
  rotationDegrees: number,
  scale: number,
): Promise<StampMask> {
  const definition = getBrushTipDefinition(brushTipId);
  const antiAlias = smoothing === "smooth";
  const scaledSize = Math.max(1, Math.round(size * scale));
  let mask: StampMask;
  if (definition.kind === "procedural") {
    mask = definition.createMask(scaledSize, { size: scaledSize, antiAlias });
  } else {
    const maskSourceMode = normalizeBrushTipMaskSourceMode(definition.maskSourceMode);
    const original = await loadOriginalBitmapMask(definition.id, definition.source, maskSourceMode);
    mask = resizeStampMask(original, scaledSize, antiAlias);
  }

  return rotationDegrees === 0 ? mask : rotateStampMask(mask, rotationDegrees, antiAlias);
}

function loadOriginalBitmapMask(brushTipId: BrushTipId, source: string, maskSourceMode: BrushTipMaskSourceMode): Promise<StampMask> {
  const cacheKey = `${brushTipId}:mask:${maskSourceMode}`;
  const cached = originalBitmapMaskCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = loadBitmapStamp(source, { maskSourceMode }).catch((error) => {
    originalBitmapMaskCache.delete(cacheKey);
    throw error;
  });
  originalBitmapMaskCache.set(cacheKey, promise);
  return promise;
}

export function clearBrushTipMaskCaches(): void {
  originalBitmapMaskCache.clear();
  resizedMaskCache.clear();
}

function quantizeRotation(degrees: number): number {
  const safeDegrees = Number.isFinite(degrees) ? degrees : 0;
  const normalized = ((safeDegrees % 360) + 360) % 360;
  const bucket = Math.round(normalized / ROTATION_BUCKET_DEGREES) * ROTATION_BUCKET_DEGREES;
  return bucket >= 360 ? 0 : bucket;
}

function getBrushTipMaskSourceMode(brushTipId: BrushTipId): BrushTipMaskSourceMode {
  const definition = getBrushTipDefinition(brushTipId);
  return definition.kind === "bitmap" ? normalizeBrushTipMaskSourceMode(definition.maskSourceMode) : "alpha";
}

function quantizeScale(scale: number): number {
  const safeScale = Math.max(0.05, Number.isFinite(scale) ? scale : 1);
  return Math.round(safeScale / SCALE_BUCKET) * SCALE_BUCKET;
}

function rotateStampMask(mask: StampMask, degrees: number, antiAlias: boolean): StampMask {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const width = Math.max(1, Math.ceil(Math.abs(mask.width * cos) + Math.abs(mask.height * sin)));
  const height = Math.max(1, Math.ceil(Math.abs(mask.width * sin) + Math.abs(mask.height * cos)));
  const alpha = new Uint8ClampedArray(width * height);
  const sourceCenterX = (mask.width - 1) / 2;
  const sourceCenterY = (mask.height - 1) / 2;
  const targetCenterX = (width - 1) / 2;
  const targetCenterY = (height - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const localX = x - targetCenterX;
      const localY = y - targetCenterY;
      const sourceX = localX * cos + localY * sin + sourceCenterX;
      const sourceY = -localX * sin + localY * cos + sourceCenterY;
      alpha[y * width + x] = antiAlias ? sampleBilinear(mask, sourceX, sourceY) : sampleNearest(mask, sourceX, sourceY);
    }
  }

  return { width, height, alpha };
}

function sampleNearest(mask: StampMask, x: number, y: number): number {
  const sourceX = Math.round(x);
  const sourceY = Math.round(y);
  if (sourceX < 0 || sourceX >= mask.width || sourceY < 0 || sourceY >= mask.height) {
    return 0;
  }
  return mask.alpha[sourceY * mask.width + sourceX];
}

function sampleBilinear(mask: StampMask, x: number, y: number): number {
  if (x < 0 || x > mask.width - 1 || y < 0 || y > mask.height - 1) {
    return 0;
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(mask.width - 1, x0 + 1);
  const y1 = Math.min(mask.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = lerp(mask.alpha[y0 * mask.width + x0], mask.alpha[y0 * mask.width + x1], tx);
  const bottom = lerp(mask.alpha[y1 * mask.width + x0], mask.alpha[y1 * mask.width + x1], tx);
  return Math.round(lerp(top, bottom, ty));
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}
