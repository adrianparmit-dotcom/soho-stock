// @ts-nocheck
'use client';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg' | 'xl';

interface BigButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent hover:bg-accent-hover text-black font-bold shadow-lg shadow-accent/20',
  secondary:
    'bg-bg-elevated hover:bg-bg-hover border border-border text-neutral-100',
  danger: 'bg-danger hover:bg-red-600 text-white font-semibold',
  ghost: 'hover:bg-bg-hover text-neutral-300',
};

const sizeClasses: Record<Size, string> = {
  md: 'px-4 py-3 text-sm rounded-lg',
  lg: 'px-6 py-4 text-base rounded-xl',
  xl: 'px-8 py-5 text-lg rounded-2xl',
};

export const BigButton = forwardRef<HTMLButtonElement, BigButtonProps>(
  function BigButton(
    { variant = 'primary', size = 'lg', loading, icon, children, className = '', disabled, ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
          inline-flex items-center justify-center gap-2
          active:scale-[0.98] transition-all
          disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        `}
        {...rest}
      >
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  }
);
