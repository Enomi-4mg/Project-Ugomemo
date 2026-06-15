import { getBrushStampInterval } from "./settings";
import { seededRandom } from "./seededRandom";
import type { BrushPoint, BrushSettings, BrushStamp } from "./types";

export function placeBrushStamps(points: BrushPoint[], settings: BrushSettings): BrushStamp[] {
  if (points.length === 0) {
    return [];
  }

  const interval = getBrushStampInterval(settings.size, settings.spacingPercent);
  const fallbackAngle = findFirstSegmentAngle(points) ?? settings.rotationDegrees;
  const stamps: BrushStamp[] = [{ ...points[0], index: 0, rotationDegrees: fallbackAngle, scale: 1 }];
  let distanceUntilNextStamp = interval;
  let previousAngle = fallbackAngle;

  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    const start = points[pointIndex];
    const end = points[pointIndex + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (segmentLength < 0.0001) {
      continue;
    }

    previousAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    let walked = distanceUntilNextStamp;
    while (walked <= segmentLength) {
      const t = walked / segmentLength;
      stamps.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
        index: stamps.length,
        rotationDegrees: previousAngle,
        scale: 1,
      });
      walked += interval;
    }

    distanceUntilNextStamp = walked - segmentLength;
  }

  return applyScatter(applyExpression(stamps, settings), settings);
}

function applyScatter(stamps: BrushStamp[], settings: BrushSettings): BrushStamp[] {
  if (settings.scatterPercent <= 0) {
    return stamps;
  }

  const random = seededRandom(settings.seed);
  const maxOffset = settings.size * (settings.scatterPercent / 100);

  return stamps.map((stamp) => {
    const angle = random() * Math.PI * 2;
    const distance = random() * maxOffset;
    return {
      ...stamp,
      x: stamp.x + Math.cos(angle) * distance,
      y: stamp.y + Math.sin(angle) * distance,
    };
  });
}

function applyExpression(stamps: BrushStamp[], settings: BrushSettings): BrushStamp[] {
  const random = seededRandom(settings.seed ^ 0x9e3779b9);

  return stamps.map((stamp) => {
    const baseAngle =
      settings.rotationMode === "random"
        ? settings.rotationDegrees + random() * 360
        : settings.rotationMode === "stroke-direction"
          ? settings.rotationDegrees + stamp.rotationDegrees
          : settings.rotationDegrees;
    const jitter = settings.rotationJitterDegrees > 0 ? (random() - 0.5) * settings.rotationJitterDegrees : 0;
    const scaleJitter = settings.scaleJitter > 0 ? (random() - 0.5) * settings.scaleJitter : 0;

    return {
      ...stamp,
      rotationDegrees: normalizeDegrees(baseAngle + jitter),
      scale: Math.max(0.05, 1 + scaleJitter),
    };
  });
}

function findFirstSegmentAngle(points: BrushPoint[]): number | undefined {
  for (let index = 0; index < points.length - 1; index += 1) {
    const dx = points[index + 1].x - points[index].x;
    const dy = points[index + 1].y - points[index].y;
    if (Math.sqrt(dx * dx + dy * dy) >= 0.0001) {
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  }
  return undefined;
}

function normalizeDegrees(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
