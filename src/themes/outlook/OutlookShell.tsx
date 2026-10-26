import type { ThemeShellProps } from "@/themes/types";

/** Placeholder until the Outlook layout lands. */
export default function OutlookShell({ children }: ThemeShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">{children}</div>
  );
}
