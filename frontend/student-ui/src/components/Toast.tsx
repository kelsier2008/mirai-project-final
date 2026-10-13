import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Notify = (message: string, isError?: boolean) => void;
const Ctx = createContext<Notify>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; error: boolean }[]>([]);
  const notify = useCallback<Notify>((message, error = false) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, message, error }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={notify}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`max-w-[340px] rounded-field px-4 py-3 text-[14px] text-white shadow-lift ${i.error ? 'bg-danger' : 'bg-ink'}`}>{i.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
