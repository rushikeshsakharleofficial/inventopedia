import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog.js';

type Guard = { register: (id: string, dirty: boolean) => void; navigate: (action: () => void) => void };
const Context = createContext<Guard>({ register: () => {}, navigate: action => action() });

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<(() => void) | null>(null);
  const register = useCallback((id: string, value: boolean) => setDirty(current => {
    if (current.has(id) === value) return current;
    const next = new Set(current); if (value) next.add(id); else next.delete(id); return next;
  }), []);
  const navigate = useCallback((action: () => void) => { if (dirty.size) setPending(() => action); else action(); }, [dirty]);
  useEffect(() => {
    if (!dirty.size) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload); return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  const value = useMemo(() => ({ register, navigate }), [register, navigate]);
  return <Context.Provider value={value}>{children}{pending && <Dialog titleId="unsaved-title" onClose={() => setPending(null)}><div className="modal-header"><div><p className="eyebrow">UNSAVED CHANGES</p><h2 id="unsaved-title">Leave without saving?</h2></div></div><p className="form-help">Your unsaved changes will be lost.</p><div className="modal-actions"><button autoFocus className="button secondary" onClick={() => setPending(null)}>Keep editing</button><button className="button danger-button" onClick={() => { const action = pending; setPending(null); action(); }}>Leave without saving</button></div></Dialog>}</Context.Provider>;
}

export function useUnsaved(dirty: boolean) {
  const id = useId(); const { register } = useContext(Context);
  useEffect(() => { register(id, dirty); return () => register(id, false); }, [dirty, id, register]);
}
export function useGuardedNavigation() { return useContext(Context).navigate; }
