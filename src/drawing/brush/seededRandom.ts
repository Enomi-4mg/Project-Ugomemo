export function seededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0;
    return current / 0xffffffff;
  };
}

export function hashStrokeSeed(points: Array<{ x: number; y: number }>, salt: number): number {
  let hash = (2166136261 ^ salt) >>> 0;

  for (const point of points) {
    hash ^= Math.round(point.x * 100);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= Math.round(point.y * 100);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash >>> 0;
}
