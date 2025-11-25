type ProgressBarProps = {
  value: number;
  label?: string;
  className?: string;
};

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={className}>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
          <span>{label}</span>
          <span>{clampedValue.toFixed(0)}%</span>
        </div>
      ) : null}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 ease-out"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
