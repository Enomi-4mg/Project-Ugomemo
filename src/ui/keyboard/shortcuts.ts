import type React from "react";

export type Platform = "mac" | "windows" | "linux" | "unknown";

export type ShortcutAction =
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "delete"
  | "playPause"
  | "playFromCurrent"
  | "selectPen"
  | "selectTone"
  | "selectEraser"
  | "selectShape"
  | "previousPage"
  | "nextPage"
  | "previousLayer"
  | "nextLayer"
  | "toggleOnionSkin";

type KeyboardLikeEvent = KeyboardEvent | React.KeyboardEvent;

const shortcutKeys: Record<ShortcutAction, string[]> = {
  undo: ["Z"],
  redo: ["Shift", "Z"],
  copy: ["C"],
  paste: ["V"],
  delete: ["Delete"],
  playPause: ["Space"],
  playFromCurrent: ["Alt", "Space"],
  selectPen: ["P"],
  selectTone: ["T"],
  selectEraser: ["E"],
  selectShape: ["S"],
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

export function getShortcutLabel(action: ShortcutAction, platform: Platform): string {
  const keys = shortcutKeys[action];
  const primary = platform === "mac" ? "⌘" : "Ctrl";
  const shift = platform === "mac" ? "⇧" : "Shift";
  const separator = platform === "mac" ? "" : "+";

  return keys
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
