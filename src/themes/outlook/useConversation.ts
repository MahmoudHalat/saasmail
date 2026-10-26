import { useCallback, useEffect, useState } from "react";
import {
  fetchConversationEmails,
  fetchPersonEmails,
  fetchStats,
  type Email,
  type GroupedItem,
  type Stats,
} from "@/lib/api";
import { onEmailSent } from "@/lib/email-events";
import { onInboxRefresh } from "@/lib/inbox-events";

/** Messages of one grouped row, newest first (Outlook's default order). */
export function useConversation(item: GroupedItem | null, label?: string) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = item?.type;
  const id = item?.id;

  const load = useCallback(
    async (silent = false) => {
      if (!type || !id) {
        setEmails([]);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const list =
          type === "person"
            ? (await fetchPersonEmails(id, { recipient: label, limit: 100 }))
                .emails
            : (await fetchConversationEmails(id)).emails;
        setEmails([...list].sort((a, b) => b.timestamp - a.timestamp));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load messages");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [type, id, label],
  );

  useEffect(() => {
    setEmails([]);
    void load();
  }, [load]);

  useEffect(() => onEmailSent(() => void load(true)), [load]);
  useEffect(() => onInboxRefresh(() => void load(true)), [load]);

  return { emails, setEmails, loading, error, reload: load };
}

/** Sender identities and inbox addresses (for From pickers, labels). */
let statsCache: Promise<Stats> | null = null;
export function useIdentities() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    statsCache ??= fetchStats().catch((e) => {
      statsCache = null;
      throw e;
    });
    statsCache.then(setStats).catch(() => {});
  }, []);
  return {
    recipients: stats?.recipients ?? [],
    senderIdentities: stats?.senderIdentities ?? [],
  };
}

/** Our inbox the message belongs to (where a reply goes out from). */
export function inboxOfEmail(email: Email): string | null {
  return email.type === "sent" ? email.fromAddress : email.recipient;
}

export function internalDomainsOf(
  identities: Array<{ email: string }>,
): string[] {
  const set = new Set<string>();
  for (const s of identities) {
    const at = s.email.lastIndexOf("@");
    if (at >= 0) set.add(s.email.slice(at + 1).toLowerCase());
  }
  return [...set];
}
