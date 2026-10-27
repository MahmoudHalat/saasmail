import { useLayoutSettings } from "@/lib/preferences";
import {
  defaultDirectionFor,
  type InboxSort,
  type InboxSortSpec,
} from "@/lib/api";
import { HIDE_SIGNATURES_STORAGE_KEY } from "@/lib/signatures";

/**
 * View settings of the default layout, saved to the account
 * (`layoutSettings.default`) so they follow the user to every device.
 * They used to live in this browser's localStorage; the old keys are read
 * once and moved into the account.
 */
export interface DefaultLayoutSettings extends Record<string, unknown> {
  /** The portal rail is collapsed to icons. */
  railCollapsed: boolean;
  /** Width of the conversation list in List view, in px. */
  listWidth: number;
  /** Inbox sort key and direction. */
  inboxSort: InboxSortSpec;
}

export const DEFAULT_LIST_WIDTH = 384;
export const MIN_LIST_WIDTH = 56;
export const MAX_LIST_WIDTH = 640;

export const DEFAULT_LAYOUT_DEFAULTS: DefaultLayoutSettings = {
  railCollapsed: false,
  listWidth: DEFAULT_LIST_WIDTH,
  inboxSort: { key: "recency", direction: "desc" },
};

/** Old device-only keys. */
export const LEGACY_KEYS = {
  railCollapsed: "saasmail.railCollapsed",
  listWidth: "saasmail.sidebarWidth",
  inboxSort: "saasmail.inboxSort",
} as const;

const SORT_KEYS: InboxSort[] = ["recency", "unread", "inbox", "attachments"];

/** Parse a saved sort: `{key, direction}` JSON, or an older bare key. */
export function parseInboxSort(raw: unknown): InboxSortSpec | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      /* a bare key, handled below */
    }
  }
  if (
    v &&
    typeof v === "object" &&
    SORT_KEYS.includes((v as InboxSortSpec).key) &&
    ((v as InboxSortSpec).direction === "asc" ||
      (v as InboxSortSpec).direction === "desc")
  ) {
    return {
      key: (v as InboxSortSpec).key,
      direction: (v as InboxSortSpec).direction,
    };
  }
  if (typeof v === "string" && SORT_KEYS.includes(v as InboxSort)) {
    return {
      key: v as InboxSort,
      direction: defaultDirectionFor(v as InboxSort),
    };
  }
  return null;
}

export function clampListWidth(n: unknown): number {
  const w = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(w)) return DEFAULT_LIST_WIDTH;
  return Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(w)));
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** What this browser still has under the old keys. */
export function readLegacyDefaultLayout(): Partial<DefaultLayoutSettings> | null {
  const out: Partial<DefaultLayoutSettings> = {};
  const rail = readLocal(LEGACY_KEYS.railCollapsed);
  if (rail === "1" || rail === "0") out.railCollapsed = rail === "1";
  const width = readLocal(LEGACY_KEYS.listWidth);
  if (width && Number.isFinite(Number(width)))
    out.listWidth = clampListWidth(width);
  const sort = readLocal(LEGACY_KEYS.inboxSort);
  const parsed = sort ? parseInboxSort(sort) : null;
  if (parsed) out.inboxSort = parsed;
  return Object.keys(out).length > 0 ? out : null;
}

/** The default layout's account-saved view settings. */
export function useDefaultLayoutSettings() {
  return useLayoutSettings<DefaultLayoutSettings>(
    "default",
    DEFAULT_LAYOUT_DEFAULTS,
    readLegacyDefaultLayout,
  );
}

/**
 * Settings every layout shares (`layoutSettings.common`): the Undo Send
 * delay and whether chat bubbles hide signatures.
 */
export interface CommonSettings extends Record<string, unknown> {
  undoSendSeconds: number;
  hideSignatures: boolean;
}

export const COMMON_DEFAULTS: CommonSettings = {
  undoSendSeconds: 5,
  hideSignatures: false,
};

export function readLegacyCommon(): Partial<CommonSettings> | null {
  const v = readLocal(HIDE_SIGNATURES_STORAGE_KEY);
  return v === "1" || v === "0" ? { hideSignatures: v === "1" } : null;
}

export function useCommonSettings() {
  return useLayoutSettings<CommonSettings>(
    "common",
    COMMON_DEFAULTS,
    readLegacyCommon,
  );
}
