import type { ThemeShellProps } from "@/themes/types";

/** Placeholder until the Gmail layout lands. */
export default function GmailShell({ children }: ThemeShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">{children}</div>
  );
}
