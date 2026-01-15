type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
};

export default function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={variant === 'danger' ? 'btn-danger' : ''}
    >
      {children}
    </button>
  );
}