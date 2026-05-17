export type TonePatternBase = "dot" | "line" | "noise";
export type TonePatternSize = "small" | "medium" | "large";
export type TonePattern = `${TonePatternBase}-${TonePatternSize}`;
export type ToneScaleLabel = "Fine" | "Normal" | "Coarse";

export const TONE_PATTERN_BASES: Array<{ value: TonePatternBase; label: string }> = [
  { value: "dot", label: "Dot" },
  { value: "line", label: "Line" },
  { value: "noise", label: "Noise" },
];

export const TONE_PATTERN_SIZES: Array<{ value: TonePatternSize; label: ToneScaleLabel }> = [
  { value: "small", label: "Fine" },
  { value: "medium", label: "Normal" },
  { value: "large", label: "Coarse" },
];

export const tonePatternOptions: Array<{ value: TonePattern; label: string }> = TONE_PATTERN_BASES.flatMap((base) =>
  TONE_PATTERN_SIZES.map((size) => ({
    value: buildTonePattern(base.value, size.value),
    label: `${base.label} - ${size.label}`,
  })),
);

export function parseTonePattern(pattern: TonePattern): {
  base: TonePatternBase;
  size: TonePatternSize;
} {
  const [base, size] = pattern.split("-") as [TonePatternBase, TonePatternSize];
  return { base, size };
}

export function buildTonePattern(base: TonePatternBase, size: TonePatternSize): TonePattern {
  return `${base}-${size}`;
}
