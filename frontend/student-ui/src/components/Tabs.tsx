export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-line bg-white p-1 shadow-card">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} type="button" onClick={() => onChange(t.id)}
          className={`rounded-full px-5 py-1.5 text-[14px] font-medium transition-colors ${value === t.id ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
