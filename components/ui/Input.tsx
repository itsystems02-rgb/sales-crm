import React from 'react';

type Props = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  placeholder?: string;
  type?: string;

  /** إضافات احترافية */
  label?: string;
  name?: string;
  disabled?: boolean;
  autoComplete?: string;
  error?: string;
  className?: string;
};

export default function Input({
  value,
  onChange,
  placeholder,
  type = 'text',

  label,
  name,
  disabled = false,
  autoComplete,
  error,
  className = '',
}: Props) {
  return (
    <div className={`input-wrapper ${className}`}>
      {label && <label className="input-label">{label}</label>}

      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        name={name}
        disabled={disabled}
        autoComplete={autoComplete}
        className={error ? 'input-error' : ''}
      />

      {error && <div className="input-error-text">{error}</div>}
    </div>
  );
}