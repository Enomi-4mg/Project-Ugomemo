import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Ban,
  Blend,
  BrushCleaning,
  CircleDot,
  Copy,
  CopyPlus,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FilePenLine,
  FilePlus2,
  FolderOpen,
  Grid3X3,
  Image,
  Layers,
  Mic,
  Music,
  Package,
  PanelTopDashed,
  PaintBucket,
  Pause,
  Pencil,
  Plus,
  Play,
  Redo2,
  RotateCcw,
  Save,
  SaveAll,
  Scissors,
  Shapes,
  SkipBack,
  SquarePen,
  SlidersHorizontal,
  Square,
  Trash2,
  Undo2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { createHistory, pushHistory, redo, undo, type HistoryState } from "../drawing/history";
import {
  MAX_PAGES,
  clampPageIndex,
  cloneFrame,
  cloneImageData,
  createFrame,
  createProject,
  getActiveLayerColors,
  getCurrentFrame,
  getCurrentLayers,
  getPaletteColor,
  replaceCurrentFrame,
  replaceCurrentLayers,
} from "../drawing/project";
import { renderProject } from "../drawing/renderer";
import { getCanvasPoint } from "../drawing/tools";
import { drawingToolOrder, drawingToolRegistry, type DrawingSession, type DrawingToolId, type Point, type ToolSettings } from "../drawing/toolStrategies";
import type { DrawingProject, Frame, Layer, PaletteColor, Tool } from "../drawing/types";
import {
  canUseTauri,
  cancelActiveExport,
  bundleProjectAssets,
  copyFile,
  deleteFile,
  encodeWavToMp3File,
  exportVideoFromPngs,
  floodFillPixels,
  getDefaultProjectPackagePaths,
  loadProjectWithNativeDialog,
  renameFile,
  saveProjectToPath,
  saveProjectWithNativeDialog,
  selectAudioFiles,
  validateAudioAssets,
  writeBinaryFile,
  type AudioFilePath,
  type AudioWorkstationState,
  type PersistedAudioAsset,
  type PersistedAudioTrack,
  type ProjectPackagePaths,
} from "../tauri/projectCommands";
import { IconButton } from "./components/IconButton";
import { ProjectPreviewFrame } from "./components/ProjectPreviewFrame";
import { BRUSH_SIZE_MAX, BRUSH_SIZE_MIN, IMAGE_EXPORT_FORMATS, PLAYBACK_SPEEDS, VIDEO_EXPORT_FORMATS, VIEWPORT_HEIGHT, VIEWPORT_WIDTH, Z_DEPTHS } from "./constants";
import { detectPlatform, getShortcutLabel, isPrimaryModifierKey, isShortcutAction, shouldIgnoreShortcutEvent, type Platform } from "./keyboard/shortcuts";
import { buildTonePattern, parseTonePattern, TONE_PATTERN_BASES, TONE_PATTERN_SIZES, type TonePatternBase, type TonePatternSize } from "./tone/tonePattern";
import type {
  AppMode,
  DialogState,
  ExportAudioQuality,
  ExportTab,
  ImageExportFormat,
  ImageExportScope,
  MicrophonePermissionState,
  PageCreateDirection,
  PointerTimelineDrag,
  RecordingFormat,
  SaveIntent,
  TimelineClip,
  TimelineClipSource,
  TimelineDragPayload,
  TimelineMoveDragPayload,
  TimelineSourceDragPayload,
  VideoExportFormat,
} from "./types";

type RecordedAudio = {
  id: string;
  name: string;
  path: string;
  extension: string;
  durationMs?: number;
  waveformSummary?: number[];
};
type AudioAssetContextMenu = {
  sourceId: string;
  sourceKind: "material" | "recording";
  x: number;
  y: number;
};

type ClipDragState = {
  clipId: string;
  kind: "loop" | "trim";
  startX: number;
  startDurationFrames: number;
  startLoopCount: number;
  pixelsPerFrame: number;
};

type FileOperationState = {
  active: boolean;
  message: string;
  cancellable: boolean;
};

type PendingShapeStep = {
  shapeType: "triangle" | "ellipse" | "rectangle";
};

function createDefaultToolSettings(tool: DrawingToolId = "pen"): ToolSettings {
  return {
    color: [0, 0, 0, 255],
    size: drawingToolRegistry[tool].defaultSize,
    toneDensity: drawingToolRegistry.tone.defaultSize,
    penShape: "round",
    shapeType: "line",
    toneMode: "pen",
    tonePattern: "dot-medium",
    shapeFill: false,
    antialias: false,
  };
}

function createDefaultToolSettingsByTool(): Record<DrawingToolId, ToolSettings> {
  return drawingToolOrder.reduce(
    (settingsByTool, toolId) => ({
      ...settingsByTool,
      [toolId]: createDefaultToolSettings(toolId),
    }),
    {} as Record<DrawingToolId, ToolSettings>,
  );
}

const drawingToolIcons = {
  pen: Pencil,
  tone: CircleDot,
  eraser: Eraser,
  shape: Shapes,
} satisfies Record<DrawingToolId, typeof Pencil>;

