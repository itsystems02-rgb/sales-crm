type Option = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;

  options: Option[];

  placeholder?: string;
  disabled?: boolean;
};

export default function Select({
  value,
  onChange,
  options,
  placeholder = 'اختر',
  disabled = false,
}: Props) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}>
      {/* Placeholder */}
      <option value="" disabled>
        {placeholder}
      </option>

      {/* Options */}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}