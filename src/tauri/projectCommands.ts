import { invoke } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { PALETTE } from "../drawing/project";
import type { DrawingProject, Frame, Layer } from "../drawing/types";

type LayerPayload = {
  id: string;
  name: string;
  visible: boolean;
  colorIds: [string, string];
  zDepth: number;
  pixels: number[];
};

type ProjectPayload = {
  width: number;
  height: number;
  fps?: number;
  backgroundColorId: string;
  activeLayerId: string;
  currentPageIndex: number;
  frames: Array<{
    id: string;
    layers: LayerPayload[];
  }>;
  audioMaterials: PersistedAudioFile[];
  recordings: PersistedAudioFile[];
  timelineClips: PersistedTimelineClip[];
  audioAssets?: Record<string, PersistedAudioAsset>;
  audioTracks?: PersistedAudioTrack[];
};

export type PersistedAudioFile = {
  id: string;
  name: string;
  path: string;
  extension: string;
  durationMs?: number;
  waveformSummary?: number[];
  isOffline?: boolean;
};

export type PersistedAudioAsset = {
  id: string;
  name: string;
  originalPath: string;
  durationMs: number;
  waveformSummary: number[];
  extension: string;
  isOffline?: boolean;
};

export type PersistedAudioClip = {
  id: string;
  assetId: string;
  startFrame: number;
  durationFrames: number;
  sourceOffsetMs: number;
  volume: number;
  playbackRate: number;
  isOffline?: boolean;
};

export type PersistedAudioTrack = {
  id: string;
  name: string;
  volume: number;
  isMuted: boolean;
  isSolo: boolean;
  clips: PersistedAudioClip[];
};

