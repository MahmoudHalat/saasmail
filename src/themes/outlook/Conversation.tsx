import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  Clock,
  Code,
  Forward,
  Link2,
  MoreHorizontal,
  Paperclip,
  Reply,
  ReplyAll,
  Trash2,
} from "lucide-react";
import ImageAttachments, {
  splitAttachments,
} from "@/components/ImageAttachments";
import EmailHtmlModal from "@/components/EmailHtmlModal";
import { deleteEmail, type Email, type GroupedItem } from "@/lib/api";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";
import {
  copyMessageLink,
  messageDomId,
  readMessageHash,
} from "@/lib/message-link";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ComposePrefill } from "@/pages/ComposeModal";
import { buildForwardHtml, formatFullDate, forwardSubject } from "./lib";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "./Menu";
import { Avatar, IconButton } from "./ui";
import InlineReply, { type ReplyMode } from "./InlineReply";
import { inboxOfEmail, useIdentities } from "./useConversation";

/** Commands the ribbon / shortcuts send to the open conversation. */
export const CONVERSATION_COMMAND = "ol:conversation-command";
export type ConversationCommand = "reply" | "replyAll" | "forward";
export function sendConversationCommand(cmd: ConversationCommand) {
  window.dispatchEvent(new CustomEvent(CONVERSATION_COMMAND, { detail: cmd }));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function plain(email: Email): string {
  if (email.bodyText) return email.bodyText.replace(/\s+/g, " ").trim();
  if (!email.bodyHtml) return "";
  const div = document.createElement("div");
  div.innerHTML = sanitizeEmailHtml(email.bodyHtml);
  return (div.textContent ?? "").replace(/\s+/g, " ").trim();
}

interface Party {
  name: string;
  email: string;
}

function useParties(item: GroupedItem) {
  const { senderIdentities } = useIdentities();
  return useMemo(() => {
    const people = new Map<string, string | null>();
    if (item.type === "person") people.set(item.email.toLowerCase(), item.name);
    else
      for (const p of item.participants)
        people.set(p.email.toLowerCase(), p.name);
    const ids = new Map(
      senderIdentities.map((s) => [s.email.toLowerCase(), s.displayName]),
    );
    const party = (addr: string | null): Party => {
      const a = (addr ?? "").trim();
      const key = a.toLowerCase();
      const name = people.get(key) || ids.get(key) || a || "Unknown";
      return { name, email: a };
    };
    return { party, senderIdentities };
  }, [item, senderIdentities]);
}

function MessageCard({
  email,
  expanded,
  onToggle,
  party,
  onReply,
  onForward,
  onDelete,
  onBlock,
  onSource,
  canBlock,
  compact,
}: {
  email: Email;
  expanded: boolean;
  onToggle: () => void;
  party: (a: string | null) => Party;
  onReply: (mode: ReplyMode) => void;
  onForward: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onSource: () => void;
  canBlock: boolean;
  compact?: boolean;
}) {
  const sent = email.type === "sent";
  const from = party(email.fromAddress);
  const toAddr = sent ? email.toAddress : email.recipient;
  const to = party(toAddr);
  const unread = email.type === "received" && email.isRead === 0;
  const failed = sent && email.status === "failed";
  const retrying = sent && email.status === "retrying";
  const { images, files } = splitAttachments(email.attachments);
  const preview = useMemo(() => plain(email).slice(0, 200), [email]);

  if (!expanded) {
    return (
      <div
        id={messageDomId(email.id)}
        className={cn("ol-msg ol-msg-collapsed", unread && "ol-msg-unread")}
      >
        <button
          type="button"
          className="ol-msg-collapsed-btn"
          onClick={onToggle}
          aria-expanded={false}
        >
          <Avatar
            name={from.name}
            seed={from.email || from.name}
            size={compact ? 32 : 40}
          />
          <span className="min-w-0 flex-1 text-left">
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  "truncate text-[14px] text-text-primary",
                  unread ? "font-semibold" : "font-normal",
                )}
              >
                {from.name}
              </span>
              <span className="ml-auto shrink-0 text-[12px] text-text-secondary">
                {formatFullDate(email.timestamp)}
              </span>
            </span>
            <span className="block truncate text-[13px] text-text-secondary">
              {preview || "(no text)"}
            </span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <article
      id={messageDomId(email.id)}
      data-email-id={email.id}
      className={cn("ol-msg", failed && "ol-msg-failed")}
    >
      <header className="ol-msg-head">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded
          aria-label={`Collapse message from ${from.name}`}
          className="shrink-0 rounded-full focus-visible:outline-2"
        >
          <Avatar
            name={from.name}
            seed={from.email || from.name}
            size={compact ? 32 : 40}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span className="truncate text-[14px] font-semibold text-text-primary">
              {from.name}
            </span>
            <span className="ol-msg-addr truncate text-[12px] text-text-secondary">
              &lt;{from.email}&gt;
            </span>
          </div>
          <div className="truncate text-[12px] text-text-secondary">
            To:&nbsp;
            <span className="text-text-primary">{to.name}</span>
            {email.cc && email.cc.length > 0 && (
              <>
                {"  "}Cc:&nbsp;
                <span className="text-text-primary">
                  {email.cc.map((c) => c.name || c.email).join("; ")}
                </span>
              </>
            )}
          </div>
          {(failed || retrying) && (
            <div
              className={cn(
                "mt-1 inline-flex items-center gap-1 text-[12px] font-semibold",
                failed ? "text-destructive" : "text-warning",
              )}
            >
              {failed ? <AlertTriangle size={12} /> : <Clock size={12} />}
              {failed ? "Not delivered" : "Retrying delivery"}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="ol-msg-actions">
            <IconButton
              label="Reply"
              size="sm"
              onClick={() => onReply("reply")}
            >
              <Reply size={16} />
            </IconButton>
            <IconButton
              label="Reply all"
              size="sm"
              onClick={() => onReply("replyAll")}
            >
              <ReplyAll size={16} />
            </IconButton>
            <IconButton label="Forward" size="sm" onClick={onForward}>
              <Forward size={16} />
            </IconButton>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="More actions" size="sm">
                  <MoreHorizontal size={16} />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem
                  icon={<Reply size={16} />}
                  onSelect={() => onReply("reply")}
                >
                  Reply
                </MenuItem>
                <MenuItem
                  icon={<ReplyAll size={16} />}
                  onSelect={() => onReply("replyAll")}
                >
                  Reply all
                </MenuItem>
                <MenuItem icon={<Forward size={16} />} onSelect={onForward}>
                  Forward
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Link2 size={16} />}
                  onSelect={() =>
                    void copyMessageLink(email.id).then(() =>
                      showToast({ kind: "success", message: "Link copied" }),
                    )
                  }
                >
                  Copy link
                </MenuItem>
                {email.bodyHtml && (
                  <MenuItem icon={<Code size={16} />} onSelect={onSource}>
                    View message details
                  </MenuItem>
                )}
                {canBlock && (
                  <MenuItem icon={<Ban size={16} />} onSelect={onBlock}>
                    Block sender
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem
                  icon={<Trash2 size={16} />}
                  danger
                  onSelect={onDelete}
                >
                  Delete message
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
          <span className="text-[12px] text-text-secondary">
            {formatFullDate(email.timestamp)}
          </span>
        </div>
      </header>

      {files.length > 0 && (
        <div className="ol-attach-row">
          {files.map((att) => (
            <a
              key={att.id}
              href={`/api/attachments/${att.id}`}
              className="ol-attach"
              title={att.filename}
            >
              <Paperclip
                size={16}
                className="shrink-0 text-accent"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-text-primary">
                  {att.filename}
                </span>
                <span className="block text-[11px] text-text-secondary">
                  {formatBytes(att.size)}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}

      <div className="ol-msg-body">
        {email.bodyHtml ? (
          <div
            className="ol-mail-html"
            // Sanitized via sanitizeEmailHtml (DOMPurify).
            dangerouslySetInnerHTML={{
              __html: sanitizeEmailHtml(email.bodyHtml),
            }}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-text-primary">
            {email.bodyText || "(no text)"}
          </p>
        )}
        <ImageAttachments images={images} className="mt-3" />
      </div>
    </article>
  );
}

/**
 * The messages of one conversation as Outlook message cards, newest on
 * top. Older messages collapse to a one-line preview. Inline reply opens
 * at the top of the stack.
 */
export default function Conversation({
  item,
  emails,
  setEmails,
  loading,
  error,
  reload,
  conversationView,
  onCompose,
  onBlock,
  variant = "pane",
  replyState,
  setReplyState,
}: {
  item: GroupedItem;
  emails: Email[];
  setEmails: (fn: (prev: Email[]) => Email[]) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
  conversationView: boolean;
  onCompose: (prefill: ComposePrefill) => void;
  onBlock: () => void;
  variant?: "pane" | "mobile";
  replyState: { email: Email; mode: ReplyMode } | null;
  setReplyState: (s: { email: Email; mode: ReplyMode } | null) => void;
}) {
  const { party } = useParties(item);
  const location = useLocation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [sourceEmail, setSourceEmail] = useState<Email | null>(null);
  const initFor = useRef<string | null>(null);
  const key = `${item.type}:${item.id}`;

  // Newest and unread messages start expanded.
  useEffect(() => {
    if (emails.length === 0 || initFor.current === key) return;
    initFor.current = key;
    const s = new Set<string>([emails[0].id]);
    for (const e of emails)
      if (e.type === "received" && e.isRead === 0) s.add(e.id);
    const target = readMessageHash(location.hash);
    if (target) s.add(target);
    setExpanded(s);
    setShowAll(false);
    if (target)
      requestAnimationFrame(() =>
        document
          .getElementById(messageDomId(target))
          ?.scrollIntoView({ block: "start" }),
      );
  }, [emails, key, location.hash]);

  useEffect(() => {
    setReplyState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const forward = (email: Email) => {
    const from = party(email.fromAddress);
    const fromLabel =
      from.name !== from.email ? `${from.name} <${from.email}>` : from.email;
    onCompose({
      from: inboxOfEmail(email) ?? undefined,
      subject: forwardSubject(email.subject),
      bodyHtml: buildForwardHtml(
        email,
        fromLabel,
        email.bodyHtml ? sanitizeEmailHtml(email.bodyHtml) : null,
      ),
    });
  };

  // Ribbon / keyboard commands act on the newest message.
  useEffect(() => {
    const on = (e: Event) => {
      const cmd = (e as CustomEvent<ConversationCommand>).detail;
      const latest =
        emails.find((m) => m.type === "received") ?? emails[0] ?? null;
      if (!latest) return;
      if (cmd === "forward") forward(emails[0]);
      else setReplyState({ email: latest, mode: cmd });
    };
    window.addEventListener(CONVERSATION_COMMAND, on);
    return () => window.removeEventListener(CONVERSATION_COMMAND, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails]);

  async function removeMessage(email: Email) {
    if (
      !window.confirm(
        "Permanently delete this message and its attachments? This can't be undone.",
      )
    )
      return;
    try {
      await deleteEmail(email.id);
      setEmails((prev) => prev.filter((m) => m.id !== email.id));
      showToast({ kind: "success", message: "Message deleted" });
    } catch (e) {
      showToast({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not delete",
      });
    }
  }

  const counterpart =
    item.type === "person"
      ? item.name
        ? `${item.name} <${item.email}>`
        : item.email
      : item.participants.map((p) => p.name || p.email).join(", ");

  if (loading && emails.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy>
        {[0, 1].map((i) => (
          <div key={i} className="ol-msg ol-shimmer-card">
            <div className="flex gap-3">
              <span className="ol-shimmer h-10 w-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <span className="ol-shimmer h-3 w-1/3" />
                <span className="ol-shimmer h-3 w-1/2" />
              </div>
            </div>
            <span className="ol-shimmer mt-5 block h-3 w-5/6" />
            <span className="ol-shimmer mt-2 block h-3 w-4/6" />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[14px] text-text-secondary">{error}</p>
        <button type="button" className="ol-btn-outline" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }

  const visible = conversationView || showAll ? emails : emails.slice(0, 1);
  const hidden = emails.length - visible.length;

  return (
    <div className={cn("ol-conv", variant === "mobile" && "ol-conv-mobile")}>
      {replyState && variant === "pane" && (
        <InlineReply
          key={`${replyState.email.id}:${replyState.mode}`}
          email={replyState.email}
          mode={replyState.mode}
          counterpart={counterpart}
          onClose={() => setReplyState(null)}
          onSent={reload}
        />
      )}
      {visible.map((m) => (
        <MessageCard
          key={m.id}
          email={m}
          compact={variant === "mobile"}
          expanded={expanded.has(m.id)}
          onToggle={() =>
            setExpanded((prev) => {
              const n = new Set(prev);
              if (n.has(m.id)) n.delete(m.id);
              else n.add(m.id);
              return n;
            })
          }
          party={party}
          onReply={(mode) => setReplyState({ email: m, mode })}
          onForward={() => forward(m)}
          onDelete={() => void removeMessage(m)}
          onBlock={onBlock}
          canBlock={item.type === "person" && m.type === "received"}
          onSource={() => setSourceEmail(m)}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="ol-link self-center py-2 text-[13px]"
          onClick={() => setShowAll(true)}
        >
          Show {hidden} more {hidden === 1 ? "message" : "messages"} in this
          conversation
        </button>
      )}
      {emails.length === 0 && !loading && (
        <p className="p-8 text-center text-[14px] text-text-secondary">
          No messages here.
        </p>
      )}
      <EmailHtmlModal
        email={sourceEmail}
        open={sourceEmail !== null}
        onClose={() => setSourceEmail(null)}
        onUpdated={reload}
      />
    </div>
  );
}
