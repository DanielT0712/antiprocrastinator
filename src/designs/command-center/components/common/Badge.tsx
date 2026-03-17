import type { ReactNode } from "react";

type BadgeVariant = "work" | "break" | "sleep" | "meal" | "custom" | "default";

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  work: "bg-indigo-500/20 text-indigo-400",
  break: "bg-green-500/20 text-green-400",
  sleep: "bg-blue-500/20 text-blue-400",
  meal: "bg-amber-500/20 text-amber-400",
  custom: "bg-purple-500/20 text-purple-400",
  default: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
};

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
