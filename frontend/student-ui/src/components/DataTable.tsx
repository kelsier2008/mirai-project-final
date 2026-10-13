import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface Column<T> { header: string; cell: (row: T) => ReactNode }

export function DataTable<T>({ rows, columns, empty = 'Nothing to show yet', rowKey }: { rows: T[]; columns: Column<T>[]; empty?: string; rowKey: (r: T) => string | number }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted">
        <Inbox size={26} strokeWidth={1.5} />
        <span className="text-sm">{empty}</span>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Scrollable data table">
      <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-line text-[12px] uppercase tracking-wide text-muted">
            {columns.map((c) => <th key={c.header} className="px-3 py-2.5 font-semibold">{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-line/70 align-top last:border-0">
              {columns.map((c) => <td key={c.header} className="px-3 py-3 text-ink">{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
