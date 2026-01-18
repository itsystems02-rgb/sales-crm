type Props = {
  headers: string[];
  children: React.ReactNode;

  /** لو عايز أول عمود sticky */
  stickyFirst?: boolean;

  /** لو عايز آخر عمود sticky */
  stickyLast?: boolean;
};

export default function Table({
  headers,
  children,
  stickyFirst = false,
  stickyLast = false,
}: Props) {
  return (
    <div className="units-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => {
              const isFirst = i === 0 && stickyFirst;
              const isLast = i === headers.length - 1 && stickyLast;

              return (
                <th
                  key={h}
                  className={`${isFirst ? 'sticky-left' : ''} ${
                    isLast ? 'sticky-right' : ''
                  }`}
                >
                  {h}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {/* الأطفال بيتحكموا في data-label */}
          {children}
        </tbody>
      </table>
    </div>
  );
}