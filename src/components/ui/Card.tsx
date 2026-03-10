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
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5",
        onClick && "cursor-pointer transition-shadow hover:shadow-sm",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
