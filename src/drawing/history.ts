import type { DrawingProject, Snapshot } from "./types";
import { createSnapshot, restoreSnapshot } from "./project";

const MAX_HISTORY = 20;

export type HistoryState = {
  undoStack: Snapshot[];
  redoStack: Snapshot[];
};

export function createHistory(project: DrawingProject): HistoryState {
  return {
    undoStack: [createSnapshot(project)],
    redoStack: [],
  };
}

export function pushHistory(history: HistoryState, project: DrawingProject): HistoryState {
  return {
    undoStack: [...history.undoStack.slice(-(MAX_HISTORY - 1)), createSnapshot(project)],
    redoStack: [],
  };
}

export function undo(project: DrawingProject, history: HistoryState): [DrawingProject, HistoryState] {
  if (history.undoStack.length <= 1) {
    return [project, history];
  }

  const nextUndoStack = history.undoStack.slice(0, -1);
  const current = history.undoStack[history.undoStack.length - 1];
  const previous = nextUndoStack[nextUndoStack.length - 1];

  return [
    restoreSnapshot(project, previous),
    {
      undoStack: nextUndoStack,
      redoStack: [current, ...history.redoStack],
    },
  ];
}

export function redo(project: DrawingProject, history: HistoryState): [DrawingProject, HistoryState] {
  if (history.redoStack.length === 0) {
    return [project, history];
  }

  const [next, ...nextRedoStack] = history.redoStack;

  return [
    restoreSnapshot(project, next),
    {
      undoStack: [...history.undoStack, next].slice(-MAX_HISTORY),
      redoStack: nextRedoStack,
    },
  ];
}
