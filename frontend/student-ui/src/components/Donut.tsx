interface Props { present: number; absent: number; size?: number }

/** Green ring with a red segment for the absent share; percentage in the centre. */
export function Donut({ present, absent, size = 165 }: Props) {
  const total = present + absent;
  const pct = total === 0 ? 0 : Math.round((present / total) * 100);
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const redLen = total === 0 ? 0 : (absent / total) * c;
  const gap = absent > 0 && present > 0 ? 6 : 0;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${pct}% present`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={total === 0 ? "var(--color-line)" : "var(--color-success)"} strokeWidth={stroke} />
        {redLen > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-danger-bar)" strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${Math.max(redLen - gap, 1)} ${c}`} transform={`rotate(${(present / total) * 360} ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[38px] font-bold leading-none text-success">{pct}%</span>
        <span className="mt-1 text-[15px] text-muted">Present</span>
      </div>
    </div>
  );
}
