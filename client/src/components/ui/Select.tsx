import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', id, children, ...rest }, ref) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {label && (
          <label htmlFor={id} className="ccms-eyebrow">
            {label}
          </label>
        )}
        <select ref={ref} id={id} className={`ccms-input ${className}`} {...rest}>
          {children}
        </select>
        {error && (
          <span style={{ color: 'var(--accent-red)', fontSize: '12px' }}>{error}</span>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';
