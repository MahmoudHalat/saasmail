import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11.5px] font-semibold leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-accent-subtle bg-accent-subtle text-accent-subtle-fg",
        secondary: "border-border bg-bg-subtle text-text-secondary",
        destructive:
          "border-destructive/25 bg-destructive-subtle text-destructive",
        success: "border-success/25 bg-success-subtle text-success",
        warning: "border-warning-border bg-warning-bg text-warning-text",
        info: "border-info/25 bg-info-subtle text-info",
        outline: "border-border-strong bg-transparent text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
