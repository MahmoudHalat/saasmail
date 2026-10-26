import {
  fetchGroupedPeople,
  markConversationsRead,
  markPeopleRead,
} from "@/lib/api";
import { dispatchInboxRefresh } from "@/lib/inbox-events";
import { showToast } from "@/lib/toast";
import { folderQuery } from "./lib";
import type { FolderTarget } from "./FolderList";

/** Mark every unread conversation in a folder read (folder right-click). */
export async function markFolderRead(t: FolderTarget): Promise<number> {
  const people: string[] = [];
  const groups: string[] = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await fetchGroupedPeople({
        ...folderQuery(t.folder),
        recipient: t.label,
        unread: true,
        page,
        limit: 100,
      });
      for (const r of res.data)
        (r.type === "person" ? people : groups).push(r.id);
      if (people.length + groups.length >= res.total || !res.data.length) break;
    }
    await Promise.all([
      people.length ? markPeopleRead(people) : null,
      groups.length ? markConversationsRead(groups) : null,
    ]);
    const n = people.length + groups.length;
    showToast({
      kind: n ? "success" : "info",
      message: n
        ? `Marked ${n} conversation${n === 1 ? "" : "s"} as read`
        : "Everything here is already read",
    });
    dispatchInboxRefresh();
    return n;
  } catch {
    showToast({ kind: "error", message: "Couldn't mark all as read" });
    return 0;
  }
}
