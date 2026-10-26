import { useSyncExternalStore } from "react";

/**
 * Small shared state for the portal shell: whether the command palette is
 * open and whether the rail is collapsed (persisted per browser).
 */
const RAIL_KEY = "saasmail.railCollapsed";

interface ShellState {
  cmdk: boolean;
  railShut: boolean;
}

function readRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

let state: ShellState = {
  cmdk: false,
  railShut: typeof window === "undefined" ? false : readRail(),
};
const listeners = new Set<() => void>();

export const shellStore = {
  get: () => state,
  set(patch: Partial<ShellState>) {
    state = { ...state, ...patch };
    if (patch.railShut !== undefined) {
      try {
        window.localStorage.setItem(RAIL_KEY, patch.railShut ? "1" : "0");
      } catch {
        /* storage may be unavailable */
      }
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useShell<T>(pick: (s: ShellState) => T): T {
  return useSyncExternalStore(shellStore.subscribe, () => pick(state));
}
