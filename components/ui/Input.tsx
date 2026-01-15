type Props = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
};

export default function Input({ value, onChange, placeholder, type = 'text' }: Props) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} />;
}