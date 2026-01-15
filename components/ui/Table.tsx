type Props = {
  headers: string[];
  children: React.ReactNode;
};

export default function Table({ headers, children }: Props) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}