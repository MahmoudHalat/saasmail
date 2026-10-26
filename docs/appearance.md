[saasmail](../README.md) › [Docs](README.md) › **Appearance and mail layouts**

# Appearance and mail layouts

Each user picks how saasmail looks. The choice is saved to their account, so it
follows them to every browser and phone they sign in on.

Open **Settings → Appearance** (or the theme switch in the account menu) to choose:

| Setting     | Options                                         |
| ----------- | ----------------------------------------------- |
| Mail layout | **Default**, **Gmail-style**, **Outlook-style** |
| Colour mode | Light, Dark, System (follows the device)        |
| Density     | Comfortable, Compact                            |

## The three layouts

- **Default** — saasmail's own design: a navy navigation rail and top band around
  one light work panel, with an indigo accent (emerald in dark mode). One
  timeline per customer, as described in [Inboxes and timelines](inboxes.md).
- **Gmail-style** — for people who live in Gmail: a Compose button and folder list
  on the left, a full-width message list with stars and hover actions, the
  conversation opening in place of the list, Gmail keyboard shortcuts, and on
  phones the floating search bar, swipe to archive and the Compose button.
- **Outlook-style** — for people who live in Outlook: the blue header, an app bar,
  a ribbon (New mail, Delete, Archive, Reply, Flag, Pin, Snooze…), a folder pane,
  the message list grouped by date with a reading pane beside it, Outlook keyboard
  shortcuts, and on phones the Focused/Other switch, swipe actions and the round
  New mail button.

All three show the same mail and the same pages (templates, sequences, settings,
admin); only the layout and look change. Every layout has a light and a dark mode.

## Star, pin, archive and snooze

These work in every layout and are **per user**: archiving a conversation hides it
from your inbox, not your teammates'.

| Action  | Gmail name | Outlook name | What it does                                                     |
| ------- | ---------- | ------------ | ---------------------------------------------------------------- |
| Star    | Star       | Flag         | Marks the conversation; it shows under **Starred** / **Flagged** |
| Pin     | Pin        | Pin          | Keeps the conversation at the top of the inbox                   |
| Archive | Archive    | Archive      | Moves it out of the inbox. **New mail brings it back**           |
| Snooze  | Snooze     | Snooze       | Hides it until the chosen time, then it returns to the inbox     |

Folders: **Inbox**, **Starred**, **Snoozed**, **Sent** (conversations you have
written to), **Drafts**, **Sequenced**, **Archive**, and one entry per inbox address
(a "label" in the Gmail layout, a folder in the Outlook layout).

Delete is permanent in saasmail (there is no Trash), so it always asks first.

## Previewing a layout

Add `?ui=gmail`, `?ui=outlook` or `?ui=default` to any URL to try a layout in that
browser tab without changing your saved choice. Picking a layout in Settings clears
the preview.

## API

| Endpoint                          | Use                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/user/preferences`       | `{ uiTheme, colorMode, density }` for the signed-in user                                                                                                                                           |
| `PATCH /api/user/preferences`     | Change any of them                                                                                                                                                                                 |
| `PATCH /api/mail-state`           | Star, pin, archive or snooze up to 100 rows: `{ items: [{ type: "person" \| "group", id }], starred?, pinned?, archived?, snoozedUntil? }` (unix seconds; `null` wakes)                            |
| `GET /api/people/grouped?folder=` | `all` (default, ignores the state above), `inbox`, `starred`, `snoozed`, `archive`, `sent`. Rows carry `starred`, `pinned`, `archivedAt`, `snoozedUntil`, `hasSent`, `latestSubject` and `snippet` |

The state lives in two tables, `user_preferences` and `mail_item_states`
(migration `0048`).

## For contributors

Colours, fonts, radii and shadows are CSS variables in `src/index.css`, keyed off
`data-ui` and `data-mode` on `<html>`. Components use the semantic Tailwind names
(`bg-card`, `text-text-secondary`, `bg-accent` …), never hex values, so a page works
in every layout and mode. The Gmail and Outlook layouts live in `src/themes/gmail/`
and `src/themes/outlook/`; `src/themes/types.ts` is the contract a layout implements.
