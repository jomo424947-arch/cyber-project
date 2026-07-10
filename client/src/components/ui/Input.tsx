import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...rest }, ref) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {label && (
          <label htmlFor={id} className="ccms-eyebrow">
            {label}
          </label>
        )}
        <input ref={ref} id={id} className={`ccms-input ${className}`} {...rest} />
        {error && (
          <span style={{ color: 'var(--accent-red)', fontSize: '12px' }}>{error}</span>
        )}
        {!error && hint && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{hint}</span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
