import { useEffect, useRef } from "react";
import {
  ArrowDownUp,
  Check,
  CheckSquare,
  Filter,
  Mail,
  MailOpen,
  Paperclip,
  Pin,
  Trash2,
} from "lucide-react";
import type { GroupedItem } from "@/lib/api";
import { itemKey, itemTitle } from "@/hooks/useMailList";
import { cn } from "@/lib/utils";
import {
  FILTER_LABELS,
  formatListTime,
  type ListFilter,
  type ListSort,
} from "./lib";
import type { OutlookMail } from "./useOutlookMail";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "./Menu";
import { Avatar, FlagGlyph, IconButton } from "./ui";

export function rowSubject(item: GroupedItem): string {
  return item.latestSubject?.trim() || "(No subject)";
}

export function ShimmerRows({
  count = 8,
  mobile,
}: {
  count?: number;
  mobile?: boolean;
}) {
  return (
    <div aria-busy aria-label="Loading messages">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn("ol-row ol-row-shimmer", mobile && "ol-m-row")}
        >
          <span
            className={cn(
              "ol-shimmer rounded-full",
              mobile ? "h-10 w-10" : "h-8 w-8",
            )}
          />
          <span className="flex flex-1 flex-col gap-2">
            <span className="ol-shimmer h-3 w-2/5" />
            <span className="ol-shimmer h-3 w-3/4" />
            <span className="ol-shimmer h-3 w-1/2" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyFolder({ title, q }: { title: string; q?: string }) {
  return (
    <div className="ol-empty">
      <div className="ol-empty-art" aria-hidden>
        <span className="ol-empty-sun" />
        <span className="ol-empty-hill" />
      </div>
      <p className="text-[16px] font-semibold text-text-primary">
        {q ? "We didn't find anything" : "All caught up"}
      </p>
      <p className="max-w-[260px] text-[13px] text-text-secondary">
        {q
          ? `No results for “${q}”. Try other words or search all folders.`
          : title === "Inbox"
            ? "Nothing new here. Enjoy the quiet."
            : `Nothing in ${title}.`}
      </p>
    </div>
  );
}

function Row({
  item,
  mail,
  selected,
  focused,
}: {
  item: GroupedItem;
  mail: OutlookMail;
  selected: boolean;
  focused: boolean;
}) {
  const unread = item.unreadCount > 0;
  const title = itemTitle(item);
  const ref = useRef<HTMLDivElement>(null);
  const multi = mail.checkMode || mail.selected.size > 1;

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      data-key={itemKey(item)}
      data-testid="ol-row"
      className={cn(
        "ol-row group",
        unread && "ol-row-unread",
        selected && "ol-row-selected",
        multi && "ol-row-multi",
      )}
      onClick={(e) => mail.clickRow(item, e)}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          mail.toggleChecked(item);
        }
      }}
    >
      <div className="ol-row-avatar">
        <Avatar name={title} seed={title} size={32} />
        <button
          type="button"
          role="checkbox"
          aria-checked={selected && multi}
          aria-label={`Select ${title}`}
          className="ol-row-check"
          onClick={(e) => {
            e.stopPropagation();
            mail.toggleChecked(item);
          }}
        >
          {selected && multi && <Check size={14} strokeWidth={3} />}
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px]",
              unread ? "font-semibold text-text-primary" : "text-text-primary",
            )}
          >
            {title}
            {item.type === "group" && (
              <span className="ml-1 font-normal text-text-secondary">
                ({item.participants.length})
              </span>
            )}
          </span>
          <span className="ol-row-icons">
            {item.hasAttachment > 0 && (
              <Paperclip size={14} aria-label="Has attachments" />
            )}
            {item.pinned && (
              <Pin size={14} className="fill-current" aria-label="Pinned" />
            )}
            {item.starred && (
              <span aria-label="Flagged" className="text-star">
                <FlagGlyph size={14} filled />
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              unread ? "font-semibold text-accent" : "text-text-primary",
            )}
          >
            {rowSubject(item)}
          </span>
          <span
            className={cn(
              "ol-row-time shrink-0 text-[12px]",
              unread ? "font-semibold text-accent" : "text-text-secondary",
            )}
          >
            {formatListTime(item.lastEmailAt)}
          </span>
        </div>
        <div className="ol-row-preview truncate text-[13px] text-text-secondary">
          {item.snippet || " "}
        </div>
      </div>
      <div className="ol-row-hover" onClick={(e) => e.stopPropagation()}>
        <IconButton
          label="Delete"
          size="sm"
          onClick={() => void mail.ops.delete([item])}
          disabled={item.type !== "person"}
        >
          <Trash2 size={16} />
        </IconButton>
        <IconButton
          label={item.starred ? "Unflag" : "Flag this message"}
          size="sm"
          onClick={() => mail.ops.flag([item])}
        >
          <FlagGlyph size={16} filled={item.starred} />
        </IconButton>
        <IconButton
          label={item.pinned ? "Unpin" : "Pin this message"}
          size="sm"
          onClick={() => mail.ops.pin([item])}
        >
          <Pin size={16} className={item.pinned ? "fill-current" : undefined} />
        </IconButton>
        <IconButton
          label={unread ? "Mark as read" : "Mark as unread"}
          size="sm"
          onClick={() => mail.ops.toggleRead([item])}
        >
          {unread ? <MailOpen size={16} /> : <Mail size={16} />}
        </IconButton>
      </div>
    </div>
  );
}

