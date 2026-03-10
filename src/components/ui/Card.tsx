import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] bg-[var(--color-bg-surface)] p-5",
        onClick && "cursor-pointer transition-shadow hover:shadow-[var(--shadow-xs)]",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
