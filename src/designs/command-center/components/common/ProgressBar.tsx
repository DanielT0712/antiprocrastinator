type ProgressBarVariant = "accent" | "success" | "warning" | "danger";

interface ProgressBarProps {
  value: number;
  variant?: ProgressBarVariant;
}

const variantColors: Record<ProgressBarVariant, string> = {
  accent: "bg-[var(--accent)]",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--danger)]",
};

export function ProgressBar({ value, variant = "accent" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="w-full h-2 rounded-full bg-[var(--bg-tertiary)]">
      <div
        className={`h-full rounded-full transition-all ${variantColors[variant]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
