export type AppMode = "draw" | "edit" | "playback" | "audio";
export type DialogState = "none" | "new-warning" | "export" | "create-page" | "record";
export type SaveIntent = "manual" | "new-project";
export type PageCreateDirection = "prepend" | "append";
export type ExportTab = "image" | "video";
export type ImageExportFormat = "JPEG" | "PNG" | "WebP";
export type VideoExportFormat = "MP4" | "WebM" | "GIF" | "APNG" | "Sprite Sheet" | "Audio Only (WAV)";
export type ImageExportScope = "all" | "partial";
export type RecordingFormat = "wav" | "mp3";
export type ExportAudioQuality = "high" | "lofi";
export type MicrophonePermissionState = "idle" | "checking" | "granted" | "denied" | "unsupported";
export type TimelineClipSource = "material" | "recording";

export type TimelineSourceDragPayload = { kind: "source"; id: string; type: TimelineClipSource };
export type TimelineMoveDragPayload = { kind: "clip"; clipId: string; offsetFrames: number };
export type TimelineDragPayload = TimelineSourceDragPayload | TimelineMoveDragPayload;

export type PointerTimelineDrag = {
  payload: TimelineDragPayload;
  name: string;
  extension?: string;
  durationFrames: number;
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
};

export type TimelineClip = {
  id: string;
  sourceId: string;
  sourceType: TimelineClipSource;
  name: string;
  trackIndex: number;
  startFrame: number;
  durationFrames: number;
  sourceOffsetFrames: number;
  loopCount: number;
  reversed: boolean;
  volume: number;
  panning: number;
  fadeInFrames: number;
  fadeOutFrames: number;
};