export default function MessageList({ mail }: { mail: OutlookMail }) {
  const { list, groups } = mail;
  const sentinel = useRef<HTMLDivElement>(null);
  const focusKey = mail.openKey ?? [...mail.selected][0] ?? null;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !mail.hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) mail.loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [mail.hasMore, mail.loadMore, mail]);

  const empty = !list.loading && !list.error && mail.filtered.length === 0;

  return (
    <section className="ol-list" aria-label="Message list">
      <div className="ol-list-head">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton
            label={mail.checkMode ? "Exit selection mode" : "Select"}
            size="sm"
            aria-pressed={mail.checkMode}
            className={mail.checkMode ? "text-accent" : undefined}
            onClick={() => {
              if (mail.checkMode) mail.clearSelection();
              else mail.setCheckMode(true);
            }}
          >
            <CheckSquare size={16} />
          </IconButton>
          <h2
            className="truncate text-[16px] font-semibold text-text-primary"
            title={mail.folderTitle}
          >
            {mail.folderTitle}
          </h2>
          {mail.selected.size > 1 && (
            <span className="shrink-0 text-[12px] text-text-secondary">
              · {mail.selected.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center">
          <Menu>
            <MenuTrigger asChild>
              <IconButton
                label={`Filter: ${FILTER_LABELS[mail.filter]}`}
                size="sm"
                className={mail.filter !== "all" ? "text-accent" : undefined}
              >
                <Filter size={16} />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>Filter</MenuLabel>
              <MenuRadioGroup
                value={mail.filter}
                onValueChange={(v) => mail.setFilter(v as ListFilter)}
              >
                {(Object.keys(FILTER_LABELS) as ListFilter[]).map((f) => (
                  <MenuRadioItem key={f} value={f}>
                    {FILTER_LABELS[f]}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="Sort" size="sm">
                <ArrowDownUp size={16} />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>Sort by</MenuLabel>
              <MenuRadioGroup
                value={mail.sort}
                onValueChange={(v) => mail.setSort(v as ListSort)}
              >
                <MenuRadioItem value="date">Date</MenuRadioItem>
                <MenuRadioItem value="from">From</MenuRadioItem>
                <MenuRadioItem value="unread">Unread</MenuRadioItem>
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </div>
      </div>
      {mail.filter !== "all" && (
        <div className="ol-filter-chip-row">
          <button
            type="button"
            className="ol-filter-chip"
            onClick={() => mail.setFilter("all")}
            aria-label={`Clear filter ${FILTER_LABELS[mail.filter]}`}
          >
            {FILTER_LABELS[mail.filter]} ×
          </button>
        </div>
      )}

      <div
        className="ol-list-scroll"
        role="listbox"
        aria-label={mail.folderTitle}
        aria-multiselectable
      >
        {list.loading && mail.allItems.length === 0 ? (
          <ShimmerRows />
        ) : list.error ? (
          <div className="ol-empty">
            <p className="text-[14px] text-text-secondary">{list.error}</p>
            <button
              type="button"
              className="ol-btn-outline"
              onClick={list.refresh}
            >
              Try again
            </button>
          </div>
        ) : empty ? (
          <EmptyFolder title={mail.folderTitle} q={mail.q} />
        ) : (
          groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="ol-group-head">{g.label}</div>
              {g.items.map((it) => {
                const k = itemKey(it);
                return (
                  <Row
                    key={k}
                    item={it}
                    mail={mail}
                    selected={mail.selected.has(k) || mail.openKey === k}
                    focused={focusKey === k}
                  />
                );
              })}
            </div>
          ))
        )}
        {mail.hasMore && (
          <div ref={sentinel} className="flex justify-center py-3">
            <button
              type="button"
              className="ol-link text-[13px]"
              onClick={mail.loadMore}
            >
              {list.loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
