import { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

/** Standard surface card with the spec's border, radius, and shadow. */
export function Card({ children, hover = false, className = '', ...rest }: CardProps) {
  return (
    <div className={`ccms-card ${hover ? 'ccms-card-hover' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}
