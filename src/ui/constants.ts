import type { ImageExportFormat, VideoExportFormat } from "./types";

export const VIEWPORT_WIDTH = 860;
export const VIEWPORT_HEIGHT = 620;
export const PLAYBACK_SPEEDS = [0.2, 0.5, 1, 2, 4, 6, 8, 12, 20, 24, 30] as const;
export const Z_DEPTHS = [1, 2, 3, 4, 5, 6, 7] as const;
export const BRUSH_SIZE_MIN = 1;
export const BRUSH_SIZE_MAX = 64;
export const IMAGE_EXPORT_FORMATS: ImageExportFormat[] = ["JPEG", "PNG", "WebP"];
export const VIDEO_EXPORT_FORMATS: VideoExportFormat[] = ["MP4", "WebM", "GIF", "APNG", "Sprite Sheet", "Audio Only (WAV)"];
