/** Pasek postępu (sd-progress) z wartością 0–100. */
export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="sd-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={label}
    >
      <span style={{ width: `${v}%` }} />
    </div>
  );
}
