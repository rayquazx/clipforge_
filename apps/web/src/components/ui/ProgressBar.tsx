import { cn } from "@/lib/utils";

interface ProgressBarProps {
  progress: number;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({
  progress,
  className,
  showLabel = false,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden border border-border">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between items-center text-[11px] text-text-secondary">
          <span>Processing</span>
          <span>{clampedProgress}%</span>
        </div>
      )}
    </div>
  );
}
