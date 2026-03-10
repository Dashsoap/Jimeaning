import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "info";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  accent:
    "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  success:
    "bg-[var(--color-success-light)] text-[var(--color-success)]",
  danger:
    "bg-[var(--color-danger-light)] text-[var(--color-danger)]",
  warning:
    "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  info:
    "bg-[var(--color-info-light)] text-[var(--color-info)]",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
