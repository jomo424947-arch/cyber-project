import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: 'ccms-btn-primary',
  danger: 'ccms-btn-danger',
  ghost: 'ccms-btn-ghost',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, disabled, className = '', children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={`ccms-btn ${variantClass[variant]} ${className}`}
        disabled={disabled || loading}
        {...rest}
      >
        {loading && <Spinner size={14} />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );
}
