type Props = {
  title?: string;
  children: React.ReactNode;
};

export default function Card({ title, children }: Props) {
  return (
    <div className="card">
      {title && <h3 className="card-title">{title}</h3>}
      {children}
    </div>
  );
}