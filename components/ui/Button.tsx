import React from 'react';

type ButtonVariant = 'primary' | 'danger' | 'secondary' | 'ghost';

type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  className?: string;
};

export default function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`
        btn
        ${variant === 'danger' ? 'btn-danger' : ''}
        ${variant === 'secondary' ? 'btn-secondary' : ''}
        ${variant === 'ghost' ? 'btn-ghost' : ''}
        ${className}
      `}
    >
      {loading ? '...' : children}
    </button>
  );
}