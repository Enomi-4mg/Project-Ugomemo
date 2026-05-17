import type React from "react";

export type Platform = "mac" | "windows" | "linux" | "unknown";

export type ShortcutAction =
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "delete"
  | "save"
  | "saveAs"
  | "playPause"
  | "playFromCurrent"
  | "switchToDrawMode"
  | "switchToEditMode"
  | "switchToPlaybackMode"
  | "switchToAudioMode"
  | "selectPen"
  | "selectTone"
  | "selectEraser"
  | "selectShape"
  | "decreaseBrushSize"
  | "increaseBrushSize"
  | "previousPage"
  | "nextPage"
  | "previousLayer"
  | "nextLayer"
  | "toggleOnionSkin";

type KeyboardLikeEvent = KeyboardEvent | React.KeyboardEvent;

const shortcutKeys: Record<ShortcutAction, string[]> = {
  undo: ["Primary", "Z"],
  redo: ["Primary", "Shift", "Z"],
  copy: ["Primary", "C"],
  paste: ["Primary", "V"],
  delete: ["Delete"],
  save: ["Primary", "S"],
  saveAs: ["Primary", "Shift", "S"],
  playPause: ["Space"],
  playFromCurrent: ["Alt", "Space"],
  switchToDrawMode: ["Ctrl", "1"],
  switchToEditMode: ["Ctrl", "2"],
  switchToPlaybackMode: ["Ctrl", "3"],
  switchToAudioMode: ["Ctrl", "4"],
  selectPen: ["Q"],
  selectTone: ["W"],
  selectEraser: ["E"],
  selectShape: ["R"],
  decreaseBrushSize: ["]"],
  increaseBrushSize: ["["],
  previousPage: ["Left"],
  nextPage: ["Right"],
  previousLayer: ["Up"],
  nextLayer: ["Down"],
  toggleOnionSkin: ["Primary"],
};

export function detectPlatform(): Platform {
  const platform = getNavigatorPlatform().toLowerCase();
  const userAgentDataPlatform = getNavigatorUserAgentDataPlatform().toLowerCase();
  const userAgent = getNavigatorUserAgent().toLowerCase();
  const platformHint = `${userAgentDataPlatform} ${platform} ${userAgent}`;

  if (/\b(mac|iphone|ipad|ipod)\b/.test(platformHint)) {
    return "mac";
  }

  if (/\b(win|windows)\b/.test(platformHint)) {
    return "windows";
  }

  if (/\b(linux|x11)\b/.test(platformHint)) {
    return "linux";
  }

  return "unknown";
}

export function isPrimaryModifier(event: KeyboardLikeEvent, platform: Platform): boolean {
  if (platform === "mac") {
    return event.metaKey;
  }

  return event.ctrlKey;
}

export function isPrimaryModifierKey(event: KeyboardLikeEvent, platform: Platform): boolean {
  if (platform === "mac") {
    return event.key === "Meta";
  }

  return event.key === "Control";
}

export function shouldIgnoreShortcutEvent(event: KeyboardLikeEvent): boolean {
  if (!(event.target instanceof HTMLElement)) {
    return false;
  }

  return (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target.isContentEditable ||
    event.target.closest("[contenteditable='true']") !== null ||
    event.target.closest("[contenteditable='']") !== null
  );
}

export function isControlNumberShortcut(event: KeyboardLikeEvent, number: "1" | "2" | "3" | "4"): boolean {
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && getNormalizedKey(event) === number;
}

export function isShortcutAction(event: KeyboardLikeEvent, action: ShortcutAction, platform: Platform): boolean {
  const key = getNormalizedKey(event);
  const hasPrimaryModifier = isPrimaryModifier(event, platform);

  if (action === "undo") {
    return hasPrimaryModifier && key === "z" && !event.shiftKey && !event.altKey;
  }
  if (action === "redo") {
    return hasPrimaryModifier && key === "z" && event.shiftKey && !event.altKey;
  }
  if (action === "copy") {
    return hasPrimaryModifier && key === "c" && !event.shiftKey && !event.altKey;
  }
  if (action === "paste") {
    return hasPrimaryModifier && key === "v" && !event.shiftKey && !event.altKey;
  }
  if (action === "save") {
    return hasPrimaryModifier && key === "s" && !event.shiftKey && !event.altKey;
  }
  if (action === "saveAs") {
    return hasPrimaryModifier && key === "s" && event.shiftKey && !event.altKey;
  }
  if (action === "delete") {
    return event.key === "Delete" || event.key === "Backspace";
  }
  if (action === "playPause") {
    return event.code === "Space" && !event.altKey;
  }
  if (action === "playFromCurrent") {
    return event.code === "Space" && event.altKey;
  }
  if (action === "switchToDrawMode") {
    return isControlNumberShortcut(event, "1");
  }
  if (action === "switchToEditMode") {
    return isControlNumberShortcut(event, "2");
  }
  if (action === "switchToPlaybackMode") {
    return isControlNumberShortcut(event, "3");
  }
  if (action === "switchToAudioMode") {
    return isControlNumberShortcut(event, "4");
  }
  if (action === "selectPen") {
    return isUnmodifiedKey(event, "q");
  }
  if (action === "selectTone") {
    return isUnmodifiedKey(event, "w");
  }
  if (action === "selectEraser") {
    return isUnmodifiedKey(event, "e");
  }
  if (action === "selectShape") {
    return isUnmodifiedKey(event, "r");
  }
  if (action === "decreaseBrushSize") {
    return isUnmodifiedKey(event, "]");
  }
  if (action === "increaseBrushSize") {
    return isUnmodifiedKey(event, "[");
  }
  if (action === "previousPage") {
    return event.key === "ArrowLeft";
  }
  if (action === "nextPage") {
    return event.key === "ArrowRight";
  }
  if (action === "previousLayer") {
    return event.key === "ArrowUp";
  }
  if (action === "nextLayer") {
    return event.key === "ArrowDown";
  }
  if (action === "toggleOnionSkin") {
    return isPrimaryModifierKey(event, platform);
  }

  return false;
}

export function getShortcutLabel(action: ShortcutAction, platform: Platform): string {
  const keys = shortcutKeys[action];
  const primary = platform === "mac" ? "⌘" : "Ctrl";
  const shift = platform === "mac" ? "⇧" : "Shift";
  const usesPrimary = keys.includes("Primary");
  const separator = platform === "mac" && usesPrimary ? "" : "+";
  const orderedKeys: string[] = platform === "mac" && usesPrimary && keys.includes("Shift")
    ? [...keys.filter((key) => key === "Shift"), ...keys.filter((key) => key !== "Shift")]
    : keys;

  return orderedKeys
    .map((key) => {
      if (key === "Primary") {
        return primary;
      }
      if (key === "Shift") {
        return shift;
      }
      if (key === "Alt") {
        return platform === "mac" ? "Option" : "Alt";
      }
      return key;
    })
    .join(separator);
}

function getNormalizedKey(event: KeyboardLikeEvent): string {
  return event.key.toLowerCase();
}

function isUnmodifiedKey(event: KeyboardLikeEvent, key: string): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && getNormalizedKey(event) === key;
}

function getNavigatorPlatform(): string {
  return typeof navigator === "undefined" ? "" : navigator.platform;
}

function getNavigatorUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

function getNavigatorUserAgentDataPlatform(): string {
  if (typeof navigator === "undefined" || !("userAgentData" in navigator)) {
    return "";
  }

  const userAgentData = navigator.userAgentData as { platform?: string };
  return userAgentData.platform ?? "";
}