export type PersistedTimelineClip = {
  id: string;
  sourceId: string;
  sourceType: "material" | "recording";
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

export type AudioWorkstationState = {
  audioMaterials: PersistedAudioFile[];
  recordings: PersistedAudioFile[];
  timelineClips: PersistedTimelineClip[];
  audioAssets: Record<string, PersistedAudioAsset>;
  audioTracks: PersistedAudioTrack[];
};

export type ProjectPackagePaths = {
  projectName: string;
  projectPath: string;
  imageDir: string;
  movieDir: string;
  recordDir: string;
};

type ProjectLoadResult = ProjectPackagePaths & {
  project: ProjectPayload;
};

export type LoadedProjectPackage = ProjectPackagePaths & {
  project: DrawingProject;
  audio: AudioWorkstationState;
};

export async function encodeActiveLayer(project: DrawingProject): Promise<number[]> {
  const layer = project.frames[project.currentPageIndex]?.layers.find((candidate) => candidate.id === project.activeLayerId);

  if (!layer) {
    throw new Error("Active layer not found.");
  }

  return invoke<number[]>("encode_layer_png", {
    width: project.width,
    height: project.height,
    fps: project.fps,
    pixels: Array.from(layer.imageData.data),
  });
}

export async function floodFillPixels(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  startX: number,
  startY: number,
  fillColor: [number, number, number, number],
): Promise<Uint8ClampedArray> {
  const filledPixels = await invoke<number[]>("flood_fill", {
    width,
    height,
    pixels: Array.from(pixels),
    startX,
    startY,
    fillColor,
  });

  return new Uint8ClampedArray(filledPixels);
}

export async function saveProjectToPath(project: DrawingProject, path: string, audio: AudioWorkstationState = emptyAudioState()): Promise<void> {
  await invoke("save_upj_project", {
    path,
    project: toProjectPayload(project, audio),
  });
}

export async function saveProjectWithNativeDialog(
  project: DrawingProject,
  projectName: string,
  audio: AudioWorkstationState = emptyAudioState(),
): Promise<ProjectPackagePaths | null> {
  const defaultPath = await getDefaultSaveDialogPath(projectName);
  const selectedPath = await save({
    defaultPath,
    filters: [{ name: "Project Ugomemo", extensions: ["upj"] }],
    title: "Save Project Ugomemo",
  });

  if (!selectedPath) {
    return null;
  }

  return invoke<ProjectPackagePaths>("save_project_package", {
    selectedPath,
    project: toProjectPayload(project, audio),
  });
}

export async function loadProjectWithNativeDialog(): Promise<LoadedProjectPackage | null> {
  const selectedPath = await open({
    multiple: false,
    filters: [{ name: "Project Ugomemo", extensions: ["upj"] }],
    title: "Load Project Ugomemo",
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  const loaded = await invoke<ProjectLoadResult>("load_project_package", {
    selectedPath,
  });

  return {
    ...loaded,
    project: fromProjectPayload(loaded.project),
    audio: {
      audioMaterials: loaded.project.audioMaterials ?? [],
      recordings: loaded.project.recordings ?? [],
      timelineClips: loaded.project.timelineClips ?? [],
      audioAssets: loaded.project.audioAssets ?? {},
      audioTracks: loaded.project.audioTracks ?? defaultAudioTracks(),
    },
  };
}

export async function getDefaultProjectPackagePaths(projectName: string): Promise<ProjectPackagePaths> {
  if (canUseTauri()) {
    return invoke<ProjectPackagePaths>("default_project_package_paths", { projectName });
  }

  const safeName = sanitizeProjectName(projectName);
  return {
    projectName: safeName,
    projectPath: `Documents/Project Ugomemo/${safeName}/${safeName}.upj`,
    imageDir: `Documents/Project Ugomemo/${safeName}/image`,
    movieDir: `Documents/Project Ugomemo/${safeName}/movie`,
    recordDir: `Documents/Project Ugomemo/${safeName}/record`,
  };
}

export type AudioFilePath = {
  id: string;
  name: string;
  path: string;
  extension: string;
  durationMs?: number;
  waveformSummary?: number[];
  isOffline?: boolean;
};

export async function selectAudioFiles(): Promise<AudioFilePath[]> {
  const selectedPaths = await open({
    multiple: true,
    filters: [{ name: "Audio", extensions: ["mp3", "wav", "m4a"] }],
    title: "Import Audio Material",
  });

  if (!selectedPaths) {
    return [];
  }

  const paths = Array.isArray(selectedPaths) ? selectedPaths : [selectedPaths];
  if (canUseTauri()) {
    return inspectAudioFiles(paths);
  }

  return paths.map((path) => {
    const fileName = path.split(/[\\/]/).pop() ?? path;
    const extensionMatch = fileName.match(/\.([^.]+)$/);
    return {
      id: `${path}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: fileName.replace(/\.[^.]+$/, ""),
      path,
      extension: extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "",
      durationMs: 0,
      waveformSummary: [],
    };
  });
}

export async function inspectAudioFiles(paths: string[]): Promise<AudioFilePath[]> {
  return invoke<AudioFilePath[]>("inspect_audio_files", { paths });
}

export async function validateAudioAssets(
  projectPath: string | null,
  assets: Record<string, PersistedAudioAsset>,
): Promise<Record<string, PersistedAudioAsset>> {
  return invoke<Record<string, PersistedAudioAsset>>("validate_audio_assets", { projectPath, assets });
}

export async function bundleProjectAssets(
  projectPath: string,
  assets: Record<string, PersistedAudioAsset>,
): Promise<Record<string, PersistedAudioAsset>> {
  return invoke<Record<string, PersistedAudioAsset>>("bundle_project_assets", { projectPath, assets });
}

export async function writeBinaryFile(path: string, bytes: Uint8Array | number[]): Promise<string> {
  return invoke<string>("write_binary_file", {
    path,
    bytes: Array.from(bytes),
  });
}

export async function encodeWavToMp3File(path: string, wavBytes: Uint8Array | number[]): Promise<string> {
  return invoke<string>("encode_wav_to_mp3_file", {
    path,
    wavBytes: Array.from(wavBytes),
  });
}

export async function copyFile(sourcePath: string, targetPath: string): Promise<string> {
  return invoke<string>("copy_file", { sourcePath, targetPath });
}

export async function deleteFile(path: string): Promise<void> {
  await invoke("delete_file", { path });
}

export async function renameFile(path: string, newName: string): Promise<string> {
  return invoke<string>("rename_file", { path, newName });
}

export async function exportVideoFromPngs(
  outputPath: string,
  framePngs: Uint8Array[],
  fps: number,
  format: "MP4" | "WebM" | "GIF" | "APNG" | "Audio Only (WAV)",
  audioWav?: Uint8Array | null,
  videoOnly = false,
  outputWidth?: number,
  outputHeight?: number,
): Promise<string> {
  return invoke<string>("export_video_from_pngs", {
    outputPath,
    framePngs: framePngs.map((bytes) => Array.from(bytes)),
    fps,
    format,
    audioWav: audioWav ? Array.from(audioWav) : null,
    videoOnly,
    outputWidth: outputWidth ?? null,
    outputHeight: outputHeight ?? null,
  });
}

export async function cancelActiveExport(): Promise<void> {
  await invoke("cancel_active_export");
}

export function canUseTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function getDefaultSaveDialogPath(projectName: string): Promise<string> {
  const documents = await documentDir();
  const safeName = sanitizeProjectName(projectName);
  return join(documents, `${safeName}.upj`);
}

function sanitizeProjectName(projectName: string): string {
  const safeName = projectName
    .trim()
    .replace(/\.[Uu][Pp][Jj]$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return safeName || "untitled_project";
}

function toProjectPayload(project: DrawingProject, audio: AudioWorkstationState): ProjectPayload {
  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    backgroundColorId: project.backgroundColorId,
    activeLayerId: project.activeLayerId,
    currentPageIndex: project.currentPageIndex,
    frames: project.frames.map((frame) => ({
      id: frame.id,
      layers: frame.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        colorIds: layer.colorIds,
        zDepth: layer.zDepth,
        pixels: Array.from(layer.imageData.data),
      })),
    })),
    audioMaterials: audio.audioMaterials,
    recordings: audio.recordings,
    timelineClips: audio.timelineClips.map(sanitizeTimelineClipForSave),
    audioAssets: audio.audioAssets,
    audioTracks: audio.audioTracks.map(sanitizeAudioTrackForSave),
  };
}

function sanitizeTimelineClipForSave(clip: PersistedTimelineClip): PersistedTimelineClip {
  return {
    ...clip,
    startFrame: finiteNumberOrZero(clip.startFrame),
    durationFrames: finiteNumberOrZero(clip.durationFrames),
    sourceOffsetFrames: finiteNumberOrZero(clip.sourceOffsetFrames),
    trackIndex: finiteIntegerOrZero(clip.trackIndex),
    loopCount: finiteIntegerOrZero(clip.loopCount),
    volume: finiteNumberOrZero(clip.volume),
    panning: finiteNumberOrZero(clip.panning),
    fadeInFrames: finiteNumberOrZero(clip.fadeInFrames),
    fadeOutFrames: finiteNumberOrZero(clip.fadeOutFrames),
  };
}

function sanitizeAudioTrackForSave(track: PersistedAudioTrack): PersistedAudioTrack {
  return {
    ...track,
    volume: finiteNumberOrZero(track.volume),
    clips: track.clips.map((clip) => ({
      ...clip,
      startFrame: finiteNumberOrZero(clip.startFrame),
      durationFrames: finiteNumberOrZero(clip.durationFrames),
      sourceOffsetMs: finiteIntegerOrZero(clip.sourceOffsetMs),
      volume: finiteNumberOrZero(clip.volume),
      playbackRate: finiteNumberOrZero(clip.playbackRate),
    })),
  };
}

function finiteNumberOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteIntegerOrZero(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function emptyAudioState(): AudioWorkstationState {
  return {
    audioMaterials: [],
    recordings: [],
    timelineClips: [],
    audioAssets: {},
    audioTracks: defaultAudioTracks(),
  };
}

function defaultAudioTracks(): PersistedAudioTrack[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    volume: 1,
    isMuted: false,
    isSolo: false,
    clips: [],
  }));
}

function fromProjectPayload(payload: ProjectPayload): DrawingProject {
  const frames: Frame[] = payload.frames.map((frame) => ({
    id: frame.id,
    layers: frame.layers.map((layer): Layer => {
      const pixels = new Uint8ClampedArray(layer.pixels);
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        colorIds: layer.colorIds,
        zDepth: layer.zDepth,
        imageData: new ImageData(pixels, payload.width, payload.height),
      };
    }),
  }));

  return {
    width: payload.width,
    height: payload.height,
    fps: payload.fps ?? 6,
    palette: PALETTE,
    backgroundColorId: payload.backgroundColorId,
    activeLayerId: payload.activeLayerId,
    currentPageIndex: Math.min(Math.max(payload.currentPageIndex, 0), Math.max(frames.length - 1, 0)),
    frames,
    camera: {
      zoom: 1,
      panX: 0,
      panY: 0,
    },
  };
}
