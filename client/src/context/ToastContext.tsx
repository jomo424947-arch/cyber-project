import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss after 4s.
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast viewport */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className="ccms-stagger"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: '280px',
              maxWidth: '380px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderLeft: `3px solid ${accentFor(t.type)}`,
              boxShadow: 'var(--shadow-card)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontSize: '14px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: accentFor(t.type),
                flexShrink: 0,
                boxShadow: `0 0 8px ${accentFor(t.type)}`,
              }}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function accentFor(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'var(--accent-green)';
    case 'error':
      return 'var(--accent-red)';
    default:
      return 'var(--accent-cyan)';
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
