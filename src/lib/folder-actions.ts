import {
  fetchGroupedIds,
  markConversationsRead,
  markPeopleRead,
  updateMailState,
  type GroupedQuery,
  type MailItemRef,
} from "@/lib/api";

/** Split into chunks the API accepts (100 per call). */
function chunks<T>(xs: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Mark every unread row matching a list query as read — the whole folder,
 * not just the loaded page. Returns how many rows were affected.
 */
export async function markFolderRead(
  query: Omit<GroupedQuery, "page" | "limit" | "withTabCounts">,
): Promise<number> {
  const { data } = await fetchGroupedIds({ ...query, unread: true });
  const people = data.filter((r) => r.type === "person").map((r) => r.id);
  const groups = data.filter((r) => r.type === "group").map((r) => r.id);
  await Promise.all([
    ...chunks(people).map((ids) => markPeopleRead(ids)),
    ...chunks(groups).map((ids) => markConversationsRead(ids)),
  ]);
  return data.length;
}

/** Apply a mail-state patch to every row matching a list query. */
export async function applyToFolder(
  query: Omit<GroupedQuery, "page" | "limit" | "withTabCounts">,
  patch: Parameters<typeof updateMailState>[1],
): Promise<MailItemRef[]> {
  const { data } = await fetchGroupedIds(query);
  const refs = data.map(({ type, id }) => ({ type, id }));
  for (const c of chunks(refs)) await updateMailState(c, patch);
  return refs;
}
