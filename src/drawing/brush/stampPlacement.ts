import { getBrushStampInterval } from "./settings";
import { seededRandom } from "./seededRandom";
import type { BrushPoint, BrushSettings, BrushStamp } from "./types";

export function placeBrushStamps(points: BrushPoint[], settings: BrushSettings): BrushStamp[] {
  if (points.length === 0) {
    return [];
  }

  const interval = getBrushStampInterval(settings.size, settings.spacingPercent);
  const stamps: BrushStamp[] = [{ ...points[0], index: 0 }];
  let distanceUntilNextStamp = interval;

  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    const start = points[pointIndex];
    const end = points[pointIndex + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (segmentLength === 0) {
      continue;
    }

    let walked = distanceUntilNextStamp;
    while (walked <= segmentLength) {
      const t = walked / segmentLength;
      stamps.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
        index: stamps.length,
      });
      walked += interval;
    }

    distanceUntilNextStamp = walked - segmentLength;
  }

  return applyScatter(stamps, settings);
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