export function App() {
  const platform = useMemo(() => detectPlatform(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const frameRailRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef<DrawingProject | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const scheduledAudioRef = useRef<AudioScheduledSourceNode[]>([]);
  const playbackStartedAtRef = useRef(0);
  const playbackFrameAtStartRef = useRef(0);
  const recordCountdownTimeoutRef = useRef<number | null>(null);
  const recordCountdownTokenRef = useRef<number | null>(null);
  const recordCountdownStreamRef = useRef<MediaStream | null>(null);
  const recordingPausedRef = useRef(false);
  const recordingPausedStartedAtRef = useRef(0);
  const recordingPausedDurationRef = useRef(0);
  const recordingsRef = useRef<RecordedAudio[]>([]);
  const materializedRecordingIdsRef = useRef<Set<string>>(new Set());
  const wavRecordingRef = useRef<{
    context: AudioContext;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    analyser: AnalyserNode;
    stream: MediaStream;
    chunks: Float32Array[];
    sampleRate: number;
  } | null>(null);
  const recordingMonitorRef = useRef<{
    analyser: AnalyserNode;
    context: AudioContext;
    rafId: number;
    startedAt: number;
  } | null>(null);
  const clipDragRef = useRef<ClipDragState | null>(null);
  const pointerTimelineDragRef = useRef<PointerTimelineDrag | null>(null);
  const pointerTimelineCleanupRef = useRef<(() => void) | null>(null);
  const exportCancelledRef = useRef(false);
  const drawingSessionRef = useRef<DrawingSession | null>(null);
  const pendingShapeSessionRef = useRef<DrawingSession | null>(null);
  const isDrawingRef = useRef(false);

  const [project, setProject] = useState<DrawingProject>(() => createProject());
  const [history, setHistory] = useState<HistoryState>(() => createHistory(project));
  const [mode, setMode] = useState<AppMode>("draw");
  const [tool, setTool] = useState<Tool>("pen");
  const [toolSettingsByTool, setToolSettingsByTool] = useState<Record<DrawingToolId, ToolSettings>>(() => createDefaultToolSettingsByTool());
  const [colorSlot, setColorSlot] = useState<0 | 1>(0);
  const [pendingShapeStep, setPendingShapeStep] = useState<PendingShapeStep | null>(null);
  const [status, setStatus] = useState("Ready");
  const [fileOperation, setFileOperation] = useState<FileOperationState>({
    active: false,
    message: "",
    cancellable: false,
  });
  const [viewportSize, setViewportSize] = useState({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  const [colorPopover, setColorPopover] = useState<{ layerId: string; slot: 0 | 1 } | null>(null);
  const [backgroundPopoverOpen, setBackgroundPopoverOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>("none");
  const [projectName, setProjectName] = useState("untitled_project");
  const [projectPackagePaths, setProjectPackagePaths] = useState<ProjectPackagePaths | null>(null);
  const [exportTab, setExportTab] = useState<ExportTab>("image");
  const [imageExportFormat, setImageExportFormat] = useState<ImageExportFormat>("PNG");
  const [imageExportScope, setImageExportScope] = useState<ImageExportScope>("all");
  const [selectedExportFrames, setSelectedExportFrames] = useState<Set<number>>(() => new Set([0]));
  const [transparentExport, setTransparentExport] = useState(false);
  const [videoExportFormat, setVideoExportFormat] = useState<VideoExportFormat>("MP4");
  const [videoOnlyExport, setVideoOnlyExport] = useState(false);
  const [exportFps, setExportFps] = useState(6);
  const [exportAudioQuality, setExportAudioQuality] = useState<ExportAudioQuality>("high");
  const [exportPath, setExportPath] = useState("");
  const [exportProgress, setExportProgress] = useState<{ active: boolean; label: string; percent: number }>({
    active: false,
    label: "",
    percent: 0,
  });
  const [copiedFrame, setCopiedFrame] = useState<Frame | null>(null);
  const [pageCreatePromptVisible, setPageCreatePromptVisible] = useState(false);
  const [pageCreateDirection, setPageCreateDirection] = useState<PageCreateDirection>("append");
  const [rapidPageCreationDirection, setRapidPageCreationDirection] = useState<PageCreateDirection | null>(null);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stopArmedForReset, setStopArmedForReset] = useState(false);
  const [speedLevel, setSpeedLevel] = useState(5);
  const [audioMaterials, setAudioMaterials] = useState<AudioFilePath[]>([]);
  const [recordings, setRecordings] = useState<RecordedAudio[]>([]);
  const [audioAssets, setAudioAssets] = useState<Record<string, PersistedAudioAsset>>({});
  const [audioTracks, setAudioTracks] = useState<PersistedAudioTrack[]>(() => createDefaultAudioTracks());
  const [audioWorkspaceTab, setAudioWorkspaceTab] = useState<"workstation" | "mixer">("workstation");
  const [timeUnit, setTimeUnit] = useState<"frames" | "time">("frames");
  const [timelinePixelsPerFrame, setTimelinePixelsPerFrame] = useState(18);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [recordingFormat, setRecordingFormat] = useState<RecordingFormat>("wav");
  const [recordCountdownEnabled, setRecordCountdownEnabled] = useState(true);
  const [recordCountdownRemaining, setRecordCountdownRemaining] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [recordingWaveform, setRecordingWaveform] = useState<number[]>(() => Array.from({ length: 64 }, () => 0));
  const [microphonePermissionState, setMicrophonePermissionState] = useState<MicrophonePermissionState>("idle");
  const [microphonePermissionMessage, setMicrophonePermissionMessage] = useState("");
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [materializedRecordingIds, setMaterializedRecordingIds] = useState<Set<string>>(() => new Set());
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [pointerTimelineDrag, setPointerTimelineDrag] = useState<PointerTimelineDrag | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [clipClipboard, setClipClipboard] = useState<TimelineClip | null>(null);
  const [clipContextMenu, setClipContextMenu] = useState<{ clipId: string; x: number; y: number } | null>(null);
  const [audioAssetContextMenu, setAudioAssetContextMenu] = useState<AudioAssetContextMenu | null>(null);
  const [activeAudioPath, setActiveAudioPath] = useState<string | null>(null);

  const currentFrame = getCurrentFrame(project);
  const layers = getCurrentLayers(project);
  const activeLayer = layers.find((layer) => layer.id === project.activeLayerId) ?? layers[0];
  const activeLayerColors = getActiveLayerColors(project);
  const selectedColor = activeLayerColors[colorSlot] ?? activeLayerColors[0];
  const toolSettings = toolSettingsByTool[tool as DrawingToolId];
  const displayPageIndex = mode === "playback" || mode === "audio" ? playbackIndex : project.currentPageIndex;
  const currentFileName = getProjectFileName(projectPackagePaths, projectName);
  const pageIndicator = `${displayPageIndex + 1} / ${project.frames.length}`;
  const playbackFps = project.fps;
  const currentTimeSeconds = displayPageIndex / playbackFps;
  const totalTimeSeconds = project.frames.length / playbackFps;

  function setToolSettings(settingsAction: SetStateAction<ToolSettings>) {
    setToolSettingsByTool((current) => {
      const currentToolSettings = current[tool as DrawingToolId];
      const nextToolSettings = typeof settingsAction === "function" ? settingsAction(currentToolSettings) : settingsAction;
      return {
        ...current,
        [tool]: nextToolSettings,
      };
    });
  }

  function adjustBrushSize(delta: number) {
    if (tool === "tone" && toolSettings.toneMode === "bucket") {
      return;
    }

    setToolSettings((current) => ({
      ...current,
      size: clampBrushSize(current.size + delta),
    }));
  }

  function getEffectiveToolSettings(event: { altKey: boolean; shiftKey: boolean }): ToolSettings {
    return {
      ...toolSettings,
      shapeOptionSnap: event.altKey,
      shapeShiftFill: event.shiftKey,
    };
  }

  function isTwoStepShape(settings: ToolSettings): settings is ToolSettings & { shapeType: "triangle" | "ellipse" | "rectangle" } {
    return tool === "shape" && (settings.shapeType === "triangle" || settings.shapeType === "ellipse" || settings.shapeType === "rectangle");
  }

  function clearPendingShapePreview() {
    pendingShapeSessionRef.current = null;
    setPendingShapeStep(null);
    const canvas = canvasRef.current;
    const currentProject = projectRef.current ?? project;
    if (canvas) {
      renderProject(canvas, currentProject, {
        onionSkin: mode === "draw" && onionSkinEnabled,
        pageIndex: displayPageIndex,
      });
    }
  }

  function finishShapeSession(session: DrawingSession, point: Point, settings: ToolSettings, pointerId?: number) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const currentProject = projectRef.current ?? project;
    const nextImageData = drawingToolRegistry[session.toolId].finalizeStroke(session, point, settings);
    const nextProject = replaceCurrentLayers(
      currentProject,
      getCurrentLayers(currentProject).map((layer) =>
        layer.id === currentProject.activeLayerId ? { ...layer, imageData: nextImageData } : layer,
      ),
    );
    commit(nextProject);
    if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  }

  useEffect(() => {
    setToolSettingsByTool((current) =>
      drawingToolOrder.reduce(
        (next, toolId) => ({
          ...next,
          [toolId]: {
            ...current[toolId],
            color: selectedColor.rgba,
          },
        }),
        {} as Record<DrawingToolId, ToolSettings>,
      ),
    );
  }, [selectedColor.rgba]);

  useEffect(() => {
    const canvas = toolPreviewRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    drawingToolRegistry[tool as DrawingToolId].drawPreview(context, toolSettings);
  }, [tool, toolSettings]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setViewportSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(240, Math.floor(entry.contentRect.height)),
      });
    });

    resizeObserver.observe(stage);
    return () => resizeObserver.disconnect();
  }, [mode]);

  useEffect(() => {
    projectRef.current = project;
    const canvas = canvasRef.current;

    if (canvas) {
      renderProject(canvas, project, {
        onionSkin: mode === "draw" && onionSkinEnabled,
        pageIndex: displayPageIndex,
      });
    }
  }, [displayPageIndex, mode, onionSkinEnabled, project, viewportSize]);

  useEffect(() => {
    setPlaybackIndex((current) => clampPageIndex(project, current));
    setSelectedExportFrames((current) => {
      const next = new Set([...current].filter((index) => index >= 0 && index < project.frames.length));
      if (next.size === 0) {
        next.add(0);
      }
      return next;
    });
  }, [project]);

  useEffect(() => {
    pointerTimelineDragRef.current = pointerTimelineDrag;
  }, [pointerTimelineDrag]);

  useEffect(() => {
    recordingsRef.current = recordings;
  }, [recordings]);

  useEffect(() => {
    materializedRecordingIdsRef.current = materializedRecordingIds;
  }, [materializedRecordingIds]);

  useEffect(() => {
    return () => {
      pointerTimelineCleanupRef.current?.();
      cancelRecordCountdown();
      stopRecordingMonitor();
      wavRecordingRef.current?.processor.disconnect();
      wavRecordingRef.current?.analyser.disconnect();
      wavRecordingRef.current?.source.disconnect();
      void wavRecordingRef.current?.context.close();
      wavRecordingRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = clipDragRef.current;
      if (!drag) {
        return;
      }

      const pixelsPerFrame = Math.max(1, drag.pixelsPerFrame);
      const deltaFrames = Math.round((event.clientX - drag.startX) / pixelsPerFrame);
      setTimelineClips((clips) =>
        clips.map((clip) => {
          if (clip.id !== drag.clipId) {
            return clip;
          }

          if (drag.kind === "loop") {
            const nextLoopCount = Math.max(1, drag.startLoopCount + Math.round(deltaFrames / Math.max(1, clip.durationFrames)));
            return { ...clip, loopCount: Math.min(nextLoopCount, 64) };
          }

          return { ...clip, durationFrames: Math.max(1, drag.startDurationFrames + deltaFrames) };
        }),
      );
    };

    const onMouseUp = () => {
      clipDragRef.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [project.frames.length]);

  useEffect(() => {
    const title = `Project Ugomemo - ${currentFileName}${hasUnsavedChanges ? " *" : ""}`;
    document.title = title;

    if (canUseTauri()) {
      void getCurrentWindow().setTitle(title);
    }
  }, [currentFileName, hasUnsavedChanges]);

  useEffect(() => {
    void refreshMicrophoneDevices();
  }, []);

  // Close context / hover menus when interacting outside of them
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (pendingShapeSessionRef.current && !el.closest(".drawing-canvas")) {
        clearPendingShapePreview();
      }
      if (el.closest('.clip-context-menu, .audio-asset-context-menu, .color-popover')) return;
      setClipContextMenu(null);
      setAudioAssetContextMenu(null);
      setColorPopover(null);
      setBackgroundPopoverOpen(false);
    };

    const onWheel = (event: WheelEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (el.closest('.clip-context-menu, .audio-asset-context-menu, .color-popover')) return;
      setClipContextMenu(null);
      setAudioAssetContextMenu(null);
      setColorPopover(null);
      setBackgroundPopoverOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pendingShapeSessionRef.current) {
          clearPendingShapePreview();
        }
        setClipContextMenu(null);
        setAudioAssetContextMenu(null);
        setColorPopover(null);
        setBackgroundPopoverOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (canUseTauri() || !new URLSearchParams(window.location.search).has("demoAudio")) {
      return;
    }

    const demoAsset: AudioFilePath = {
      id: "demo-tone",
      name: "Demo Tone",
      path: "",
      extension: ".wav",
      durationMs: 1800,
      waveformSummary: Array.from({ length: 160 }, (_, index) => 0.2 + Math.abs(Math.sin(index / 8)) * 0.65),
    };
    setAudioMaterials((current) => current.some((asset) => asset.id === demoAsset.id) ? current : [demoAsset, ...current]);
    setAudioAssets((current) => current[demoAsset.id] ? current : { ...current, [demoAsset.id]: audioFileToAsset(demoAsset) });
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (canUseTauri() || !searchParams.has("demoAudio") || !searchParams.has("dropDemoAudio")) {
      return;
    }

    setTimelineClips((clips) => {
      if (clips.some((clip) => clip.sourceId === "demo-tone")) {
        return clips;
      }

      return [
        ...clips,
        {
          id: "clip-demo-tone",
          sourceId: "demo-tone",
          sourceType: "material",
          name: "Demo Tone",
          trackIndex: 0,
          startFrame: 4,
          durationFrames: Math.max(1, Math.ceil(1.8 * playbackFps)),
          sourceOffsetFrames: 0,
          loopCount: 1,
          reversed: false,
          volume: 1,
          panning: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
        },
      ];
    });
    setSelectedClipId((current) => current ?? "clip-demo-tone");
    setStatus("Placed Demo Tone on track 1.");
  }, [playbackFps]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (canUseTauri() || mode !== "audio" || !searchParams.has("demoAudio") || !searchParams.has("ghostPreview")) {
      return;
    }

    const pointerX = Number(searchParams.get("ghostX")) || Math.round(window.innerWidth * 0.46);
    const pointerY = Number(searchParams.get("ghostY")) || Math.round(window.innerHeight * 0.66);
    setPointerTimelineDrag({
      payload: { kind: "source", id: "demo-tone", type: "material" },
      name: "Demo Tone",
      extension: ".wav",
      durationFrames: Math.max(1, Math.ceil(1.8 * playbackFps)),
      pointerX,
      pointerY,
      startX: pointerX,
      startY: pointerY,
      hasMoved: true,
    });
    return () => {
      setPointerTimelineDrag((current) => (
        current?.payload.kind === "source" && current.payload.id === "demo-tone" ? null : current
      ));
    };
  }, [mode, playbackFps]);

  useEffect(() => {
    if (!canUseTauri()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<{ label: string; percent: number }>("export-progress", (event) => {
      if (!disposed) {
        setExportProgress({ active: true, label: event.payload.label, percent: event.payload.percent });
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || (mode !== "playback" && mode !== "audio")) {
      return;
    }

    const interval = window.setInterval(() => {
      setPlaybackIndex((current) => (current + 1) % project.frames.length);
    }, 1000 / playbackFps);

    return () => window.clearInterval(interval);
  }, [isPlaying, mode, playbackFps, project.frames.length]);

  useEffect(() => {
    if (!isPlaying || (mode !== "playback" && mode !== "audio")) {
      stopScheduledTimelineAudio();
      return;
    }

    playbackStartedAtRef.current = performance.now() / 1000;
    playbackFrameAtStartRef.current = playbackIndex;
    void scheduleTimelineAudio(playbackIndex);

    return () => {
      stopScheduledTimelineAudio();
    };
  }, [audioTracks, isPlaying, mode, playbackFps, timelineClips]);

  useEffect(() => {
    if (!isPlaying || (mode !== "playback" && mode !== "audio")) {
      return;
    }

    // When playback wraps back to the start, reschedule timeline audio
    if (playbackIndex === 0) {
      void scheduleTimelineAudio(0);
      playbackStartedAtRef.current = performance.now() / 1000;
      playbackFrameAtStartRef.current = 0;
    }
  }, [playbackIndex, isPlaying, mode]);

  useEffect(() => {
    const rail = frameRailRef.current;
    if (!rail) {
      return;
    }

    const activeCell = rail.querySelector<HTMLElement>('[data-active-frame="true"]');
    activeCell?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [displayPageIndex, mode, project.frames.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (fileOperation.active || shouldIgnoreShortcutEvent(event)) {
        return;
      }

      if (isPrimaryModifierKey(event, platform)) {
        if (pageCreatePromptVisible) {
          cancelPagePrompt();
        }
        setOnionSkinEnabled(true);
        return;
      }

      if (isShortcutAction(event, "saveAs", platform)) {
        event.preventDefault();
        cancelPagePrompt();
        void handleSaveAsProject("manual");
        return;
      }

      if (isShortcutAction(event, "save", platform)) {
        event.preventDefault();
        cancelPagePrompt();
        void handleSaveClick("manual");
        return;
      }

      if (isShortcutAction(event, "undo", platform)) {
        event.preventDefault();
        cancelPagePrompt();
        applyUndo();
        return;
      }

      if (isShortcutAction(event, "redo", platform)) {
        event.preventDefault();
        cancelPagePrompt();
        applyRedo();
        return;
      }

      if (isShortcutAction(event, "switchToDrawMode", platform)) {
        event.preventDefault();
        setModeAndCancel("draw");
        return;
      }

      if (isShortcutAction(event, "switchToEditMode", platform)) {
        event.preventDefault();
        setModeAndCancel("edit");
        return;
      }

      if (isShortcutAction(event, "switchToPlaybackMode", platform)) {
        event.preventDefault();
        setModeAndCancel("playback");
        return;
      }

      if (isShortcutAction(event, "switchToAudioMode", platform)) {
        event.preventDefault();
        setModeAndCancel("audio");
        return;
      }

      if (isShortcutAction(event, "playPause", platform) || isShortcutAction(event, "playFromCurrent", platform)) {
        event.preventDefault();
        cancelPagePrompt();
        const playFromCurrentFrame = isShortcutAction(event, "playFromCurrent", platform);
        if (playFromCurrentFrame) {
          setPlaybackIndex(mode === "draw" || mode === "edit" ? project.currentPageIndex : playbackIndex);
          setStopArmedForReset(false);
          setIsPlaying(true);
        } else if (isPlaying) {
          setIsPlaying(false);
          setStopArmedForReset(true);
        } else {
          setStopArmedForReset(false);
          setIsPlaying(true);
        }
        return;
      }

      if (mode === "audio") {
        if (isShortcutAction(event, "delete", platform)) {
          event.preventDefault();
          deleteSelectedClip();
          return;
        }

        if (isShortcutAction(event, "copy", platform)) {
          event.preventDefault();
          copySelectedClip();
          return;
        }

        if (isShortcutAction(event, "paste", platform)) {
          event.preventDefault();
          pasteClipAtPlayhead();
          return;
        }
      } else {
        if (isShortcutAction(event, "copy", platform)) {
          event.preventDefault();
          copyCurrentFrame();
          return;
        }

        if (isShortcutAction(event, "paste", platform)) {
          event.preventDefault();
          pasteFrame();
          return;
        }

        if (isShortcutAction(event, "delete", platform) && mode === "edit") {
          event.preventDefault();
          deleteCurrentFrame();
          return;
        }
      }

      if (mode === "draw") {
        if (isShortcutAction(event, "selectPen", platform)) {
          event.preventDefault();
          cancelPagePrompt();
          setTool("pen");
          return;
        }

        if (isShortcutAction(event, "selectTone", platform)) {
          event.preventDefault();
          cancelPagePrompt();
          setTool("tone");
          return;
        }

        if (isShortcutAction(event, "selectEraser", platform)) {
          event.preventDefault();
          cancelPagePrompt();
          setTool("eraser");
          return;
        }

        if (isShortcutAction(event, "selectShape", platform)) {
          event.preventDefault();
          cancelPagePrompt();
          setTool("shape");
          return;
        }
      }

      if (isShortcutAction(event, "decreaseBrushSize", platform)) {
        event.preventDefault();
        cancelPagePrompt();
        adjustBrushSize(-1);
        return;
      }

      if (isShortcutAction(event, "increaseBrushSize", platform)) {
        event.preventDefault();
        cancelPagePrompt();
        adjustBrushSize(1);
        return;
      }

      if (
        isShortcutAction(event, "previousLayer", platform) ||
        isShortcutAction(event, "nextLayer", platform) ||
        isShortcutAction(event, "previousPage", platform) ||
        isShortcutAction(event, "nextPage", platform)
      ) {
        event.preventDefault();
      }

      if (isShortcutAction(event, "previousLayer", platform)) {
        cancelPagePrompt();
        navigateLayer(-1);
      } else if (isShortcutAction(event, "nextLayer", platform)) {
        cancelPagePrompt();
        navigateLayer(1);
      } else if (isShortcutAction(event, "previousPage", platform)) {
        handleLeftArrow();
      } else if (isShortcutAction(event, "nextPage", platform)) {
        handleRightArrow();
      } else {
        cancelPagePrompt();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isPrimaryModifierKey(event, platform)) {
        setOnionSkinEnabled(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [fileOperation.active, history, isPlaying, mode, pageCreatePromptVisible, platform, playbackIndex, project, rapidPageCreationDirection, selectedClipId, timelineClips, clipClipboard, copiedFrame, tool, toolSettings.toneMode]);

  function commit(nextProject: DrawingProject) {
    setProject(nextProject);
    setHistory((current) => pushHistory(current, nextProject));
    setHasUnsavedChanges(true);
  }

  function cancelPagePrompt() {
    setPageCreatePromptVisible(false);
    setRapidPageCreationDirection(null);
    setDialogState((current) => (current === "create-page" ? "none" : current));
  }

  function applyUndo() {
    const [nextProject, nextHistory] = undo(project, history);
    setProject(nextProject);
    setHistory(nextHistory);
    setHasUnsavedChanges(true);
  }

  function applyRedo() {
    const [nextProject, nextHistory] = redo(project, history);
    setProject(nextProject);
    setHistory(nextHistory);
    setHasUnsavedChanges(true);
  }

  function setModeAndCancel(nextMode: AppMode) {
    cancelPagePrompt();
    setIsPlaying(false);
    setStopArmedForReset(false);
    setMode(nextMode);
    if (nextMode === "playback" || nextMode === "audio") {
      setPlaybackIndex(project.currentPageIndex);
    }
  }

  function navigateLayer(delta: number) {
    const currentIndex = layers.findIndex((layer) => layer.id === project.activeLayerId);
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), layers.length - 1);
    setProject((current) => ({ ...current, activeLayerId: layers[nextIndex]?.id ?? current.activeLayerId }));
  }

  function navigatePage(delta: number) {
    if (mode === "playback" || mode === "audio") {
      setPlaybackIndex((current) => clampIndex(current + delta, project.frames.length));
      return;
    }

    setProject((current) => ({
      ...current,
      currentPageIndex: clampPageIndex(current, current.currentPageIndex + delta),
    }));
  }

  function handleRightArrow() {
    if (mode === "playback" || mode === "audio") {
      setPlaybackIndex((current) => clampIndex(current + 1, project.frames.length));
      return;
    }

    if (project.currentPageIndex < project.frames.length - 1) {
      cancelPagePrompt();
      navigatePage(1);
      return;
    }

    if (rapidPageCreationDirection === "append" || (pageCreatePromptVisible && pageCreateDirection === "append")) {
      createPageAfterCurrent(true);
      return;
    }

    setPageCreateDirection("append");
    setPageCreatePromptVisible(true);
    setDialogState("create-page");
  }

  function handleLeftArrow() {
    if (mode === "playback" || mode === "audio") {
      setPlaybackIndex((current) => clampIndex(current - 1, project.frames.length));
      return;
    }

    if (project.currentPageIndex > 0) {
      cancelPagePrompt();
      navigatePage(-1);
      return;
    }

    if (rapidPageCreationDirection === "prepend" || (pageCreatePromptVisible && pageCreateDirection === "prepend")) {
      prependPage(true);
      return;
    }

    setPageCreateDirection("prepend");
    setPageCreatePromptVisible(true);
    setDialogState("create-page");
  }

  function createPageAfterCurrent(keepRapidCreation = false) {
    if (project.frames.length >= MAX_PAGES) {
      setStatus("Page limit reached.");
      return;
    }

    const insertAt = project.currentPageIndex + 1;
    const nextFrame = createFrameWithLayerSettings(project.width, project.height, project.frames.length, currentFrame);
    commit({
      ...project,
      frames: insertFrame(project.frames, insertAt, nextFrame),
      currentPageIndex: insertAt,
    });
    setPageCreatePromptVisible(false);
    setDialogState("none");
    setRapidPageCreationDirection(keepRapidCreation ? "append" : null);
    setStatus(`Page ${insertAt + 1} created.`);
  }

  function prependPage(keepRapidCreation = false) {
    if (project.frames.length >= MAX_PAGES) {
      setStatus("Page limit reached.");
      return;
    }

    const nextFrame = createFrameWithLayerSettings(project.width, project.height, project.frames.length, currentFrame);
    commit({
      ...project,
      frames: insertFrame(project.frames, 0, nextFrame),
      currentPageIndex: 0,
    });
    setPageCreatePromptVisible(false);
    setDialogState("none");
    setRapidPageCreationDirection(keepRapidCreation ? "prepend" : null);
    setStatus("Page 1 created.");
  }

  async function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "draw") {
      return;
    }

    cancelPagePrompt();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const effectiveSettings = getEffectiveToolSettings(event);
    const pendingShapeSession = pendingShapeSessionRef.current;
    if (pendingShapeSession) {
      const currentProject = projectRef.current ?? project;
      const point = getCanvasPoint(canvas, event, currentProject);
      finishShapeSession(pendingShapeSession, point, effectiveSettings);
      pendingShapeSessionRef.current = null;
      setPendingShapeStep(null);
      return;
    }

    const mainContext = canvas.getContext("2d");
    if (!mainContext) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    const activeProject = projectRef.current ?? project;
    const point = getCanvasPoint(canvas, event, activeProject);

    const activeLayer = getCurrentLayers(activeProject).find((layer) => layer.id === activeProject.activeLayerId);
    if (!activeLayer) {
      return;
    }

    const drawingTool = drawingToolRegistry[tool as DrawingToolId];
    const session = drawingTool.beginStroke({
      project: activeProject,
      layer: activeLayer,
      canvas,
      context: mainContext,
      point,
      settings: effectiveSettings,
    });

    if (tool === "tone" && session.settings.toneMode === "bucket") {
      const nextImageData = drawingTool.finalizeStroke(session, point, session.settings);
      const nextProject = replaceCurrentLayers(
        activeProject,
        getCurrentLayers(activeProject).map((layer) =>
          layer.id === activeProject.activeLayerId ? { ...layer, imageData: nextImageData } : layer,
        ),
      );
      commit(nextProject);
      canvas.releasePointerCapture(event.pointerId);
      return;
    }

    if (isTwoStepShape(effectiveSettings)) {
      session.shapePhase = "axis";
    }

    drawingSessionRef.current = session;
    isDrawingRef.current = true;
    drawingTool.updateStroke(session, point, session.settings);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") {
      return;
    }

    const session = drawingSessionRef.current;
    if (!isDrawingRef.current || !session) {
      const pendingShapeSession = pendingShapeSessionRef.current;
      if (pendingShapeSession) {
        const currentProject = projectRef.current ?? project;
        const point = getCanvasPoint(canvas, event, currentProject);
        drawingToolRegistry[pendingShapeSession.toolId].updateStroke(pendingShapeSession, point, getEffectiveToolSettings(event));
      }
      return;
    }

    const currentProject = projectRef.current ?? project;
    const point = getCanvasPoint(canvas, event, currentProject);
    drawingToolRegistry[session.toolId].updateStroke(session, point, getEffectiveToolSettings(event));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const session = drawingSessionRef.current;
    const canvas = canvasRef.current;

    if (isDrawingRef.current && session && canvas) {
      const currentProject = projectRef.current ?? project;
      const point = getCanvasPoint(canvas, event, currentProject);
      const effectiveSettings = getEffectiveToolSettings(event);

      if (session.toolId === "shape" && session.shapePhase === "axis" && isTwoStepShape(effectiveSettings)) {
        drawingToolRegistry[session.toolId].updateStroke(session, point, effectiveSettings);
        session.shapePhase = "width";
        session.shapeCrossPoint = point;
        pendingShapeSessionRef.current = session;
        setPendingShapeStep({ shapeType: effectiveSettings.shapeType });
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        isDrawingRef.current = false;
        drawingSessionRef.current = null;
        return;
      }

      finishShapeSession(session, point, effectiveSettings, event.pointerId);
    }

    isDrawingRef.current = false;
    drawingSessionRef.current = null;
  }

  function updateLayer(layerId: string, changes: Partial<Layer>) {
    cancelPagePrompt();
    commit(
      replaceCurrentLayers(
        project,
        layers.map((layer) => (layer.id === layerId ? { ...layer, ...changes } : layer)),
      ),
    );
  }

  function updateLayerColor(layerId: string, slot: 0 | 1, colorId: string) {
    cancelPagePrompt();
    const layerIndex = layers.findIndex((layer) => layer.id === layerId);
    const layer = layers[layerIndex];
    if (!layer) {
      return;
    }

    const oldColor = getPaletteColor(project, layer.colorIds[slot]).rgba;
    const newColor = getPaletteColor(project, colorId).rgba;
    const colorIds: [string, string] = [...layer.colorIds];
    colorIds[slot] = colorId;

    setProject((current) =>
      replaceCurrentLayers(
        current,
        getCurrentLayers(current).map((candidate) =>
          candidate.id === layerId
            ? { ...candidate, colorIds, imageData: remapLayerColor(candidate.imageData, oldColor, newColor) }
            : candidate,
        ),
      ),
    );
    setHistory((currentHistory) => remapHistoryLayerColor(currentHistory, project.currentPageIndex, layerIndex, oldColor, newColor));
    setHasUnsavedChanges(true);
    setColorPopover(null);
  }

  function updateBackgroundColor(backgroundColorId: string) {
    cancelPagePrompt();
    setProject((current) => ({ ...current, backgroundColorId }));
    setHasUnsavedChanges(true);
    setBackgroundPopoverOpen(false);
  }

  function setActiveLayer(layerId: string) {
    cancelPagePrompt();
    setProject((current) => ({ ...current, activeLayerId: layerId }));
  }

  function clearActiveLayer() {
    cancelPagePrompt();
    commit(
      replaceCurrentLayers(
        project,
        layers.map((layer) =>
          layer.id === project.activeLayerId ? { ...layer, imageData: new ImageData(project.width, project.height) } : layer,
        ),
      ),
    );
    setStatus(`Layer ${activeLayer.name} cleared.`);
  }

  function clearCurrentFrame() {
    cancelPagePrompt();
    commit(
      replaceCurrentFrame(project, {
        ...currentFrame,
        layers: layers.map((layer) => ({ ...layer, imageData: new ImageData(project.width, project.height) })),
      }),
    );
    setStatus(`Page ${project.currentPageIndex + 1} cleared.`);
  }

  function copyCurrentFrame() {
    cancelPagePrompt();
    setCopiedFrame(cloneFrame(currentFrame));
    setStatus(`Page ${project.currentPageIndex + 1} copied.`);
  }

  function pasteFrame() {
    cancelPagePrompt();
    if (!copiedFrame) {
      setStatus("No copied page.");
      return;
    }

    commit(replaceCurrentFrame(project, renameFrame(cloneFrame(copiedFrame), project.currentPageIndex)));
    setStatus(`Pasted to page ${project.currentPageIndex + 1}.`);
  }

  function duplicateFrame() {
    cancelPagePrompt();
    if (project.frames.length >= MAX_PAGES) {
      setStatus("Page limit reached.");
      return;
    }

    const insertAt = project.currentPageIndex + 1;
    commit({
      ...project,
      frames: insertFrame(project.frames, insertAt, renameFrame(cloneFrame(currentFrame), insertAt)),
      currentPageIndex: insertAt,
    });
  }

  function insertNewFrame() {
    cancelPagePrompt();
    createPageAfterCurrent(false);
  }

  function deleteCurrentFrame() {
    cancelPagePrompt();
    if (project.frames.length <= 1) {
      setStatus("At least one page is required.");
      return;
    }

    const frames = project.frames.filter((_, index) => index !== project.currentPageIndex).map(renameFrame);
    commit({
      ...project,
      frames,
      currentPageIndex: Math.min(project.currentPageIndex, frames.length - 1),
    });
  }

  function createFreshProjectKeepingPalette(current: DrawingProject): DrawingProject {
    const nextProject = createProject(current.width, current.height);
    return {
      ...nextProject,
      backgroundColorId: current.backgroundColorId,
      activeLayerId: current.activeLayerId,
      fps: current.fps,
    };
  }

  function createNewProject() {
    const nextProject = createFreshProjectKeepingPalette(project);
    setProject(nextProject);
    setHistory(createHistory(nextProject));
    setHasUnsavedChanges(false);
    setProjectPackagePaths(null);
    setProjectName("untitled_project");
    setCopiedFrame(null);
    setAudioMaterials([]);
    setRecordings([]);
    setTimelineClips([]);
    setAudioAssets({});
    setAudioTracks(createDefaultAudioTracks());
    setSelectedClipId(null);
    setDialogState("none");
    setStatus("New project created.");
  }

  function handleNewProject() {
    cancelPagePrompt();
    if (hasUnsavedChanges) {
      setDialogState("new-warning");
      return;
    }

    createNewProject();
  }

  async function handleSaveClick(intent: SaveIntent = "manual") {
    cancelPagePrompt();

    if (!projectPackagePaths) {
      await handleSaveAsProject(intent);
      return;
    }

    if (canUseTauri()) {
      try {
        setFileOperation({ active: true, message: "Saving...", cancellable: false });
        await saveProjectToPath(project, projectPackagePaths.projectPath, getAudioWorkstationState());
        setHasUnsavedChanges(false);
        setStatus("Project saved.");
        if (intent === "new-project") {
          createNewProject();
        }
      } catch (error) {
        console.error(error);
        setStatus("Save failed.");
      } finally {
        setFileOperation({ active: false, message: "", cancellable: false });
      }
      return;
    }

    setStatus("Save requires Tauri runtime.");
  }

  async function handleSaveAsProject(intent: SaveIntent = "manual") {
    cancelPagePrompt();

    if (canUseTauri()) {
      try {
        setFileOperation({ active: true, message: "Opening save dialog...", cancellable: false });
        const savedPaths = await saveProjectWithNativeDialog(project, projectName, getAudioWorkstationState());
        if (!savedPaths) {
          setStatus("Save cancelled.");
          return;
        }

        setProjectName(savedPaths.projectName);
        setProjectPackagePaths(savedPaths);
        setHasUnsavedChanges(false);
        setDialogState("none");
        setStatus("Project saved as.");
        if (intent === "new-project") {
          createNewProject();
        }
      } catch (error) {
        console.error(error);
        setStatus("Save failed.");
      } finally {
        setFileOperation({ active: false, message: "", cancellable: false });
      }
      return;
    }

    const fallbackPaths = await getDefaultProjectPackagePaths(projectName);
    setProjectName(fallbackPaths.projectName);
    setProjectPackagePaths(fallbackPaths);
    setDialogState("none");
    setStatus("Save As requires Tauri runtime.");
  }

  async function handleLoadProject() {
    cancelPagePrompt();

    if (!canUseTauri()) {
      setStatus("Load requires Tauri runtime.");
      return;
    }

    try {
      setFileOperation({ active: true, message: "Opening project...", cancellable: false });
      const loaded = await loadProjectWithNativeDialog();
      if (!loaded) {
        setStatus("Load cancelled.");
        return;
      }

      setProject(loaded.project);
      setHistory(createHistory(loaded.project));
      setProjectName(loaded.projectName);
      setProjectPackagePaths({
        projectName: loaded.projectName,
        projectPath: loaded.projectPath,
        imageDir: loaded.imageDir,
        movieDir: loaded.movieDir,
        recordDir: loaded.recordDir,
      });
      setPlaybackIndex(loaded.project.currentPageIndex);
      const legacyRecordingMaterials = loaded.audio.recordings.filter(
        (recording) => !loaded.audio.audioMaterials.some((material) => material.id === recording.id),
      );
      const loadedAudioMaterials = [...loaded.audio.audioMaterials, ...legacyRecordingMaterials];
      const loadedTimelineClips = loaded.audio.timelineClips.map((clip) => (
        clip.sourceType === "recording" ? { ...clip, sourceType: "material" as const } : clip
      ));
      setAudioMaterials(loadedAudioMaterials);
      recordingsRef.current = [];
      setRecordings([]);
      materializedRecordingIdsRef.current = new Set();
      setMaterializedRecordingIds(new Set());
      setTimelineClips(loadedTimelineClips.map(normalizeTimelineClip));
      setAudioAssets(await validateAudioAssets(loaded.projectPath, loaded.audio.audioAssets));
      setAudioTracks(normalizeAudioTracks(loaded.audio.audioTracks, loadedTimelineClips.map(normalizeTimelineClip), loaded.audio.audioAssets));
      setCopiedFrame(null);
      setIsPlaying(false);
      setStopArmedForReset(false);
      setHasUnsavedChanges(false);
      setDialogState("none");
      setStatus(`Loaded ${getProjectFileName({
        projectName: loaded.projectName,
        projectPath: loaded.projectPath,
        imageDir: loaded.imageDir,
        movieDir: loaded.movieDir,
        recordDir: loaded.recordDir,
      }, loaded.projectName)}.`);
    } catch (error) {
      console.error(error);
      setStatus("Load failed.");
    } finally {
      setFileOperation({ active: false, message: "", cancellable: false });
    }
  }

  function togglePlayback() {
    setStopArmedForReset(false);
    setIsPlaying((current) => !current);
  }

  function seekPlaybackFrame(index: number) {
    const nextIndex = clampIndex(index, project.frames.length);
    setPlaybackIndex(nextIndex);
    setStopArmedForReset(false);
    if (mode === "audio" && isPlaying) {
      void scheduleTimelineAudio(nextIndex);
    }
  }

  function handleStopPlayback() {
    if (isPlaying) {
      setIsPlaying(false);
      setStopArmedForReset(true);
      return;
    }

    if (stopArmedForReset) {
      setPlaybackIndex(0);
      setStopArmedForReset(false);
      return;
    }

    setStopArmedForReset(true);
  }

  async function openExportDialog(nextTab: ExportTab = exportTab) {
    cancelPagePrompt();
    const paths = projectPackagePaths ?? (await getDefaultProjectPackagePaths(projectName));
    setProjectPackagePaths(paths);
    setExportTab(nextTab);
    setExportFps(project.fps);
    setExportPath(getDefaultExportPath(paths, nextTab, nextTab === "image" ? imageExportFormat : videoExportFormat));
    setDialogState("export");
  }

  async function handleExportProject() {
    if (!exportPath.trim()) {
      setStatus("Choose an export destination.");
      return;
    }

    if (!canUseTauri()) {
      setStatus("Export requires Tauri runtime.");
      return;
    }

    try {
      exportCancelledRef.current = false;
      setFileOperation({ active: true, message: "Exporting...", cancellable: true });
      setExportProgress({ active: true, label: "Preparing export", percent: 0 });
      setStatus("Exporting...");
      const exportSampleRate = getExportSampleRate(exportAudioQuality);
      if (exportTab === "image") {
        const frameIndexes = imageExportScope === "all" ? project.frames.map((_, index) => index) : [...selectedExportFrames].sort((a, b) => a - b);
        if (frameIndexes.length === 0) {
          setStatus("Select at least one frame.");
          return;
        }

        for (let index = 0; index < frameIndexes.length; index += 1) {
          throwIfExportCancelled();
          const frameIndex = frameIndexes[index];
          setExportProgress({ active: true, label: "Rendering images", percent: Math.round((index / frameIndexes.length) * 90) });
          const bytes = await renderFrameBytes(project, frameIndex, imageExportFormat, transparentExport, project.width, project.height);
          const path = buildImageExportPath(exportPath, imageExportFormat, frameIndexes.length, frameIndex);
          await writeBinaryFile(path, bytes);
        }
      } else {
        if (videoExportFormat === "Audio Only (WAV)") {
          const audioWav = await mixTimelineToWav(project.frames.length, exportSampleRate);
          if (!audioWav) {
            throw new Error("Audio-only export needs at least one timeline clip.");
          }
          setExportProgress({ active: true, label: "Writing WAV mix", percent: 80 });
          await exportVideoFromPngs(exportPath, [], exportFps, videoExportFormat, audioWav, true, project.width, project.height);
          setDialogState("none");
          setExportProgress({ active: false, label: "", percent: 100 });
          setStatus("Exported Audio Only (WAV).");
          return;
        }

        if (videoExportFormat === "Sprite Sheet") {
          const bytes = await renderSpriteSheet(project, project.frames.map((_, index) => index), transparentExport, project.width, project.height);
          await writeBinaryFile(exportPath.replace(/\.[^.\\/]+$/, "") + ".png", bytes);
          setExportProgress({ active: false, label: "", percent: 100 });
          setFileOperation({ active: false, message: "", cancellable: false });
          setDialogState("none");
          setStatus("Exported Sprite Sheet.");
          return;
        }

        const framePngs: Uint8Array[] = [];
        for (let index = 0; index < project.frames.length; index += 1) {
          throwIfExportCancelled();
          setExportProgress({ active: true, label: "Rendering video frames", percent: Math.round((index / project.frames.length) * 55) });
          framePngs.push(await renderFrameBytes(project, index, "PNG", transparentExport, project.width, project.height));
        }

        const audioWav =
          !videoOnlyExport && (videoExportFormat === "MP4" || videoExportFormat === "WebM")
            ? await mixTimelineToWav(project.frames.length, exportSampleRate)
            : null;
        throwIfExportCancelled();
        setExportProgress({ active: true, label: "Encoding animation", percent: 70 });
        await exportVideoFromPngs(exportPath, framePngs, exportFps, videoExportFormat, audioWav, videoOnlyExport, project.width, project.height);
      }

      setDialogState("none");
      setExportProgress({ active: false, label: "", percent: 100 });
      setStatus(`Exported ${exportTab === "image" ? imageExportFormat : videoExportFormat}.`);
    } catch (error) {
      console.error(error);
      setExportProgress({ active: false, label: "", percent: 0 });
      setStatus(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setFileOperation({ active: false, message: "", cancellable: false });
    }
  }

  function cancelExport() {
    exportCancelledRef.current = true;
    void cancelActiveExport();
    setStatus("Cancelling export...");
  }

  function throwIfExportCancelled() {
    if (exportCancelledRef.current) {
      throw new Error("Export cancelled.");
    }
  }

  function getAudioWorkstationState(): AudioWorkstationState {
    const tracks = mergeTimelineIntoAudioTracks(audioTracks, timelineClips, audioMaterials, [], playbackFps, audioAssets);
    return {
      audioMaterials,
      recordings: [],
      timelineClips,
      audioAssets,
      audioTracks: tracks,
    };
  }

  async function getAudioContext(): Promise<AudioContext> {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }

  async function loadAudioBufferForClip(clip: TimelineClip, context: BaseAudioContext): Promise<AudioBuffer | null> {
    const source = clip.sourceType === "material"
      ? audioMaterials.find((asset) => asset.id === clip.sourceId)
      : recordings.find((recording) => recording.id === clip.sourceId);
    const persistedSource = source ?? (
      audioAssets[clip.sourceId]
        ? {
          id: audioAssets[clip.sourceId].id,
          name: audioAssets[clip.sourceId].name,
          path: audioAssets[clip.sourceId].originalPath,
          extension: audioAssets[clip.sourceId].extension,
          durationMs: audioAssets[clip.sourceId].durationMs,
          waveformSummary: audioAssets[clip.sourceId].waveformSummary,
          isOffline: audioAssets[clip.sourceId].isOffline,
        }
        : null
    );
    if (!persistedSource) {
      return null;
    }

    const cacheKey = `${persistedSource.path}:${clip.reversed ? "rev" : "fwd"}`;
    const cached = audioBufferCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const sourcePath = resolveAudioPath(persistedSource.path, projectPackagePaths);
    const response = await fetch(canUseTauri() ? convertFileSrc(sourcePath) : sourcePath);
    const bytes = await response.arrayBuffer();
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const buffer = clip.reversed ? reverseAudioBuffer(decoded, context) : decoded;
    audioBufferCacheRef.current.set(cacheKey, buffer);
    return buffer;
  }

  async function scheduleTimelineAudio(startFrame: number) {
    stopScheduledTimelineAudio();
    const context = await getAudioContext();
    const now = context.currentTime + 0.03;
    const startSeconds = startFrame / playbackFps;

    for (const clip of timelineClips) {
      const clipStartSeconds = clip.startFrame / playbackFps;
      const clipDurationSeconds = (clip.durationFrames * clip.loopCount) / playbackFps;
      const clipEndSeconds = clipStartSeconds + clipDurationSeconds;
      if (clipEndSeconds <= startSeconds) {
        continue;
      }

      const buffer = await loadAudioBufferForClip(clip, context);
      if (!buffer) {
        continue;
      }

      const sourceOffset = Math.max(0, startSeconds - clipStartSeconds);
      const startDelay = Math.max(0, clipStartSeconds - startSeconds);
      const playDuration = Math.max(0, clipDurationSeconds - sourceOffset);
      const source = context.createBufferSource();
      const gain = context.createGain();
      const trackGain = context.createGain();
      const panner = context.createStereoPanner();
      const track = audioTracks[clip.trackIndex] ?? createDefaultAudioTracks()[clip.trackIndex];
      source.buffer = buffer;
      source.loop = clip.loopCount > 1;
      source.loopStart = clip.sourceOffsetFrames / playbackFps;
      source.loopEnd = Math.min(buffer.duration, (clip.sourceOffsetFrames + clip.durationFrames) / playbackFps);
      gain.gain.value = clip.volume;
      trackGain.gain.value = getEffectiveTrackGain(track, audioTracks);
      panner.pan.value = clip.panning;
      applyClipFades(gain.gain, clip, now + startDelay, playDuration, playbackFps);
      source.connect(gain).connect(panner).connect(trackGain).connect(context.destination);
      source.start(now + startDelay, clip.sourceOffsetFrames / playbackFps + sourceOffset, playDuration);
      scheduledAudioRef.current.push(source);
    }
  }

  function stopScheduledTimelineAudio() {
    for (const node of scheduledAudioRef.current) {
      try {
        if ("stop" in node) {
          node.stop();
        }
        node.disconnect();
      } catch {
        // Sources may already be stopped by the audio clock.
      }
    }
    scheduledAudioRef.current = [];
  }

  async function mixTimelineToWav(frameCount: number, sampleRate = 44100): Promise<Uint8Array | null> {
    if (timelineClips.length === 0) {
      return null;
    }

    const durationSeconds = Math.max(0.1, frameCount / playbackFps);
    const context = new OfflineAudioContext(2, Math.ceil(durationSeconds * sampleRate), sampleRate);

    for (const clip of timelineClips) {
      const buffer = await loadAudioBufferForClip(clip, context);
      if (!buffer) {
        continue;
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      const trackGain = context.createGain();
      const panner = context.createStereoPanner();
      const track = audioTracks[clip.trackIndex] ?? createDefaultAudioTracks()[clip.trackIndex];
      source.buffer = buffer;
      source.loop = clip.loopCount > 1;
      source.loopStart = clip.sourceOffsetFrames / playbackFps;
      source.loopEnd = Math.min(buffer.duration, (clip.sourceOffsetFrames + clip.durationFrames) / playbackFps);
      gain.gain.value = clip.volume;
      trackGain.gain.value = getEffectiveTrackGain(track, audioTracks);
      panner.pan.value = clip.panning;
      const startAt = clip.startFrame / playbackFps;
      const duration = (clip.durationFrames * clip.loopCount) / playbackFps;
      applyClipFades(gain.gain, clip, startAt, duration, playbackFps);
      source.connect(gain).connect(panner).connect(trackGain).connect(context.destination);
      source.start(startAt, clip.sourceOffsetFrames / playbackFps, duration);
    }

    const rendered = await context.startRendering();
    return encodeAudioBufferWav(rendered);
  }

  async function addAudioMaterials() {
    if (!canUseTauri()) {
      setStatus("Audio import requires Tauri runtime.");
      return;
    }

    const files = await selectAudioFiles();
    if (files.length === 0) {
      setStatus("Audio import cancelled.");
      return;
    }

    setAudioMaterials((current) => [...current, ...files]);
    setAudioAssets((current) => ({
      ...current,
      ...Object.fromEntries(files.map((file) => [file.id, audioFileToAsset(file)])),
    }));
    setStatus(`${files.length} audio material${files.length === 1 ? "" : "s"} added.`);
  }

  async function bundleAudioAssets() {
    if (!projectPackagePaths) {
      setStatus("Save the project before bundling assets.");
      return;
    }

    try {
      const bundled = await bundleProjectAssets(projectPackagePaths.projectPath, audioAssets);
      setAudioAssets(bundled);
      setAudioMaterials((current) =>
        current.map((asset) => {
          const bundledAsset = bundled[asset.id];
          return bundledAsset ? { ...asset, path: bundledAsset.originalPath, isOffline: bundledAsset.isOffline } : asset;
        }),
      );
      setStatus("Audio assets bundled into assets/.");
    } catch (error) {
      console.error(error);
      setStatus("Bundle export failed.");
    }
  }

  function updateAudioTrack(trackId: string, changes: Partial<PersistedAudioTrack>) {
    setAudioTracks((tracks) => tracks.map((track) => (track.id === trackId ? { ...track, ...changes } : track)));
    setHasUnsavedChanges(true);
  }

  async function openRecordDialog() {
    setDialogState("record");
    await requestMicrophonePermissionForRecordModal();
  }

  async function requestMicrophonePermissionForRecordModal() {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      const message = "Microphone access is unsupported or blocked. Use a secure context and enable microphone permission.";
      setMicrophonePermissionState("unsupported");
      setMicrophonePermissionMessage(message);
      setStatus(message);
      return;
    }

    setMicrophonePermissionState("checking");
    setMicrophonePermissionMessage("Checking microphone permission...");

    try {
      const permissionState = await getMicrophonePermissionState();
      if (permissionState === "granted") {
        setMicrophonePermissionState("granted");
        setMicrophonePermissionMessage("Microphone access is ready.");
        await refreshMicrophoneDevices();
        return;
      }

      const stream = await mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophonePermissionState("granted");
      setMicrophonePermissionMessage("Microphone access is ready.");
      await refreshMicrophoneDevices();
    } catch (error) {
      console.error(error);
      const message = getMicrophoneAccessErrorMessage(error);
      setMicrophonePermissionState(message.includes("denied") ? "denied" : "unsupported");
      setMicrophonePermissionMessage(message);
      setStatus(message);
    }
  }

  async function getMicrophonePermissionState(): Promise<PermissionState | "unsupported"> {
    if (!navigator.permissions?.query) {
      return "unsupported";
    }

    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      return result.state;
    } catch {
      return "unsupported";
    }
  }

  async function refreshMicrophoneDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      setMicDevices(inputs);
      setSelectedMicId((current) => current || inputs[0]?.deviceId || "");
    } catch {
      setMicDevices([]);
    }
  }

  async function handleRecordButtonClick() {
    if (isRecording) {
      await stopRecording();
      return;
    }

    if (!recordCountdownEnabled) {
      await startRecording();
      return;
    }

    await startRecordingAfterCountdown();
  }

  function cancelRecordCountdown() {
    if (recordCountdownTimeoutRef.current !== null) {
      window.clearTimeout(recordCountdownTimeoutRef.current);
      recordCountdownTimeoutRef.current = null;
    }
    recordCountdownTokenRef.current = null;
    setRecordCountdownRemaining(0);
    recordCountdownStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordCountdownStreamRef.current = null;
  }

  async function startRecordingAfterCountdown() {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      await startRecording();
      return;
    }

    let stream: MediaStream | null = null;
    const token = Date.now();
    recordCountdownTokenRef.current = token;
    try {
      stream = await mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      });
      recordCountdownStreamRef.current = stream;
      setMicrophonePermissionState("granted");
      setMicrophonePermissionMessage("Microphone access is ready.");
      setStatus("Recording starts in 3...");

      for (let remaining = 3; remaining > 0; remaining -= 1) {
        if (recordCountdownTokenRef.current !== token) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setRecordCountdownRemaining(remaining);
        await new Promise<void>((resolve) => {
          recordCountdownTimeoutRef.current = window.setTimeout(resolve, 1000);
        });
      }

      if (recordCountdownTokenRef.current !== token) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      recordCountdownTimeoutRef.current = null;
      recordCountdownTokenRef.current = null;
      recordCountdownStreamRef.current = null;
      setRecordCountdownRemaining(0);
      await startRecording(stream);
    } catch (error) {
      console.error(error);
      stream?.getTracks().forEach((track) => track.stop());
      recordCountdownStreamRef.current = null;
      recordCountdownTokenRef.current = null;
      setRecordCountdownRemaining(0);
      const message = getMicrophoneAccessErrorMessage(error);
      setMicrophonePermissionState(message.includes("denied") ? "denied" : "unsupported");
      setMicrophonePermissionMessage(message);
      setStatus(message);
    }
  }

  async function startRecording(preparedStream?: MediaStream) {
    if (!canUseTauri()) {
      setStatus("Recording save requires Tauri runtime.");
      return;
    }

    if (!projectPackagePaths) {
      setStatus("Save the project before recording.");
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setIsRecording(false);
      setRecordingElapsedMs(0);
      setRecordingLevel(0);
      setRecordingWaveform(Array.from({ length: 64 }, () => 0));
      const message = "Microphone access is unsupported or blocked. Use a secure context and enable microphone permission.";
      setMicrophonePermissionState("unsupported");
      setMicrophonePermissionMessage(message);
      setStatus(message);
      return;
    }

    let stream: MediaStream | null = preparedStream ?? null;
    try {
      stream ??= await mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      });
      const activeStream = stream;
      stopAudioFile();
      setIsRecording(true);
      setIsRecordingPaused(false);
      recordingPausedRef.current = false;
      recordingPausedStartedAtRef.current = 0;
      recordingPausedDurationRef.current = 0;
      setRecordingElapsedMs(0);
      setRecordingLevel(0);
      setRecordingWaveform(Array.from({ length: 64 }, () => 0));
      setMicrophonePermissionState("granted");
      setMicrophonePermissionMessage("Microphone access is ready.");
      setStatus("Recording...");

      const context = new AudioContext();
      const source = context.createMediaStreamSource(activeStream);
      const analyser = context.createAnalyser();
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;
      processor.onaudioprocess = (event) => {
        if (recordingPausedRef.current) {
          return;
        }
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(context.destination);
      startRecordingMonitor(analyser, context);
      wavRecordingRef.current = { context, source, processor, analyser, stream: activeStream, chunks, sampleRate: context.sampleRate };
    } catch (error) {
      console.error(error);
      stream?.getTracks().forEach((track) => track.stop());
      wavRecordingRef.current = null;
      stopRecordingMonitor();
      setIsRecording(false);
      setIsRecordingPaused(false);
      recordingPausedRef.current = false;
      setRecordingElapsedMs(0);
      setRecordingLevel(0);
      setRecordingWaveform(Array.from({ length: 64 }, () => 0));
      const message = getMicrophoneAccessErrorMessage(error);
      setMicrophonePermissionState(message.includes("denied") ? "denied" : "unsupported");
      setMicrophonePermissionMessage(message);
      setStatus(message);
    }
  }

  async function stopRecording() {
    if (wavRecordingRef.current) {
      const recording = wavRecordingRef.current;
      setIsRecordingPaused(false);
      recordingPausedRef.current = false;
      recording.processor.disconnect();
      recording.analyser.disconnect();
      recording.source.disconnect();
      stopRecordingMonitor(false);
      await recording.context.close();
      recording.stream.getTracks().forEach((track) => track.stop());
      wavRecordingRef.current = null;
      try {
        await saveRecordingBytes(encodeWav(recording.chunks, recording.sampleRate), recordingFormat);
      } catch (error) {
        console.error(error);
        setStatus(recordingFormat === "mp3" ? "MP3 recording save failed. Check that ffmpeg is installed." : "Recording save failed.");
      } finally {
        setIsRecording(false);
      }
      return;
    }

    setIsRecording(false);
    setIsRecordingPaused(false);
    recordingPausedRef.current = false;
  }

  async function toggleRecordingPause() {
    const recording = wavRecordingRef.current;
    if (!recording || !isRecording) {
      return;
    }

    if (recordingPausedRef.current) {
      recordingPausedDurationRef.current += performance.now() - recordingPausedStartedAtRef.current;
      recordingPausedStartedAtRef.current = 0;
      recordingPausedRef.current = false;
      setIsRecordingPaused(false);
      setStatus("Recording...");
      if (recording.context.state === "suspended") {
        await recording.context.resume();
      }
      return;
    }

    recordingPausedStartedAtRef.current = performance.now();
    recordingPausedRef.current = true;
    setIsRecordingPaused(true);
    setRecordingLevel(0);
    setRecordingWaveform(Array.from({ length: 64 }, () => 0));
    setStatus("Recording paused.");
    if (recording.context.state === "running") {
      await recording.context.suspend();
    }
  }

  function startRecordingMonitor(analyser: AnalyserNode, context: AudioContext) {
    stopRecordingMonitor();
    const waveformData = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();

    const update = () => {
      analyser.getByteTimeDomainData(waveformData);
      if (recordingPausedRef.current) {
        const monitor = recordingMonitorRef.current;
        setRecordingLevel(0);
        setRecordingWaveform(Array.from({ length: 64 }, () => 0));
        setRecordingElapsedMs(recordingPausedStartedAtRef.current - startedAt - recordingPausedDurationRef.current);
        if (monitor) {
          monitor.rafId = window.requestAnimationFrame(update);
        }
        return;
      }
      let peak = 0;
      let sumSquares = 0;
      const bucketCount = 64;
      const bucketSize = Math.max(1, Math.floor(waveformData.length / bucketCount));
      const nextWaveform: number[] = [];

      for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
        let bucketPeak = 0;
        const start = bucketIndex * bucketSize;
        const end = Math.min(waveformData.length, start + bucketSize);
        for (let index = start; index < end; index += 1) {
          const sample = ((waveformData[index] ?? 128) - 128) / 128;
          const magnitude = Math.abs(sample);
          peak = Math.max(peak, magnitude);
          bucketPeak = Math.max(bucketPeak, magnitude);
          sumSquares += sample * sample;
        }
        nextWaveform.push(Math.min(1, bucketPeak));
      }

      const rms = Math.sqrt(sumSquares / waveformData.length);
      setRecordingElapsedMs(performance.now() - startedAt - recordingPausedDurationRef.current);
      setRecordingLevel(Math.min(1, Math.max(peak, rms * 1.8)));
      setRecordingWaveform(nextWaveform);

      const monitor = recordingMonitorRef.current;
      if (monitor) {
        monitor.rafId = window.requestAnimationFrame(update);
      }
    };

    recordingMonitorRef.current = {
      analyser,
      context,
      rafId: window.requestAnimationFrame(update),
      startedAt,
    };
  }

  function stopRecordingMonitor(resetVisuals = true) {
    const monitor = recordingMonitorRef.current;
    if (!monitor) {
      return;
    }

    window.cancelAnimationFrame(monitor.rafId);
    recordingMonitorRef.current = null;
    if (resetVisuals) {
      setRecordingElapsedMs(0);
      setRecordingLevel(0);
      setRecordingWaveform(Array.from({ length: 64 }, () => 0));
    }
  }

  async function saveRecordingBytes(bytes: Uint8Array, extension: RecordingFormat) {
    if (!projectPackagePaths) {
      return;
    }

    const recordingName = `recording_${String(recordings.length + 1).padStart(2, "0")}`;
    const path = `${projectPackagePaths.recordDir}/${recordingName}.${extension}`;
    const savedPath = extension === "mp3"
      ? await encodeWavToMp3File(path, bytes)
      : await writeBinaryFile(path, bytes);
    const recording = {
      id: savedPath,
      name: recordingName,
      path: savedPath,
      extension: `.${extension}`,
      durationMs: estimateRecordingDurationMs(bytes, extension),
      waveformSummary: summarizePcmBytes(bytes),
    };
    setRecordings((current) => {
      const next = [...current, recording];
      recordingsRef.current = next;
      return next;
    });
    setStatus("Recording saved.");
  }

  async function renameRecording(recording: RecordedAudio) {
    const nextName = window.prompt("Rename recording", recording.name);
    if (!nextName?.trim()) {
      return;
    }

    try {
      const nextPath = await renameFile(recording.path, nextName);
      const fileName = nextPath.split(/[\\/]/).pop() ?? nextName;
      const cleanName = fileName.replace(/\.[^.]+$/, "");
      setRecordings((current) =>
        current.map((candidate) =>
          candidate.id === recording.id ? { ...candidate, id: nextPath, name: cleanName, path: nextPath } : candidate,
        ),
      );
      setAudioAssets((current) => {
        const next = { ...current };
        delete next[recording.id];
        next[nextPath] = {
          ...audioFileToAsset({ ...recording, id: nextPath, name: cleanName, path: nextPath }),
          waveformSummary: current[recording.id]?.waveformSummary ?? [],
        };
        return next;
      });
      setTimelineClips((clips) =>
        clips.map((clip) =>
          clip.sourceId === recording.id ? { ...clip, sourceId: nextPath, name: cleanName } : clip,
        ),
      );
      setStatus("Recording renamed.");
    } catch (error) {
      console.error(error);
      setStatus("Rename failed.");
    }
  }

  function playAudioFile(path: string) {
    if (activeAudioPath === path) {
      stopAudioFile();
      return;
    }

    audioPlayerRef.current?.pause();
    const sourcePath = resolveAudioPath(path, projectPackagePaths);
    const audio = new Audio(canUseTauri() ? convertFileSrc(sourcePath) : sourcePath);
    audio.onended = () => {
      if (audioPlayerRef.current === audio) {
        audioPlayerRef.current = null;
        setActiveAudioPath(null);
      }
    };
    audio.onpause = () => {
      if (audioPlayerRef.current === audio) {
        audioPlayerRef.current = null;
        setActiveAudioPath(null);
      }
    };
    audioPlayerRef.current = audio;
    setActiveAudioPath(path);
    void audio.play();
  }

  function stopAudioFile() {
    audioPlayerRef.current?.pause();
    audioPlayerRef.current = null;
    setActiveAudioPath(null);
  }

  async function deleteAudioSource(sourceId: string, sourceKind: "material" | "recording") {
    const source = sourceKind === "material"
      ? audioMaterials.find((asset) => asset.id === sourceId)
      : recordings.find((recording) => recording.id === sourceId);

    if (!source) {
      return;
    }

    if (activeAudioPath === source.path) {
      stopAudioFile();
    }

    if (sourceKind === "material") {
      setAudioMaterials((current) => current.filter((asset) => asset.id !== sourceId));
    } else {
      setRecordings((current) => current.filter((recording) => recording.id !== sourceId));
    }

    setAudioAssets((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });

    setTimelineClips((clips) => clips.filter((clip) => clip.sourceId !== sourceId));
    setHasUnsavedChanges(true);
    setAudioAssetContextMenu(null);
    setStatus(`${source.name} deleted.`);

    if (sourceKind === "material" && isGeneratedRecordingMaterialPath(source.path, projectPackagePaths)) {
      try {
        await deleteFile(source.path);
      } catch (error) {
        console.error(error);
      }
    }
  }

  async function addClipToTimeline(source: AudioFilePath | RecordedAudio, sourceType: TimelineClipSource, trackIndex: number, startFrame: number) {
    const clampedStartFrame = Math.max(0, snapTimelineFrame(startFrame, snapEnabled));
    const sourceDurationFrames = getKnownSourceDurationFrames(source.id) ?? await getSourceDurationFrames(source, sourceType);
    const durationFrames = Math.max(1, sourceDurationFrames);
    const clip: TimelineClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sourceId: source.id,
      sourceType,
      name: source.name,
      trackIndex,
      startFrame: clampedStartFrame,
      durationFrames,
      sourceOffsetFrames: 0,
      loopCount: 1,
      reversed: false,
      volume: 1,
      panning: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    };
    setTimelineClips((current) => [...current, clip]);
    setHasUnsavedChanges(true);
    setSelectedClipId(clip.id);
    setStatus(`Placed ${source.name} on track ${trackIndex + 1}.`);
  }

  async function deleteRecording(recording: RecordedAudio) {
    if (activeAudioPath === recording.path) {
      stopAudioFile();
    }
    setRecordings((current) => {
      const next = current.filter((candidate) => candidate.id !== recording.id);
      recordingsRef.current = next;
      return next;
    });
    try {
      await deleteFile(recording.path);
    } catch (error) {
      console.error(error);
    }
    setStatus(`${recording.name} removed from takes.`);
  }

  async function addRecordingTakeToTimeline(recording: RecordedAudio) {
    if (materializedRecordingIdsRef.current.has(recording.id)) {
      setStatus(`${recording.name} is already in Material Library.`);
      return;
    }
    if (!projectPackagePaths) {
      setStatus("Save the project before adding a recording material.");
      return;
    }
    const materialPath = buildRecordedMaterialPath(recording, projectPackagePaths.recordDir);
    const copiedPath = await copyFile(recording.path, materialPath);
    const material = {
      ...recording,
      id: copiedPath,
      path: copiedPath,
      name: `${recording.name}_material`,
    };
    setAudioMaterials((current) => current.some((asset) => asset.id === material.id) ? current : [...current, material]);
    setAudioAssets((current) => current[material.id] ? current : { ...current, [material.id]: audioFileToAsset(material) });
    setMaterializedRecordingIds((current) => {
      const next = new Set(current).add(recording.id);
      materializedRecordingIdsRef.current = next;
      return next;
    });
    setHasUnsavedChanges(true);
    setStatus(`${recording.name} added to Material Library.`);
  }

  async function clearRecordingTakes() {
    const takes = recordingsRef.current;
    stopAudioFile();
    recordingsRef.current = [];
    setRecordings([]);
    materializedRecordingIdsRef.current = new Set();
    setMaterializedRecordingIds(new Set());

    await Promise.all(takes.map(async (recording) => {
      try {
        await deleteFile(recording.path);
      } catch (error) {
        console.error(error);
      }
    }));
    setStatus("Takes cleared.");
  }

  async function closeRecordDialog() {
    cancelRecordCountdown();
    if (isRecording) {
      await stopRecording();
    }
    await clearRecordingTakes();
    setDialogState("none");
  }

  function moveClipOnTimeline(clipId: string, trackIndex: number, startFrame: number) {
    const nextStartFrame = Math.max(0, snapTimelineFrame(startFrame, snapEnabled));
    setTimelineClips((current) =>
      current.map((clip) => (
        clip.id === clipId
          ? { ...clip, trackIndex, startFrame: nextStartFrame }
          : clip
      )),
    );
    setHasUnsavedChanges(true);
    setSelectedClipId(clipId);
    setStatus(`Moved clip to track ${trackIndex + 1}.`);
  }

  function startPointerTimelineDrag(drag: PointerTimelineDrag) {
    pointerTimelineCleanupRef.current?.();
    pointerTimelineDragRef.current = drag;
    setPointerTimelineDrag(drag);

    const onPointerMove = (event: PointerEvent) => {
      const current = pointerTimelineDragRef.current;
      if (!current) {
        return;
      }

      const moved = Math.abs(event.clientX - current.startX) > 2 || Math.abs(event.clientY - current.startY) > 2;
      const next = {
        ...current,
        pointerX: event.clientX,
        pointerY: event.clientY,
        hasMoved: current.hasMoved || moved,
      };
      pointerTimelineDragRef.current = next;
      setPointerTimelineDrag(next);
    };

    const finishPointerDrag = (event: PointerEvent) => {
      const current = pointerTimelineDragRef.current;
      pointerTimelineCleanupRef.current?.();
      pointerTimelineCleanupRef.current = null;
      pointerTimelineDragRef.current = null;
      setPointerTimelineDrag(null);

      if (current?.hasMoved) {
        dropPointerTimelineDrag(current, event.clientX, event.clientY);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishPointerDrag);
    window.addEventListener("pointercancel", finishPointerDrag);
    pointerTimelineCleanupRef.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
    };
  }

  function beginSourcePointerDrag(
    event: React.PointerEvent<HTMLElement>,
    source: AudioFilePath | RecordedAudio,
    sourceType: TimelineClipSource,
  ) {
    if (event.button !== 0 || event.target instanceof HTMLButtonElement) {
      return;
    }

    event.preventDefault();
    const payload: TimelineSourceDragPayload = { kind: "source", id: source.id, type: sourceType };
    startPointerTimelineDrag({
      payload,
      name: source.name,
      extension: source.extension,
      durationFrames: getKnownSourceDurationFrames(source.id) ?? Math.max(1, Math.round(playbackFps * 2)),
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginClipPointerDrag(event: React.PointerEvent<HTMLElement>, clip: TimelineClip) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const trackElement = event.currentTarget.closest<HTMLElement>(".timeline-track");
    const offsetFrames = trackElement
      ? Math.max(0, getFrameFromTrackPointer(trackElement, event.clientX, timelinePixelsPerFrame, snapEnabled) - clip.startFrame)
      : 0;
    const payload: TimelineMoveDragPayload = { kind: "clip", clipId: clip.id, offsetFrames };
    startPointerTimelineDrag({
      payload,
      name: clip.name,
      durationFrames: Math.max(1, clip.durationFrames * clip.loopCount),
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    });
    setSelectedClipId(clip.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dropPointerTimelineDrag(drag: PointerTimelineDrag, clientX: number, clientY: number) {
    const pointedElement = document.elementFromPoint(clientX, clientY);
    const trackElement = pointedElement?.closest<HTMLElement>(".timeline-track[data-track-index]");
    if (!trackElement) {
      return;
    }

    const trackIndex = Number(trackElement.dataset.trackIndex);
    if (!Number.isFinite(trackIndex)) {
      return;
    }

    const rawStartFrame = getFrameFromTrackPointer(trackElement, clientX, timelinePixelsPerFrame, snapEnabled);
    const startFrame = drag.payload.kind === "clip"
      ? Math.max(0, rawStartFrame - drag.payload.offsetFrames)
      : rawStartFrame;

    if (drag.payload.kind === "clip") {
      moveClipOnTimeline(drag.payload.clipId, trackIndex, startFrame);
      return;
    }

    const payload = drag.payload;
    const source =
      payload.type === "material"
        ? audioMaterials.find((asset) => asset.id === payload.id)
        : recordings.find((recording) => recording.id === payload.id);
    if (source) {
      void addClipToTimeline(source, payload.type, trackIndex, startFrame);
    }
  }

  async function getSourceDurationFrames(source: AudioFilePath | RecordedAudio, sourceType: TimelineClipSource): Promise<number> {
    try {
      const context = await getAudioContext();
      const tempClip = normalizeTimelineClip({
        id: "duration-probe",
        sourceId: source.id,
        sourceType,
        name: source.name,
        trackIndex: 0,
        startFrame: 0,
        durationFrames: 1,
        sourceOffsetFrames: 0,
        loopCount: 1,
        reversed: false,
        volume: 1,
        panning: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
      });
      const buffer = await loadAudioBufferForClip(tempClip, context);
      return Math.max(1, Math.ceil((buffer?.duration ?? 2) * playbackFps));
    } catch {
      return Math.max(1, Math.round(playbackFps * 2));
    }
  }

  function getKnownSourceDurationFrames(sourceId: string): number | null {
    const durationMs = audioAssets[sourceId]?.durationMs;
    if (!durationMs || durationMs <= 0) {
      return null;
    }

    return Math.max(1, Math.ceil((durationMs / 1000) * playbackFps));
  }

  function copySelectedClip() {
    const clip = timelineClips.find((candidate) => candidate.id === selectedClipId);
    if (clip) {
      setClipClipboard(clip);
      setStatus("Clip copied.");
    }
  }

  function pasteClipAtPlayhead() {
    if (!clipClipboard) {
      return;
    }

    const clip = {
      ...clipClipboard,
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startFrame: playbackIndex,
    };
    setTimelineClips((current) => [...current, clip]);
    setSelectedClipId(clip.id);
  }

  function deleteSelectedClip() {
    if (!selectedClipId) {
      return;
    }

    setTimelineClips((current) => current.filter((clip) => clip.id !== selectedClipId));
    setSelectedClipId(null);
    setClipContextMenu(null);
  }

  function duplicateSelectedClip() {
    const clip = timelineClips.find((candidate) => candidate.id === selectedClipId);
    if (!clip) {
      return;
    }

    const duplicate = { ...clip, id: `clip-${Date.now()}`, startFrame: Math.min(project.frames.length - 1, clip.startFrame + 1) };
    setTimelineClips((current) => [...current, duplicate]);
    setSelectedClipId(duplicate.id);
  }

  function splitSelectedClip() {
    const clip = timelineClips.find((candidate) => candidate.id === selectedClipId);
    if (!clip || playbackIndex <= clip.startFrame || playbackIndex >= clip.startFrame + clip.durationFrames) {
      return;
    }

    const firstDuration = playbackIndex - clip.startFrame;
    const secondDuration = clip.durationFrames - firstDuration;
    const secondClip = {
      ...clip,
      id: `clip-${Date.now()}`,
      startFrame: playbackIndex,
      durationFrames: secondDuration,
      sourceOffsetFrames: clip.sourceOffsetFrames + firstDuration,
    };
    setTimelineClips((current) =>
      current.map((candidate) => (candidate.id === clip.id ? { ...candidate, durationFrames: firstDuration } : candidate)).concat(secondClip),
    );
    setSelectedClipId(secondClip.id);
  }

  function reverseSelectedClip() {
    setTimelineClips((current) =>
      current.map((clip) => (clip.id === selectedClipId ? { ...clip, reversed: !clip.reversed } : clip)),
    );
  }

  function renderLayerColorControl(layer: Layer, slot: 0 | 1) {
    const colorId = layer.colorIds[slot];
    const color = getPaletteColor(project, colorId);
    const isCurrentDrawingColor = project.activeLayerId === layer.id && colorSlot === slot;
    const isPopoverOpen = colorPopover?.layerId === layer.id && colorPopover.slot === slot;

    return (
      <div className="layer-color-row" key={`${layer.id}-${slot}`}>
        <button
          aria-label={`${layer.name} color ${slot + 1} ${color.name}`}
          className={isCurrentDrawingColor ? "layer-color-chip active-layer-color-chip" : "layer-color-chip"}
          onClick={() => {
            setActiveLayer(layer.id);
            setColorSlot(slot);
            setColorPopover(isCurrentDrawingColor ? (isPopoverOpen ? null : { layerId: layer.id, slot }) : null);
          }}
          style={{ background: color.css }}
          type="button"
        >
          <span>{color.name}</span>
        </button>
        {isPopoverOpen && (
          <div className="color-popover" role="dialog" aria-label={`${layer.name} color ${slot + 1}`}>
            {project.palette.map((candidate) => (
              <button
                aria-label={`${layer.name} color ${slot + 1} ${candidate.name}`}
                className={colorId === candidate.id ? "mini-swatch active-mini-swatch" : "mini-swatch"}
                key={candidate.id}
                onClick={() => updateLayerColor(layer.id, slot, candidate.id)}
                style={{ background: candidate.css }}
                type="button"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderBackgroundColorControl() {
    const backgroundColor = getPaletteColor(project, project.backgroundColorId);

    return (
      <div className="background-color-row">
        <button
          aria-label={`Background color ${backgroundColor.name}`}
          className="layer-color-chip background-color-chip"
          onClick={() => {
            cancelPagePrompt();
            setBackgroundPopoverOpen((isOpen) => !isOpen);
          }}
          style={{ background: backgroundColor.css }}
          type="button"
        >
          <span>{backgroundColor.name}</span>
        </button>
        {backgroundPopoverOpen && (
          <div className="color-popover" role="dialog" aria-label="Background color">
            {project.palette.map((candidate) => (
              <button
                aria-label={`Background ${candidate.name}`}
                className={project.backgroundColorId === candidate.id ? "mini-swatch active-mini-swatch" : "mini-swatch"}
                key={candidate.id}
                onClick={() => updateBackgroundColor(candidate.id)}
                style={{ background: candidate.css }}
                type="button"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderLeftPanel() {
    return (
      <aside className="panel left-panel">
        <div className="brand">
          <span>Project</span>
          <strong>Ugomemo</strong>
        </div>

        <section className="control-group">
          <h2>Draw Tool</h2>
          <div className="button-grid">
            {drawingToolOrder.map((candidate) => (
              <IconButton
                className={tool === candidate ? "active" : ""}
                icon={drawingToolIcons[candidate]}
                key={candidate}
                label={drawingToolRegistry[candidate].label}
                pressed={tool === candidate}
                shortcut={getToolShortcut(candidate, platform)}
                showLabel
                onClick={() => {
                  cancelPagePrompt();
                  clearPendingShapePreview();
                  setTool(candidate);
                }}
              />
            ))}
          </div>
        </section>

        <section className="control-group tool-settings-panel">
          <h2>Tool Settings</h2>
          <div className="tool-preview-shell">
            <canvas className="tool-preview-canvas" height={120} ref={toolPreviewRef} width={180} />
          </div>
          {renderToolSettingsPanel()}
        </section>

      </aside>
    );
  }

  function renderToolSettingsPanel() {
    const tonePattern = parseTonePattern(toolSettings.tonePattern);
    const updateTonePatternBase = (base: TonePatternBase) => {
      setToolSettings((current) => {
        const currentPattern = parseTonePattern(current.tonePattern);
        return { ...current, tonePattern: buildTonePattern(base, currentPattern.size) };
      });
    };
    const updateTonePatternSize = (size: TonePatternSize) => {
      setToolSettings((current) => {
        const currentPattern = parseTonePattern(current.tonePattern);
        return { ...current, tonePattern: buildTonePattern(currentPattern.base, size) };
      });
    };

    return (
      <div className="tool-settings-grid">
        {tool === "tone" ? (
          <>
            <div className="segmented-control-field">
              <span>Tone Mode</span>
              <div className="segmented-control" role="group" aria-label="Tone mode">
                <button
                  className={toolSettings.toneMode === "pen" ? "active" : ""}
                  onClick={() => setToolSettings((current) => ({ ...current, toneMode: "pen" }))}
                  type="button"
                >
                  Pen
                </button>
                <button
                  className={toolSettings.toneMode === "bucket" ? "active" : ""}
                  onClick={() => setToolSettings((current) => ({ ...current, toneMode: "bucket" }))}
                  type="button"
                >
                  Bucket
                </button>
              </div>
            </div>

            <div className="segmented-control-field">
              <span>Pattern</span>
              <div className="segmented-control tone-pattern-control" role="group" aria-label="Tone pattern">
                {TONE_PATTERN_BASES.map((option) => (
                  <button
                    className={tonePattern.base === option.value ? "active" : ""}
                    key={option.value}
                    onClick={() => updateTonePatternBase(option.value)}
                    type="button"
                  >
                    <span className={`tone-pattern-swatch ${option.value}`} aria-hidden="true" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="segmented-control-field">
              <span>Scale</span>
              <div className="segmented-control" role="group" aria-label="Tone scale">
                {TONE_PATTERN_SIZES.map((option) => (
                  <button
                    className={tonePattern.size === option.value ? "active" : ""}
                    key={option.value}
                    onClick={() => updateTonePatternSize(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label>
              Density
              <input
                min="1"
                max="24"
                type="range"
                value={toolSettings.toneDensity}
                onChange={(event) => setToolSettings((current) => ({ ...current, toneDensity: Number(event.target.value) }))}
              />
            </label>
          </>
        ) : (
          <label>
            Stroke Weight
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                min={BRUSH_SIZE_MIN}
                max={BRUSH_SIZE_MAX}
                type="range"
                value={toolSettings.size}
                onChange={(event) => setToolSettings((current) => ({ ...current, size: clampBrushSize(Number(event.target.value)) }))}
              />
              <input
                type="number"
                min={BRUSH_SIZE_MIN}
                max={BRUSH_SIZE_MAX}
                step={1}
                value={toolSettings.size}
                onChange={(event) => setToolSettings((current) => ({ ...current, size: clampBrushSize(Number(event.target.value)) }))}
                style={{ width: 64 }}
              />
            </div>
          </label>
        )}

        {(tool === "pen" || tool === "eraser" || tool === "shape" || (tool === "tone" && toolSettings.toneMode === "pen")) && (
          <label>
            Stroke Shape
            <select
              value={toolSettings.penShape}
              onChange={(event) => setToolSettings((current) => ({ ...current, penShape: event.target.value as ToolSettings["penShape"] }))}
            >
              <option value="round">Round</option>
              <option value="square">Square</option>
            </select>
          </label>
        )}

        {(tool === "pen" || tool === "eraser" || tool === "shape" || (tool === "tone" && toolSettings.toneMode === "pen")) && (
          <label>
            Antialias
            <IconButton
              className={toolSettings.antialias ? "tool-button active" : "tool-button"}
              icon={Blend}
              label={`Antialias ${toolSettings.antialias ? "on" : "off"}`}
              onClick={() => setToolSettings((current) => ({ ...current, antialias: !current.antialias }))}
            />
          </label>
        )}

        {tool === "shape" && (
          <label>
            Shape Type
            <select
              value={toolSettings.shapeType}
              onChange={(event) => {
                clearPendingShapePreview();
                setToolSettings((current) => ({ ...current, shapeType: event.target.value as ToolSettings["shapeType"] }));
              }}
            >
              <option value="line">Line</option>
              <option value="ellipse">Ellipse</option>
              <option value="triangle">Triangle</option>
              <option value="rectangle">Rectangle</option>
            </select>
          </label>
        )}

        {tool === "shape" && toolSettings.shapeType !== "line" && (
          <IconButton
            className={toolSettings.shapeFill ? "tool-button active" : "tool-button"}
            icon={PaintBucket}
            label={`Shape fill ${toolSettings.shapeFill ? "on" : "off"}`}
            onClick={() => setToolSettings((current) => ({ ...current, shapeFill: !current.shapeFill }))}
          />
        )}

        {pendingShapeStep && tool === "shape" && (
          <p className="shape-step-feedback">
            {pendingShapeStep.shapeType === "triangle"
              ? "Step 2: set base width"
              : pendingShapeStep.shapeType === "rectangle"
                ? "Step 2: set rectangle width"
                : "Step 2: set ellipse width"}
          </p>
        )}

        <p className="tool-color-readout">
          Color <strong>{selectedColor.name}</strong>
        </p>
      </div>
    );
  }

  function renderLayerPanel() {
    return (
      <aside className="panel right-panel">
        <section className="control-group">
          <h2>Layers</h2>
          <div className="layers">
            {layers.map((layer) => (
              <article className={project.activeLayerId === layer.id ? "layer active-layer" : "layer"} key={layer.id}>
                <button
                  aria-label={`Select layer ${layer.name}`}
                  className="layer-name-button"
                  type="button"
                  onClick={() => setActiveLayer(layer.id)}
                >
                  {layer.name}
                </button>
                <IconButton
                  className={layer.visible ? "layer-visibility-button active" : "layer-visibility-button"}
                  icon={layer.visible ? Eye : EyeOff}
                  label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                  onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                />
                <div className="layer-color-pickers">
                  {renderLayerColorControl(layer, 0)}
                  {renderLayerColorControl(layer, 1)}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="control-group">
          <h2>Background</h2>
          {renderBackgroundColorControl()}
        </section>

        <section className="control-group">
          <h2>Z Depth</h2>
          <div className="depth-layer-tabs">
            {layers.map((layer) => (
              <button
                className={project.activeLayerId === layer.id ? "active" : ""}
                key={layer.id}
                onClick={() => setActiveLayer(layer.id)}
                type="button"
              >
                {layer.name} Z{layer.zDepth}
              </button>
            ))}
          </div>
          <div className="bottom-z-selector" aria-label="Active layer Z depth selector">
            <span>{activeLayer.name}</span>
            <div className="bottom-z-rail">
              {Z_DEPTHS.map((depth) => (
                <button
                  aria-label={`${activeLayer.name} depth ${depth}`}
                  className={activeLayer.zDepth === depth ? "z-depth active-z-depth" : "z-depth"}
                  key={depth}
                  onClick={() => updateLayer(project.activeLayerId, { zDepth: depth })}
                  type="button"
                >
                  {depth}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="control-group">
          <h2>Layer Action</h2>
          <IconButton className="layer-clear-button" icon={PanelTopDashed} label={`Clear ${activeLayer.name}`} showLabel onClick={clearActiveLayer} />
        </section>
      </aside>
    );
  }

  function renderFrameRail(className = "frame-rail") {
    return (
      <div className={className} aria-label="Frame sequence" ref={frameRailRef}>
        {project.frames.map((frame, index) => (
          <button
            className={index === displayPageIndex ? "active frame-cell" : "frame-cell"}
            data-active-frame={index === displayPageIndex}
            key={frame.id}
            onClick={() => {
              cancelPagePrompt();
              if (mode === "playback" || mode === "audio") {
                setPlaybackIndex(index);
              } else {
                setProject((current) => ({ ...current, currentPageIndex: index }));
              }
              setStopArmedForReset(false);
            }}
            type="button"
          >
            {mode === "edit" ? (
              <FrameThumbnail frameIndex={index} project={project} />
            ) : (
              <span>{index + 1}</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  function renderPlaybackControls() {
    return (
      <div className="playback-controls">
        <IconButton className={isPlaying ? "active" : ""} icon={isPlaying ? Pause : Play} label={isPlaying ? "Pause" : "Play"} onClick={togglePlayback} />
        <IconButton icon={Square} label="Stop" onClick={handleStopPlayback} />
        <IconButton icon={SkipBack} label="Start from current frame" onClick={() => setPlaybackIndex(project.currentPageIndex)} />
        <label>
          FPS
          <select
            value={PLAYBACK_SPEEDS.includes(project.fps as (typeof PLAYBACK_SPEEDS)[number]) ? PLAYBACK_SPEEDS.indexOf(project.fps as (typeof PLAYBACK_SPEEDS)[number]) : speedLevel}
            onChange={(event) => {
              const nextIndex = Number(event.target.value);
              setSpeedLevel(nextIndex);
              setProject((current) => ({ ...current, fps: PLAYBACK_SPEEDS[nextIndex] ?? current.fps }));
              setHasUnsavedChanges(true);
            }}
          >
            {PLAYBACK_SPEEDS.map((fps, index) => (
              <option key={fps} value={index}>
                {index}: {fps} FPS
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  function renderClipPropertyPanel() {
    const clip = timelineClips.find((candidate) => candidate.id === selectedClipId);
    if (!clip) {
      return null;
    }

    const updateClip = (changes: Partial<TimelineClip>) => {
      setTimelineClips((clips) => clips.map((candidate) => (candidate.id === clip.id ? { ...candidate, ...changes } : candidate)));
      setHasUnsavedChanges(true);
    };

    return (
      <div className="clip-property-panel" aria-label="Selected clip properties">
        <span>{clip.name}</span>
        <label>
          Vol
          <input min="0" max="1.5" step="0.05" type="range" value={clip.volume} onChange={(event) => updateClip({ volume: Number(event.target.value) })} />
        </label>
        <label>
          Pan
          <input min="-1" max="1" step="0.05" type="range" value={clip.panning} onChange={(event) => updateClip({ panning: Number(event.target.value) })} />
        </label>
        <label>
          In
          <input min="0" max={clip.durationFrames} type="number" value={clip.fadeInFrames} onChange={(event) => updateClip({ fadeInFrames: Number(event.target.value) })} />
        </label>
        <label>
          Out
          <input min="0" max={clip.durationFrames} type="number" value={clip.fadeOutFrames} onChange={(event) => updateClip({ fadeOutFrames: Number(event.target.value) })} />
        </label>
      </div>
    );
  }

  function renderPointerTimelineGhost() {
    if (!pointerTimelineDrag) {
      return null;
    }

    const width = Math.max(90, Math.min(360, pointerTimelineDrag.durationFrames * timelinePixelsPerFrame));
    return (
      <div
        className="custom-drag-ghost"
        style={{
          left: pointerTimelineDrag.pointerX + 14,
          top: pointerTimelineDrag.pointerY + 14,
          width,
        }}
      >
        <span>{pointerTimelineDrag.name}</span>
        {pointerTimelineDrag.extension && <strong>{pointerTimelineDrag.extension}</strong>}
      </div>
    );
  }

  function renderStage() {
    if (mode === "edit") {
      return (
        <section className="stage-card edit-stage" ref={stageRef}>
          <div className="edit-workspace">
            {renderFrameRail("frame-rail edit-frame-rail")}
            <div className="edit-actions">
              <IconButton icon={BrushCleaning} label="Clear frame" showLabel onClick={clearCurrentFrame} />
              <IconButton icon={Copy} label="Copy frame" shortcut={getShortcutLabel("copy", platform)} showLabel onClick={copyCurrentFrame} />
              <IconButton icon={FilePenLine} label="Paste frame" shortcut={getShortcutLabel("paste", platform)} showLabel onClick={pasteFrame} />
              <IconButton icon={CopyPlus} label="Duplicate frame" showLabel onClick={duplicateFrame} />
              <IconButton icon={SquarePen} label="Insert new frame" showLabel onClick={insertNewFrame} />
              <IconButton icon={Trash2} label="Delete frame" showLabel onClick={deleteCurrentFrame} />
            </div>
          </div>
        </section>
      );
    }

    if (mode === "playback") {
      return (
        <section className="stage-card playback-stage" ref={stageRef}>
          <ProjectPreviewFrame className="playback-preview-frame" projectHeight={project.height} projectWidth={project.width}>
            <canvas
              className="drawing-canvas playback-canvas"
              height={project.height}
              ref={canvasRef}
              width={project.width}
            />
          </ProjectPreviewFrame>
          {renderFrameRail("frame-rail playback-rail")}
          {renderPlaybackControls()}
        </section>
      );
    }

    if (mode === "audio") {
      return (
        <section className="stage-card audio-stage" ref={stageRef}>
          <div className="audio-workspace">
            <aside className="audio-column material-library">
              <div className="audio-column-header">
                <h2>Material Library</h2>
                <IconButton icon={Plus} label="Add audio material" onClick={() => void addAudioMaterials()} />
                <IconButton icon={Package} label="Bundle audio assets" onClick={() => void bundleAudioAssets()} />
                <IconButton icon={Mic} label="Record audio" onClick={() => void openRecordDialog()} />
              </div>
              <div className="audio-assets">
                {audioMaterials.map((asset) => (
                  <div
                    className={asset.isOffline || audioAssets[asset.id]?.isOffline ? "audio-asset-row offline" : "audio-asset-row"}
                    key={asset.id}
                    onPointerDown={(event) => beginSourcePointerDrag(event, asset, "material")}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setAudioAssetContextMenu({ sourceId: asset.id, sourceKind: "material", x: event.clientX, y: event.clientY });
                    }}
                  >
                    <span>{asset.name}</span>
                    <strong>{asset.extension}</strong>
                    <IconButton icon={activeAudioPath === asset.path ? Square : Play} label={`${activeAudioPath === asset.path ? "Stop" : "Play"} ${asset.name}`} onClick={() => void playAudioFile(asset.path)} />
                    <IconButton
                      className="audio-asset-delete-button"
                      icon={X}
                      label={`Remove ${asset.name} from Material Library`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void deleteAudioSource(asset.id, "material");
                      }}
                    />
                  </div>
                ))}
              </div>
            </aside>
            <div className="audio-center-column">
              <section className="audio-preview-panel">
                <h2>Frame Preview</h2>
                <ProjectPreviewFrame className="audio-preview-frame" projectHeight={project.height} projectWidth={project.width}>
                  <canvas
                    className="drawing-canvas audio-preview-canvas"
                    height={project.height}
                    ref={canvasRef}
                    width={project.width}
                  />
                </ProjectPreviewFrame>
              </section>
              <section className="audio-column audio-workstation">
                <div className="timeline-header">
                  <h2>Audio Workstation</h2>
                  <span>
                    {formatSeconds(currentTimeSeconds)} / {formatSeconds(totalTimeSeconds)}
                  </span>
                  <label className="audio-toolbar-field">
                    Unit
                    <select value={timeUnit} onChange={(event) => setTimeUnit(event.target.value as "frames" | "time")}>
                      <option value="frames">Frames</option>
                      <option value="time">Time</option>
                    </select>
                  </label>
                  <button
                    aria-label={`Snap ${snapEnabled ? "on" : "off"}`}
                    className={snapEnabled ? "snap-button active" : "snap-button"}
                    title={`Snap ${snapEnabled ? "on" : "off"}`}
                    type="button"
                    onClick={() => setSnapEnabled((current) => !current)}
                  >
                    SNAP
                  </button>
                  <label className="audio-toolbar-field timeline-zoom-field">
                    Zoom
                    <input
                      min="4"
                      max="64"
                      step="1"
                      type="range"
                      value={timelinePixelsPerFrame}
                      onChange={(event) => setTimelinePixelsPerFrame(Number(event.target.value))}
                    />
                    <input
                      min="4"
                      max="64"
                      step="1"
                      type="number"
                      value={timelinePixelsPerFrame}
                      onChange={(event) => setTimelinePixelsPerFrame(Math.min(64, Math.max(4, Number(event.target.value) || 18)))}
                    />
                  </label>
                </div>
                <div className="audio-tab-row" role="tablist" aria-label="Audio workflow">
                  <IconButton className={audioWorkspaceTab === "workstation" ? "active" : ""} icon={Layers} label="Workstation" onClick={() => setAudioWorkspaceTab("workstation")} role="tab" />
                  <IconButton className={audioWorkspaceTab === "mixer" ? "active" : ""} icon={SlidersHorizontal} label="Mixer" onClick={() => setAudioWorkspaceTab("mixer")} role="tab" />
                </div>
                {audioWorkspaceTab === "workstation" ? (
                  <>
                    <AudioTimeline
                      activeFrame={playbackIndex}
                      clips={timelineClips}
                      frameCount={project.frames.length}
                      fps={playbackFps}
                      assets={audioAssets}
                      pixelsPerFrame={timelinePixelsPerFrame}
                      pointerDrag={pointerTimelineDrag}
                      showGrid={snapEnabled}
                      snapEnabled={snapEnabled}
                      tracks={audioTracks}
                      timeUnit={timeUnit}
                      selectedClipId={selectedClipId}
                      onClipContextMenu={(clipId, x, y) => {
                        setSelectedClipId(clipId);
                        setClipContextMenu({ clipId, x, y });
                      }}
                      onClipSelect={setSelectedClipId}
                      onClipPointerDown={beginClipPointerDrag}
                      onEdgeDragStart={(state) => {
                        clipDragRef.current = state;
                      }}
                      onSelectFrame={(index) => {
                        seekPlaybackFrame(index);
                      }}
                      onTrackChange={updateAudioTrack}
                    />
                    {renderClipPropertyPanel()}
                  </>
                ) : (
                  <MixerPanel tracks={audioTracks} onTrackChange={updateAudioTrack} />
                )}
                {renderPlaybackControls()}
              </section>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="stage-card" ref={stageRef}>
        <ProjectPreviewFrame className="draw-canvas-frame" projectHeight={project.height} projectWidth={project.width}>
          <canvas
            className="drawing-canvas"
            height={project.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            ref={canvasRef}
            width={project.width}
          />
        </ProjectPreviewFrame>
      </section>
    );
  }

  function renderDialog() {
    if (dialogState === "none") {
      return null;
    }

    if (dialogState === "create-page") {
      return (
        <div className="modal-backdrop page-confirm" role="presentation">
          <section className="modal-panel compact-modal" role="dialog" aria-modal="true" aria-labelledby="create-page-title">
            <h2 id="create-page-title">Create New Page?</h2>
            <p>
              Press {pageCreateDirection === "prepend" ? "Left" : "Right"} again to add a page{" "}
              {pageCreateDirection === "prepend" ? "at the beginning." : `${project.frames.length + 1}.`}
            </p>
          </section>
        </div>
      );
    }

    if (dialogState === "new-warning") {
      return (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
            <h2 id="new-project-title">Unsaved Project</h2>
            <p>Your current animation has unsaved changes. Save before starting a new project?</p>
            <div className="modal-actions">
              <IconButton icon={Save} label="Save before new project" onClick={() => void handleSaveClick("new-project")} />
              <IconButton icon={Trash2} label="Discard changes" onClick={createNewProject} />
              <IconButton icon={X} label="Cancel" onClick={() => setDialogState("none")} />
            </div>
          </section>
        </div>
      );
    }

    if (dialogState === "record") {
      return (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel record-modal" role="dialog" aria-modal="true" aria-labelledby="record-audio-title">
            <h2 id="record-audio-title">Record Audio</h2>
            <div className={isRecording ? "recording-status active" : "recording-status"}>
              <span>
                {isRecording
                  ? isRecordingPaused ? "Paused" : "Recording"
                  : recordCountdownRemaining > 0
                    ? `Starts in ${recordCountdownRemaining}`
                    : microphonePermissionState === "checking"
                      ? "Checking Mic"
                      : "Ready"}
              </span>
              <strong>{formatSeconds(recordingElapsedMs / 1000)}</strong>
            </div>
            {microphonePermissionMessage && (
              <p className={microphonePermissionState === "granted" ? "record-permission-message ready" : "record-permission-message"}>
                {microphonePermissionMessage}
              </p>
            )}
            <div className="recording-visualizer" aria-label="Live recording input">
              <div className="recording-waveform" aria-hidden="true">
                {recordingWaveform.map((level, index) => (
                  <span
                    key={index}
                    style={{
                      height: `${Math.max(4, Math.round(level * 62))}px`,
                    }}
                  />
                ))}
              </div>
              <div className="recording-level" aria-label={`Input level ${Math.round(recordingLevel * 100)} percent`}>
                <span style={{ width: `${Math.round(recordingLevel * 100)}%` }} />
              </div>
            </div>
            <div className="record-modal-controls">
              <div className="record-control-row">
                <span className="record-control-label">Format</span>
                <label className="field-row">
                  <select disabled={isRecording} value={recordingFormat} onChange={(event) => setRecordingFormat(event.target.value as RecordingFormat)}>
                    <option value="wav">.wav</option>
                    <option value="mp3">.mp3</option>
                  </select>
                </label>
              </div>
              <div className="record-control-row">
                <span className="record-control-label">Mic</span>
                <label className="field-row">
                  <select disabled={isRecording} value={selectedMicId} onChange={(event) => setSelectedMicId(event.target.value)}>
                    {micDevices.length === 0 ? (
                      <option value="">Default Input</option>
                    ) : (
                      micDevices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Input ${index + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
              <div className="record-control-row">
                <span className="record-control-label">Count Down</span>
                <label className="record-countdown-toggle">
                  <input
                    checked={recordCountdownEnabled}
                    disabled={isRecording || recordCountdownRemaining > 0}
                    type="checkbox"
                    onChange={(event) => setRecordCountdownEnabled(event.target.checked)}
                  />
                  <span>3 sec countdown</span>
                </label>
              </div>
              <div className="record-control-row">
                <span className="record-control-label">Record</span>
                <div className="record-button-row">
                  <IconButton
                    className={[
                      "record-button",
                      isRecording ? "record-button-active" : "",
                      recordCountdownRemaining > 0 ? "record-button-countdown" : "",
                    ].filter(Boolean).join(" ")}
                    disabled={
                      !isRecording &&
                      (recordCountdownRemaining > 0 ||
                        microphonePermissionState === "checking" ||
                        microphonePermissionState === "denied" ||
                        microphonePermissionState === "unsupported")
                    }
                    icon={isRecording ? Square : Mic}
                    label={isRecording ? "Stop recording" : recordCountdownRemaining > 0 ? `Recording starts in ${recordCountdownRemaining}` : "Record"}
                    showLabel
                    onClick={() => void handleRecordButtonClick()}
                  />
                  <IconButton
                    className={isRecordingPaused ? "record-pause-button active" : "record-pause-button"}
                    disabled={!isRecording || recordCountdownRemaining > 0}
                    icon={isRecordingPaused ? Play : Pause}
                    label={isRecordingPaused ? "Resume recording" : "Pause recording"}
                    showLabel
                    onClick={() => void toggleRecordingPause()}
                  />
                </div>
              </div>
            </div>
            <div className="record-modal-list-header">
              <h3 className="record-modal-subtitle">Takes</h3>
              <IconButton disabled={recordings.length === 0 || isRecording || recordCountdownRemaining > 0} icon={Trash2} label="Clear takes" onClick={() => void clearRecordingTakes()} />
            </div>
            <div className="recording-list record-modal-list" aria-label="Recorded audios">
              {recordings.length === 0 && <p className="empty-take-message">No takes yet.</p>}
              {recordings.map((recording) => (
                <div className="recording-item record-take-item" key={recording.id}>
                  <span>{recording.name}</span>
                  <strong>
                    {recording.extension} {recording.durationMs ? formatSeconds(recording.durationMs / 1000) : ""}
                  </strong>
                  <IconButton icon={activeAudioPath === recording.path ? Square : Play} label={`${activeAudioPath === recording.path ? "Stop" : "Play"} ${recording.name}`} onClick={() => void playAudioFile(recording.path)} />
                  <IconButton icon={Trash2} label={`Delete ${recording.name}`} onClick={() => void deleteRecording(recording)} />
                  <IconButton icon={Plus} label={materializedRecordingIds.has(recording.id) ? `${recording.name} is in library` : `Add ${recording.name} as material`} onClick={() => void addRecordingTakeToTimeline(recording)} />
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <IconButton icon={X} label="Close" onClick={() => void closeRecordDialog()} />
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="export-project-title">
          <h2 id="export-project-title">Export</h2>
          <div className="tab-row" role="tablist" aria-label="Export type">
            <IconButton
              className={exportTab === "image" ? "active" : ""}
              icon={Image}
              label="Image export"
              showLabel
              onClick={() => {
                setExportTab("image");
                if (projectPackagePaths) {
                  setExportPath(getDefaultExportPath(projectPackagePaths, "image", imageExportFormat));
                }
              }}
              role="tab"
            />
            <IconButton
              className={exportTab === "video" ? "active" : ""}
              icon={Video}
              label="Video export"
              showLabel
              onClick={() => {
                setExportTab("video");
                if (projectPackagePaths) {
                  setExportPath(getDefaultExportPath(projectPackagePaths, "video", videoExportFormat));
                }
              }}
              role="tab"
            />
          </div>
          <label className="field-row">
            Format
            {exportTab === "image" ? (
              <select
                onChange={(event) => {
                  const format = event.target.value as ImageExportFormat;
                  setImageExportFormat(format);
                  if (projectPackagePaths) {
                    setExportPath(getDefaultExportPath(projectPackagePaths, "image", format));
                  }
                }}
                value={imageExportFormat}
              >
                {IMAGE_EXPORT_FORMATS.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            ) : (
              <select
                onChange={(event) => {
                  const format = event.target.value as VideoExportFormat;
                  setVideoExportFormat(format);
                  if (projectPackagePaths) {
                    setExportPath(getDefaultExportPath(projectPackagePaths, "video", format));
                  }
                }}
                value={videoExportFormat}
              >
                {VIDEO_EXPORT_FORMATS.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            )}
          </label>
          <section className="export-advanced-controls" aria-label="Export overrides">
            <label>
              Target FPS
              <select
                value={exportFps}
                onChange={(event) => setExportFps(Number(event.target.value))}
              >
                {PLAYBACK_SPEEDS.map((fps, index) => (
                  <option key={fps} value={fps}>
                    {index}: {fps} FPS
                  </option>
                ))}
              </select>
            </label>
            <label>
              Audio Quality
              <select value={exportAudioQuality} onChange={(event) => setExportAudioQuality(event.target.value as ExportAudioQuality)}>
                <option value="high">High Quality 44.1 kHz</option>
                <option value="lofi">Lo-fi 8 kHz</option>
              </select>
            </label>
          </section>
          {exportTab === "image" && (
            <section className="export-frame-picker" aria-label="Image export frames">
              <div className="segmented-row">
                <IconButton
                  className={imageExportScope === "all" ? "active" : ""}
                  icon={Layers}
                  label="Export all frames"
                  showLabel
                  onClick={() => setImageExportScope("all")}
                />
                <IconButton
                  className={imageExportScope === "partial" ? "active" : ""}
                  icon={Grid3X3}
                  label="Select partial frames"
                  showLabel
                  onClick={() => setImageExportScope("partial")}
                />
              </div>
              {imageExportScope === "partial" && (
                <div className="partial-frame-list">
                  {project.frames.map((frame, index) => (
                    <label className="partial-frame-item" key={frame.id}>
                      <input
                        checked={selectedExportFrames.has(index)}
                        onChange={(event) => {
                          setSelectedExportFrames((current) => {
                            const next = new Set(current);
                            if (event.target.checked) {
                              next.add(index);
                            } else {
                              next.delete(index);
                            }
                            return next;
                          });
                        }}
                        type="checkbox"
                      />
                      <FrameThumbnail frameIndex={index} project={project} />
                    </label>
                  ))}
                </div>
              )}
            </section>
          )}
          <label className="checkbox-row">
            <input
              checked={transparentExport}
              onChange={(event) => setTransparentExport(event.target.checked)}
              type="checkbox"
            />
            Transparent Background
          </label>
          {exportTab === "video" && (
            <>
              <label className="checkbox-row">
                <input
                  checked={videoOnlyExport}
                  disabled={videoExportFormat === "Audio Only (WAV)" || videoExportFormat === "GIF" || videoExportFormat === "APNG" || videoExportFormat === "Sprite Sheet"}
                  onChange={(event) => setVideoOnlyExport(event.target.checked)}
                  type="checkbox"
                />
                Video Only
              </label>
            </>
          )}
          {exportTab === "video" && (
            <ExportPreview
              fps={exportFps}
              height={project.height}
              project={project}
              transparentBackground={transparentExport}
              width={project.width}
            />
          )}
          <label className="field-row">
            Destination
            <input
              onChange={(event) => setExportPath(event.target.value)}
              placeholder="/path/to/export"
              type="text"
              value={exportPath}
            />
          </label>
          {exportProgress.active && (
            <div className="export-progress">
              <span>{exportProgress.label}</span>
              <progress max="100" value={exportProgress.percent} />
              <strong>{exportProgress.percent}%</strong>
            </div>
          )}
          <div className="modal-actions">
            <IconButton icon={Download} label="Export" showLabel onClick={() => void handleExportProject()} />
            {exportProgress.active && <IconButton icon={Ban} label="Cancel export" showLabel onClick={cancelExport} />}
            <IconButton icon={X} label="Cancel" showLabel onClick={() => setDialogState("none")} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className={`app-shell ${mode}-mode`}>
      <header className="top-toolbar">
        <div className="mode-actions" aria-label="Mode selection">
          <IconButton className={mode === "draw" ? "active" : ""} icon={Pencil} label="Draw mode" pressed={mode === "draw"} shortcut={getShortcutLabel("switchToDrawMode", platform)} onClick={() => setModeAndCancel("draw")} />
          <IconButton className={mode === "edit" ? "active" : ""} icon={SquarePen} label="Edit mode" pressed={mode === "edit"} shortcut={getShortcutLabel("switchToEditMode", platform)} onClick={() => setModeAndCancel("edit")} />
          <IconButton className={mode === "playback" ? "active" : ""} icon={Play} label="Playback mode" pressed={mode === "playback"} shortcut={getShortcutLabel("switchToPlaybackMode", platform)} onClick={() => setModeAndCancel("playback")} />
          <IconButton className={mode === "audio" ? "active" : ""} icon={Volume2} label="Audio mode" pressed={mode === "audio"} shortcut={getShortcutLabel("switchToAudioMode", platform)} onClick={() => setModeAndCancel("audio")} />
        </div>
        <p className="global-status-readout" aria-live="polite">{status}</p>
        <div className="toolbar-actions" aria-label="File operations">
          <span className="page-indicator" aria-label="Current page">
            {pageIndicator}
          </span>
          <IconButton icon={FilePlus2} label="New project" onClick={handleNewProject} />
          <IconButton icon={Save} label={hasUnsavedChanges ? "Save unsaved project" : "Save project"} shortcut={getShortcutLabel("save", platform)} onClick={() => void handleSaveClick("manual")} />
          <IconButton icon={FolderOpen} label="Load project" onClick={() => void handleLoadProject()} />
          <IconButton icon={SaveAll} label="Save project as" shortcut={getShortcutLabel("saveAs", platform)} onClick={() => void handleSaveAsProject("manual")} />
          <IconButton icon={Download} label="Export project" onClick={() => void openExportDialog()} />
          <IconButton icon={Undo2} label="Undo" shortcut={getShortcutLabel("undo", platform)} onClick={applyUndo} />
          <IconButton icon={Redo2} label="Redo" shortcut={getShortcutLabel("redo", platform)} onClick={applyRedo} />
        </div>
      </header>

      {mode !== "playback" && mode !== "audio" && renderLeftPanel()}
      {renderStage()}
      {mode !== "playback" && mode !== "audio" && renderLayerPanel()}
      {renderPointerTimelineGhost()}
      {clipContextMenu && (
        <div
          className="clip-context-menu"
          style={{ left: clipContextMenu.x, top: clipContextMenu.y }}
          role="menu"
        >
          <IconButton icon={Trash2} label="Delete clip" onClick={deleteSelectedClip} />
          <IconButton icon={CopyPlus} label="Duplicate clip" onClick={duplicateSelectedClip} />
          <IconButton icon={Copy} label="Copy clip" shortcut={getShortcutLabel("copy", platform)} onClick={copySelectedClip} />
          <IconButton icon={Upload} label="Paste clip at playhead" shortcut={getShortcutLabel("paste", platform)} onClick={pasteClipAtPlayhead} />
          <IconButton icon={Scissors} label="Split clip" onClick={splitSelectedClip} />
          <IconButton icon={RotateCcw} label="Reverse clip" onClick={reverseSelectedClip} />
        </div>
      )}
      {audioAssetContextMenu && (
        <div
          className="clip-context-menu audio-asset-context-menu"
          style={{ left: audioAssetContextMenu.x, top: audioAssetContextMenu.y }}
          role="menu"
        >
          <IconButton
            icon={Trash2}
            label="Delete audio source"
            onClick={() => void deleteAudioSource(audioAssetContextMenu.sourceId, audioAssetContextMenu.sourceKind)}
          />
        </div>
      )}
      {renderDialog()}
      {fileOperation.active && (
        <div className="blocking-operation-overlay" role="alertdialog" aria-modal="true" aria-label="File operation in progress">
          <section className="blocking-operation-panel">
            <h2>{fileOperation.message}</h2>
            {exportProgress.active && (
              <div className="export-progress blocking-progress">
                <span>{exportProgress.label}</span>
                <progress max="100" value={exportProgress.percent} />
                <strong>{exportProgress.percent}%</strong>
              </div>
            )}
            {fileOperation.cancellable && <IconButton icon={Ban} label="Cancel operation" onClick={cancelExport} />}
          </section>
        </div>
      )}
    </main>
  );
}

function FrameThumbnail({ frameIndex, project }: { frameIndex: number; project: DrawingProject }) {
  const thumbnailRef = useRef<HTMLCanvasElement | null>(null);
  const projectAspectRatio = `${project.width} / ${project.height}`;

  useEffect(() => {
    const canvas = thumbnailRef.current;
    if (!canvas) {
      return;
    }

    renderProject(canvas, project, { pageIndex: frameIndex });
  }, [frameIndex, project]);

  return (
    <>
      <canvas
        aria-hidden="true"
        className="frame-thumbnail"
        height={project.height}
        ref={thumbnailRef}
        style={{ aspectRatio: projectAspectRatio }}
        width={project.width}
      />
      <span>{frameIndex + 1}</span>
    </>
  );
}

function ExportPreview({
  fps,
  height,
  project,
  transparentBackground,
  width,
}: {
  fps: number;
  height: number;
  project: DrawingProject;
  transparentBackground: boolean;
  width: number;
}) {
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [previewFrame, setPreviewFrame] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPreviewFrame((current) => (current + 1) % project.frames.length);
    }, 1000 / Math.max(0.1, fps));
    return () => window.clearInterval(interval);
  }, [fps, project.frames.length]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) {
      return;
    }
    const frameCanvas = renderExportFrame(project, previewFrame, transparentBackground, width, height);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(frameCanvas, 0, 0);
  }, [height, previewFrame, project, transparentBackground, width]);

  return (
    <section className="export-preview-window" aria-label="Export preview">
      <canvas height={height} ref={previewRef} width={width} />
      <span>
        Preview {previewFrame + 1}/{project.frames.length} at {fps} FPS
      </span>
    </section>
  );
}

function AudioTimeline({
  activeFrame,
  assets,
  clips,
  frameCount,
  fps,
  pixelsPerFrame,
  pointerDrag,
  showGrid,
  snapEnabled,
  selectedClipId,
  timeUnit,
  tracks,
  onClipContextMenu,
  onClipSelect,
  onClipPointerDown,
  onEdgeDragStart,
  onSelectFrame,
  onTrackChange,
}: {
  activeFrame: number;
  assets: Record<string, PersistedAudioAsset>;
  clips: TimelineClip[];
  frameCount: number;
  fps: number;
  pixelsPerFrame: number;
  pointerDrag: PointerTimelineDrag | null;
  showGrid: boolean;
  snapEnabled: boolean;
  selectedClipId: string | null;
  timeUnit: "frames" | "time";
  tracks: PersistedAudioTrack[];
  onClipContextMenu: (clipId: string, x: number, y: number) => void;
  onClipSelect: (clipId: string) => void;
  onClipPointerDown: (event: React.PointerEvent<HTMLElement>, clip: TimelineClip) => void;
  onEdgeDragStart: (state: ClipDragState) => void;
  onSelectFrame: (index: number) => void;
  onTrackChange: (trackId: string, changes: Partial<PersistedAudioTrack>) => void;
}) {
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [timelineMetrics, setTimelineMetrics] = useState({ headerWidth: 132 });
  const [dropPreview, setDropPreview] = useState<{ trackIndex: number; frameIndex: number; durationFrames: number } | null>(null);
  const editedEndFrame = clips.reduce((maxFrame, clip) => Math.max(maxFrame, clip.startFrame + clip.durationFrames * clip.loopCount), frameCount);
  const editableFrameCount = Math.max(frameCount + Math.round(fps * 10), editedEndFrame + Math.round(fps * 4), 1);
  const timelineWidth = editableFrameCount * pixelsPerFrame;
  const contentWidth = timelineMetrics.headerWidth + timelineWidth;
  const tickStep = Math.max(1, Math.ceil(64 / Math.max(1, pixelsPerFrame)));
  const ticks = Array.from({ length: Math.floor(editableFrameCount / tickStep) + 1 }, (_, index) => index * tickStep);
  const playheadLeft = timelineMetrics.headerWidth + activeFrame * pixelsPerFrame;

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) {
      return;
    }

    const updateMetrics = () => {
      const header = stack.querySelector<HTMLElement>(".track-header");
      setTimelineMetrics({
        headerWidth: header ? Math.max(1, header.getBoundingClientRect().width) : 132,
      });
    };

    updateMetrics();
    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(stack);
    return () => resizeObserver.disconnect();
  }, [tracks.length]);

  const frameFromClientX = (element: HTMLElement, clientX: number): number => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left - timelineMetrics.headerWidth, 0), timelineWidth);
    const frame = snapTimelineFrame(x / pixelsPerFrame, snapEnabled);
    return Math.min(Math.max(0, frame), Math.max(0, editableFrameCount - 1));
  };

  const dropStartFrameForPayload = (element: HTMLElement, clientX: number, payload: TimelineDragPayload | null): number => {
    const rawFrame = frameFromClientX(element, clientX);
    if (payload?.kind === "clip") {
      return Math.max(0, rawFrame - payload.offsetFrames);
    }

    return rawFrame;
  };

  useEffect(() => {
    if (pointerDrag) {
      const pointedElement = document.elementFromPoint(pointerDrag.pointerX, pointerDrag.pointerY);
      const trackElement = pointedElement?.closest<HTMLElement>(".timeline-track[data-track-index]");
      if (!trackElement || !stackRef.current?.contains(trackElement)) {
        setDropPreview(null);
        return;
      }

      const trackIndex = Number(trackElement.dataset.trackIndex);
      if (!Number.isFinite(trackIndex)) {
        setDropPreview(null);
        return;
      }

      setDropPreview({
        trackIndex,
        frameIndex: dropStartFrameForPayload(trackElement, pointerDrag.pointerX, pointerDrag.payload),
        durationFrames: pointerDrag.durationFrames,
      });
      return;
    }

    if (!new URLSearchParams(window.location.search).has("ghostPreview")) {
      setDropPreview(null);
      return;
    }

    setDropPreview({
      trackIndex: 0,
      frameIndex: Math.max(0, Math.round(fps * 1.25)),
      durationFrames: Math.max(1, Math.round(fps * 1.8)),
    });
  }, [fps, pointerDrag, snapEnabled, timelineMetrics.headerWidth, pixelsPerFrame]);

  return (
    <div className="audio-timeline">
      <div className="timeline-ruler" aria-label="Timeline ruler" style={{ minWidth: `${contentWidth}px` }}>
        {ticks.map((frameIndex) => (
          <span key={frameIndex} style={{ left: `${timelineMetrics.headerWidth + frameIndex * pixelsPerFrame}px` }}>
            {timeUnit === "frames" ? `F${frameIndex + 1}` : formatSeconds(frameIndex / fps)}
          </span>
        ))}
      </div>
      <div className="track-stack" ref={stackRef} style={{ minWidth: `${contentWidth}px` }}>
        <div className="timeline-playhead" style={{ left: `${playheadLeft}px` }} />
        {tracks.map((track, trackIndex) => (
          <div
            aria-label={`Track ${trackIndex + 1}`}
            className={dropPreview?.trackIndex === trackIndex ? "timeline-track drop-target" : "timeline-track"}
            data-track-index={trackIndex}
            key={track.id}
            onClick={(event) => {
              onSelectFrame(Math.round(frameFromClientX(event.currentTarget, event.clientX)));
            }}
            >
            <div className="track-header">
              <button
                className="track-name-editor"
                type="button"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  const nextName = window.prompt("Track name", track.name);
                  if (nextName?.trim()) {
                    onTrackChange(track.id, { name: nextName.trim() });
                  }
                }}
              >
                {track.name}
              </button>
            </div>
            {showGrid && ticks.map((frameIndex) => (
              <span
                aria-hidden="true"
                className="timeline-grid-line"
                key={`${track.id}-${frameIndex}`}
                style={{ left: `${timelineMetrics.headerWidth + frameIndex * pixelsPerFrame}px` }}
              />
            ))}
            {dropPreview?.trackIndex === trackIndex && (
              <span
                className="timeline-drop-preview"
                style={{
                  left: `${timelineMetrics.headerWidth + dropPreview.frameIndex * pixelsPerFrame}px`,
                  width: `${Math.max(dropPreview.durationFrames * pixelsPerFrame, 4)}px`,
                }}
              >
                Drop {formatFrameLabel(dropPreview.frameIndex)}
              </span>
            )}
            {clips
              .filter((clip) => clip.trackIndex === trackIndex)
              .map((clip) => {
                const visibleFrames = clip.durationFrames * clip.loopCount;
                const left = timelineMetrics.headerWidth + clip.startFrame * pixelsPerFrame;
                const width = visibleFrames * pixelsPerFrame;
                const asset = assets[clip.sourceId];
                const isOffline = asset?.isOffline;
                return (
                  <span
                    className={[
                      "timeline-clip",
                      clip.id === selectedClipId ? "selected" : "",
                      isOffline ? "offline" : "",
                    ].filter(Boolean).join(" ")}
                    key={clip.id}
                    onPointerDown={(event) => onClipPointerDown(event, clip)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClipSelect(clip.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onClipContextMenu(clip.id, event.clientX, event.clientY);
                    }}
                    style={{
                      left: `${left}px`,
                      width: `${Math.max(width, 4)}px`,
                    }}
                  >
                    <WaveformCanvas summary={asset?.waveformSummary ?? []} />
                    <em>{clip.name}{clip.reversed ? " REV" : ""}</em>
                    <i>{clip.loopCount}x</i>
                    <span
                      className="clip-edge clip-loop-edge"
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        onEdgeDragStart({
                          clipId: clip.id,
                          kind: "loop",
                          startX: event.clientX,
                          startDurationFrames: clip.durationFrames,
                          startLoopCount: clip.loopCount,
                          pixelsPerFrame,
                        });
                      }}
                    />
                    <span
                      className="clip-edge clip-trim-edge"
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        onEdgeDragStart({
                          clipId: clip.id,
                          kind: "trim",
                          startX: event.clientX,
                          startDurationFrames: clip.durationFrames,
                          startLoopCount: clip.loopCount,
                          pixelsPerFrame,
                        });
                      }}
                    />
                  </span>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WaveformCanvas({ summary }: { summary: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "currentColor";
    const center = canvas.height / 2;
    const values = summary.length > 0 ? summary : Array.from({ length: 64 }, () => 0.08);
    const barWidth = Math.max(1, canvas.width / values.length);
    values.forEach((peak, index) => {
      const height = Math.max(2, Math.min(canvas.height, peak * canvas.height));
      context.fillRect(index * barWidth, center - height / 2, Math.max(1, barWidth - 1), height);
    });
  }, [summary]);

  return <canvas className="waveform-strip" height={32} ref={canvasRef} width={256} aria-hidden="true" />;
}

function MixerPanel({
  tracks,
  onTrackChange,
}: {
  tracks: PersistedAudioTrack[];
  onTrackChange: (trackId: string, changes: Partial<PersistedAudioTrack>) => void;
}) {
  return (
    <section className="mixer-panel" aria-label="Global mixer">
      <h2>Mixer</h2>
      <div className="mixer-strips">
        {tracks.map((track) => (
          <div className="mixer-strip" key={track.id}>
            <span>{track.name.replace("Track ", "T")}</span>
            <input
              aria-label={`${track.name} volume`}
              min="0"
              max="1.5"
              step="0.05"
              type="range"
              value={track.volume}
              onChange={(event) => onTrackChange(track.id, { volume: Number(event.target.value) })}
            />
            <input
              aria-label={`${track.name} volume value`}
              className="mixer-volume-number"
              min="0"
              max="1.5"
              step="0.01"
              type="number"
              value={track.volume}
              onChange={(event) => onTrackChange(track.id, { volume: Math.min(1.5, Math.max(0, Number(event.target.value) || 0)) })}
            />
            <meter min="0" max="1" value={track.isMuted ? 0 : Math.min(1, track.volume * 0.66)} />
            <IconButton className={track.isMuted ? "active" : ""} icon={VolumeX} label={`${track.isMuted ? "Unmute" : "Mute"} ${track.name}`} onClick={() => onTrackChange(track.id, { isMuted: !track.isMuted })} />
            <IconButton className={track.isSolo ? "active" : ""} icon={Volume2} label={`${track.isSolo ? "Disable solo for" : "Solo"} ${track.name}`} onClick={() => onTrackChange(track.id, { isSolo: !track.isSolo })} />
          </div>
        ))}
        <div className="mixer-strip master-strip">
          <span>Master</span>
          <input aria-label="Master volume" disabled max="1" min="0" type="range" value="1" />
          <input className="mixer-volume-number" disabled type="number" value="1" />
          <meter min="0" max="1" high={0.85} optimum={0.6} value={Math.min(1, tracks.reduce((peak, track) => Math.max(peak, track.isMuted ? 0 : track.volume * 0.45), 0))} />
        </div>
      </div>
    </section>
  );
}

function insertFrame(frames: Frame[], index: number, frame: Frame): Frame[] {
  return [...frames.slice(0, index), frame, ...frames.slice(index)].map(renameFrame);
}

async function renderFrameBytes(
  project: DrawingProject,
  frameIndex: number,
  format: ImageExportFormat,
  transparentBackground = false,
  outputWidth = project.width,
  outputHeight = project.height,
): Promise<Uint8Array> {
  const canvas = renderExportFrame(project, frameIndex, transparentBackground, outputWidth, outputHeight);
  const mimeType = format === "JPEG" ? "image/jpeg" : format === "WebP" ? "image/webp" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error(`${format} export is not supported by this WebView.`));
        }
      },
      mimeType,
      0.92,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function renderSpriteSheet(
  project: DrawingProject,
  frameIndexes: number[],
  transparentBackground: boolean,
  outputWidth = project.width,
  outputHeight = project.height,
): Promise<Uint8Array> {
  const columns = Math.ceil(Math.sqrt(frameIndexes.length));
  const rows = Math.ceil(frameIndexes.length / columns);
  const sheet = document.createElement("canvas");
  sheet.width = columns * outputWidth;
  sheet.height = rows * outputHeight;
  const context = sheet.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }
  context.imageSmoothingEnabled = false;
  for (let index = 0; index < frameIndexes.length; index += 1) {
    const frameCanvas = renderExportFrame(project, frameIndexes[index], transparentBackground, outputWidth, outputHeight);
    context.drawImage(frameCanvas, (index % columns) * outputWidth, Math.floor(index / columns) * outputHeight);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    sheet.toBlob((nextBlob) => nextBlob ? resolve(nextBlob) : reject(new Error("Sprite Sheet export failed.")), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function renderExportFrame(
  project: DrawingProject,
  frameIndex: number,
  transparentBackground: boolean,
  outputWidth = project.width,
  outputHeight = project.height,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  const frame = project.frames[frameIndex] ?? project.frames[0];
  if (!context || !frame) {
    return canvas;
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparentBackground) {
    context.fillStyle = getPaletteColor(project, project.backgroundColorId).css;
    context.fillRect(0, 0, outputWidth, outputHeight);
  }

  const layersByDepth = [...frame.layers].sort((a, b) => b.zDepth - a.zDepth);
  for (const layer of layersByDepth) {
    if (!layer.visible) {
      continue;
    }
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = project.width;
    layerCanvas.height = project.height;
    layerCanvas.getContext("2d")?.putImageData(layer.imageData, 0, 0);
    context.drawImage(layerCanvas, 0, 0, outputWidth, outputHeight);
  }
  return canvas;
}

function buildImageExportPath(
  exportPath: string,
  format: ImageExportFormat,
  frameCount: number,
  frameIndex: number,
): string {
  const extension = format === "JPEG" ? "jpg" : format.toLowerCase();
  const normalized = exportPath.replace(/\.[^.\\/]+$/, "");
  if (frameCount === 1) {
    return `${normalized}.${extension}`;
  }

  return `${normalized}_frame_${String(frameIndex + 1).padStart(3, "0")}.${extension}`;
}

function snapTimelineFrame(frame: number, snapEnabled: boolean): number {
  const safeFrame = Number.isFinite(frame) ? frame : 0;
  return snapEnabled ? Math.round(safeFrame) : Math.round(safeFrame * 100) / 100;
}

function clampBrushSize(size: number): number {
  return Math.min(BRUSH_SIZE_MAX, Math.max(BRUSH_SIZE_MIN, Math.floor(Number.isFinite(size) ? size : BRUSH_SIZE_MIN)));
}

function getToolShortcut(toolId: DrawingToolId, platform: Platform): string {
  if (toolId === "pen") {
    return getShortcutLabel("selectPen", platform);
  }
  if (toolId === "tone") {
    return getShortcutLabel("selectTone", platform);
  }
  if (toolId === "eraser") {
    return getShortcutLabel("selectEraser", platform);
  }
  return getShortcutLabel("selectShape", platform);
}

function getFrameFromTrackPointer(trackElement: HTMLElement, clientX: number, pixelsPerFrame: number, snapEnabled: boolean): number {
  const trackRect = trackElement.getBoundingClientRect();
  const headerWidth = trackElement.querySelector<HTMLElement>(".track-header")?.getBoundingClientRect().width ?? 132;
  const timelineX = Math.max(0, clientX - trackRect.left - headerWidth);
  return Math.max(0, snapTimelineFrame(timelineX / Math.max(1, pixelsPerFrame), snapEnabled));
}

function formatFrameLabel(frame: number): string {
  return Number.isInteger(frame) ? `F${frame + 1}` : `F${(frame + 1).toFixed(2)}`;
}

function getExportSampleRate(quality: ExportAudioQuality): number {
  return quality === "lofi" ? 8000 : 44100;
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Uint8Array {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(bytes);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(bytes);
}

function encodeAudioBufferWav(buffer: AudioBuffer): Uint8Array {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }
  const sampleCount = buffer.length;
  const bytes = new ArrayBuffer(44 + sampleCount * 2 * buffer.numberOfChannels);
  const view = new DataView(bytes);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2 * buffer.numberOfChannels, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, buffer.numberOfChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2 * buffer.numberOfChannels, true);
  view.setUint16(32, 2 * buffer.numberOfChannels, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2 * buffer.numberOfChannels, true);
  let offset = 44;
  for (let index = 0; index < sampleCount; index += 1) {
    for (const channel of channels) {
      const clamped = Math.max(-1, Math.min(1, channel[index] ?? 0));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(bytes);
}

function estimateRecordingDurationMs(bytes: Uint8Array, extension: RecordingFormat): number {
  if (extension !== "wav" || bytes.length < 44) {
    return 0;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteRate = view.getUint32(28, true);
  const dataBytes = view.getUint32(40, true);
  if (byteRate <= 0 || dataBytes <= 0) {
    return 0;
  }

  return Math.round((dataBytes / byteRate) * 1000);
}

function summarizePcmBytes(bytes: Uint8Array, bucketCount = 160): number[] {
  if (bytes.length <= 44) {
    return [];
  }

  const payload = bytes.slice(44);
  const chunkSize = Math.max(2, Math.floor(payload.length / bucketCount));
  const summary: number[] = [];
  for (let index = 0; index < payload.length && summary.length < bucketCount; index += chunkSize) {
    let peak = 0;
    for (let offset = index; offset + 1 < Math.min(payload.length, index + chunkSize); offset += 2) {
      const sample = Math.abs((payload[offset] ?? 0) | ((payload[offset + 1] ?? 0) << 8));
      peak = Math.max(peak, sample / 32767);
    }
    summary.push(Math.min(1, peak));
  }

  return summary;
}

function reverseAudioBuffer(buffer: AudioBuffer, context: BaseAudioContext): AudioBuffer {
  const reversed = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const input = buffer.getChannelData(channel);
    const output = reversed.getChannelData(channel);
    for (let index = 0; index < input.length; index += 1) {
      output[index] = input[input.length - 1 - index] ?? 0;
    }
  }
  return reversed;
}

function applyClipFades(gain: AudioParam, clip: TimelineClip, startTime: number, duration: number, fps: number) {
  const volume = Math.max(0, clip.volume);
  const fadeIn = Math.min(duration, clip.fadeInFrames / fps);
  const fadeOut = Math.min(duration, clip.fadeOutFrames / fps);
  gain.cancelScheduledValues(startTime);
  gain.setValueAtTime(fadeIn > 0 ? 0 : volume, startTime);
  if (fadeIn > 0) {
    gain.linearRampToValueAtTime(volume, startTime + fadeIn);
  }
  if (fadeOut > 0) {
    gain.setValueAtTime(volume, Math.max(startTime, startTime + duration - fadeOut));
    gain.linearRampToValueAtTime(0, startTime + duration);
  }
}

function normalizeTimelineClip(clip: TimelineClip): TimelineClip {
  return {
    ...clip,
    sourceOffsetFrames: clip.sourceOffsetFrames ?? 0,
    volume: clip.volume ?? 1,
    panning: clip.panning ?? 0,
    fadeInFrames: clip.fadeInFrames ?? 0,
    fadeOutFrames: clip.fadeOutFrames ?? 0,
  };
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function formatSeconds(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

function getMicrophoneAccessErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Microphone permission was denied. Enable microphone access and try again.";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone input was found.";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Microphone input is unavailable. It may be in use by another app.";
    }

    if (error.name === "SecurityError") {
      return "Microphone access is blocked by this environment. Use a secure context and enable permission.";
    }
  }

  return "Microphone access failed. Check system permissions and try again.";
}

function renameFrame(frame: Frame, index: number): Frame {
  return {
    ...frame,
    id: `page-${index + 1}`,
  };
}

function createFrameWithLayerSettings(width: number, height: number, index: number, sourceFrame: Frame): Frame {
  const frame = createFrame(width, height, index);
  return {
    ...frame,
    layers: frame.layers.map((layer) => {
      const sourceLayer = sourceFrame.layers.find((candidate) => candidate.id === layer.id);
      if (!sourceLayer) {
        return layer;
      }

      return {
        ...layer,
        visible: sourceLayer.visible,
        colorIds: [...sourceLayer.colorIds],
        zDepth: sourceLayer.zDepth,
      };
    }),
  };
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

function remapLayerColor(
  imageData: ImageData,
  oldColor: PaletteColor["rgba"],
  newColor: PaletteColor["rgba"],
): ImageData {
  if (sameColor(oldColor, newColor)) {
    return cloneImageData(imageData);
  }

  const nextPixels = new Uint8ClampedArray(imageData.data);

  for (let index = 0; index < nextPixels.length; index += 4) {
    if (
      nextPixels[index] === oldColor[0] &&
      nextPixels[index + 1] === oldColor[1] &&
      nextPixels[index + 2] === oldColor[2] &&
      nextPixels[index + 3] === oldColor[3]
    ) {
      nextPixels[index] = newColor[0];
      nextPixels[index + 1] = newColor[1];
      nextPixels[index + 2] = newColor[2];
      nextPixels[index + 3] = newColor[3];
    }
  }

  return new ImageData(nextPixels, imageData.width, imageData.height);
}

function remapHistoryLayerColor(
  history: HistoryState,
  frameIndex: number,
  layerIndex: number,
  oldColor: PaletteColor["rgba"],
  newColor: PaletteColor["rgba"],
): HistoryState {
  if (frameIndex < 0 || layerIndex < 0 || sameColor(oldColor, newColor)) {
    return history;
  }

  const remapSnapshot = (snapshot: HistoryState["undoStack"][number]) => ({
    ...snapshot,
    frames: snapshot.frames.map((frame, currentFrameIndex) =>
      currentFrameIndex === frameIndex
        ? {
            ...frame,
            layers: frame.layers.map((layer, currentLayerIndex) =>
              currentLayerIndex === layerIndex
                ? { ...layer, imageData: remapLayerColor(layer.imageData, oldColor, newColor) }
                : layer,
            ),
          }
        : frame,
    ),
  });

  return {
    undoStack: history.undoStack.map(remapSnapshot),
    redoStack: history.redoStack.map(remapSnapshot),
  };
}

function getDefaultExportPath(
  paths: ProjectPackagePaths,
  exportTab: ExportTab,
  format: ImageExportFormat | VideoExportFormat,
): string {
  const extension = format === "JPEG" ? "jpg" : format === "Sprite Sheet" ? "png" : format === "Audio Only (WAV)" ? "wav" : format.toLowerCase();
  const directory = exportTab === "image" ? paths.imageDir : paths.movieDir;
  return `${directory}/${paths.projectName}.${extension}`;
}

function getProjectFileName(paths: ProjectPackagePaths | null, projectName: string): string {
  if (!paths) {
    return `${sanitizeProjectName(projectName)}.upj`;
  }

  return paths.projectPath.split(/[\\/]/).pop() ?? `${paths.projectName}.upj`;
}

function sanitizeProjectName(projectName: string): string {
  const safeName = projectName
    .trim()
    .replace(/\.[Uu][Pp][Jj]$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return safeName || "untitled_project";
}

function buildRecordedMaterialPath(recording: RecordedAudio, recordDir: string): string {
  const extension = recording.extension || ".wav";
  return `${recordDir}/material_${Date.now()}_${sanitizeProjectName(recording.name)}${extension}`;
}

function isGeneratedRecordingMaterialPath(path: string, paths: ProjectPackagePaths | null): boolean {
  if (!paths) {
    return false;
  }
  return path.startsWith(`${paths.recordDir}/material_`) || path.startsWith(`${paths.recordDir}\\material_`);
}

function createDefaultAudioTracks(): PersistedAudioTrack[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    volume: 1,
    isMuted: false,
    isSolo: false,
    clips: [],
  }));
}

function normalizeAudioTracks(
  tracks: PersistedAudioTrack[],
  clips: TimelineClip[],
  assets: Record<string, PersistedAudioAsset>,
): PersistedAudioTrack[] {
  const base = tracks.length > 0 ? tracks : createDefaultAudioTracks();
  return mergeTimelineIntoAudioTracks(base, clips, [], [], 6, assets);
}

function mergeTimelineIntoAudioTracks(
  tracks: PersistedAudioTrack[],
  clips: TimelineClip[],
  audioMaterials: AudioFilePath[],
  recordings: RecordedAudio[],
  fps: number,
  existingAssets: Record<string, PersistedAudioAsset> = {},
): PersistedAudioTrack[] {
  const base = tracks.length > 0 ? tracks : createDefaultAudioTracks();
  return base.map((track, trackIndex) => ({
    ...track,
    clips: clips
      .filter((clip) => clip.trackIndex === trackIndex)
      .map((clip) => {
        const asset = existingAssets[clip.sourceId] ?? audioFileToAsset(
          audioMaterials.find((candidate) => candidate.id === clip.sourceId) ??
          recordings.find((candidate) => candidate.id === clip.sourceId) ??
          { id: clip.sourceId, name: clip.name, path: clip.sourceId, extension: "" },
        );
        return {
          id: clip.id,
          assetId: asset.id,
          startFrame: clip.startFrame,
          durationFrames: clip.durationFrames,
          sourceOffsetMs: Math.round((clip.sourceOffsetFrames / fps) * 1000),
          volume: clip.volume,
          playbackRate: 1,
          isOffline: asset.isOffline,
        };
      }),
  }));
}

function audioFileToAsset(file: AudioFilePath | RecordedAudio): PersistedAudioAsset {
  return {
    id: file.id,
    name: file.name,
    originalPath: file.path,
    durationMs: "durationMs" in file && typeof file.durationMs === "number" ? file.durationMs : 0,
    waveformSummary: "waveformSummary" in file && Array.isArray(file.waveformSummary) ? file.waveformSummary : [],
    extension: file.extension,
    isOffline: "isOffline" in file ? file.isOffline : false,
  };
}

function getEffectiveTrackGain(track: PersistedAudioTrack | undefined, tracks: PersistedAudioTrack[]): number {
  if (!track) {
    return 1;
  }

  const hasSolo = tracks.some((candidate) => candidate.isSolo);
  if (track.isMuted || (hasSolo && !track.isSolo)) {
    return 0;
  }

  return track.volume;
}

function resolveAudioPath(path: string, projectPackagePaths: ProjectPackagePaths | null): string {
  if (/^(\/|[a-zA-Z]:[\\/])/.test(path) || !projectPackagePaths) {
    return path;
  }

  return `${projectPackagePaths.projectPath.replace(/[\\/][^\\/]+$/, "")}/${path}`;
}

function sameColor(a: PaletteColor["rgba"], b: PaletteColor["rgba"]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
