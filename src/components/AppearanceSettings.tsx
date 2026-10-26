import { Check, Monitor, Moon, Rows3, Rows4, Sun } from "lucide-react";
import { usePreferences } from "@/lib/preferences";
import type { ColorMode, Density, UiTheme } from "@/lib/api";
import { cn } from "@/lib/utils";

const LAYOUTS: Array<{ id: UiTheme; label: string; blurb: string }> = [
  {
    id: "default",
    label: "Default",
    blurb: "Navy sidebar, list and reading pane side by side.",
  },
  {
    id: "gmail",
    label: "Gmail-style",
    blurb: "Familiar Gmail layout, gestures and shortcuts.",
  },
  {
    id: "outlook",
    label: "Outlook-style",
    blurb: "Folder pane, message list and reading pane.",
  },
];

const MODES: Array<{ id: ColorMode; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const DENSITIES: Array<{ id: Density; label: string; icon: typeof Rows3 }> = [
  { id: "comfortable", label: "Comfortable", icon: Rows3 },
  { id: "compact", label: "Compact", icon: Rows4 },
];

function Thumb({ id }: { id: UiTheme }) {
  if (id === "gmail") {
    return (
      <div className="mock mock-gmail" aria-hidden>
        <div className="nav">
          <span className="compose" />
          <i className="on" />
          <i style={{ width: "70%" }} />
          <i style={{ width: "60%" }} />
          <i style={{ width: "75%" }} />
        </div>
        <div className="main">
          {[60, 72, 50, 66, 58].map((w, n) => (
            <div className="row" key={n}>
              <i style={{ width: 8 }} />
              <i style={{ width: "22%" }} />
              <i style={{ width: `${w - 22}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (id === "outlook") {
    return (
      <div className="mock mock-outlook" aria-hidden>
        <div className="suite" />
        <div className="body">
          <div className="folders">
            <i style={{ width: "80%" }} />
            <i style={{ width: "60%" }} />
            <i style={{ width: "70%" }} />
          </div>
          <div className="list">
            <div className="sel">
              <i style={{ width: "70%" }} />
              <i style={{ width: "90%" }} />
            </div>
            <i style={{ width: "65%" }} />
            <i style={{ width: "85%" }} />
            <i style={{ width: "55%" }} />
          </div>
          <div className="read">
            <i style={{ width: "50%", height: 6 }} />
            <i style={{ width: "90%" }} />
            <i style={{ width: "80%" }} />
            <i style={{ width: "86%" }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mock mock-default" aria-hidden>
      <div className="rail">
        <i className="on" style={{ width: "90%" }} />
        <i style={{ width: "70%" }} />
        <i style={{ width: "80%" }} />
        <i style={{ width: "60%" }} />
      </div>
      <div className="col">
        <div className="band">
          <i />
        </div>
        <div className="paper">
          <div className="mock-card" style={{ width: "38%" }}>
            <i style={{ width: "80%" }} />
            <i style={{ width: "60%" }} />
            <i style={{ width: "75%" }} />
            <i style={{ width: "55%" }} />
          </div>
          <div className="mock-card" style={{ flex: 1 }}>
            <i style={{ width: "50%", height: 6 }} />
            <i style={{ width: "90%" }} />
            <i style={{ width: "80%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Settings → Appearance: the mail layout (Default / Gmail-style /
 * Outlook-style), colour mode and density. Saved to the account through
 * usePreferences, so the choice follows the user across devices.
 */
export default function AppearanceSettings() {
  const { uiTheme, colorMode, density, setPreferences } = usePreferences();

  return (
    <section id="appearance" className="scroll-mt-6">
      <div className="mb-3">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-text-primary">
          Appearance
        </h2>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Pick the mail layout you are most comfortable with. Everything else
          stays the same.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="font-label mb-3 text-text-tertiary">Mail layout</p>
        <div
          role="radiogroup"
          aria-label="Mail layout"
          className="grid gap-3 sm:grid-cols-3"
        >
          {LAYOUTS.map((l) => {
            const on = uiTheme === l.id;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`appearance-layout-${l.id}`}
                onClick={() => setPreferences({ uiTheme: l.id })}
                className={cn(
                  "group flex flex-col gap-3 rounded-xl border p-2.5 text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  on
                    ? "border-accent shadow-[0_0_0_1px_var(--sm-accent)]"
                    : "border-border hover:border-border-strong",
                )}
              >
                <Thumb id={l.id} />
                <span className="flex items-start gap-2 px-1 pb-0.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-text-primary">
                      {l.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-text-secondary">
                      {l.blurb}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border",
                      on
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border-strong",
                    )}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <p className="font-label mb-2 text-text-tertiary">Colour mode</p>
            <div className="pt-seg" role="radiogroup" aria-label="Colour mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={colorMode === m.id}
                  onClick={() => setPreferences({ colorMode: m.id })}
                >
                  <m.icon />
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-label mb-2 text-text-tertiary">Density</p>
            <div className="pt-seg" role="radiogroup" aria-label="Density">
              {DENSITIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={density === d.id}
                  onClick={() => setPreferences({ density: d.id })}
                >
                  <d.icon />
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
