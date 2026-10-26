import React from 'react';

export function PharmacyDataTable({ columns, className = '', minWidth, children }) {
  const alignments = Object.fromEntries(
    columns.map((column, index) => [`data-align-${index + 1}`, column.align || 'left'])
  );

  return (
    <div className="table-wrapper pharmacy-table-scroll">
      <table
        className={`pharmacy-data-table ${className}`.trim()}
        style={minWidth ? { minWidth } : undefined}
        {...alignments}
      >
        <colgroup>
          {columns.map((column, index) => (
            <col key={index} style={{ width: column.width }} />
          ))}
        </colgroup>
        {children}
      </table>
    </div>
  );
}

export function PharmacyTableSkeleton({ columns = 6, rows = 5 }) {
  const columnConfig = Array.from({ length: columns }, () => ({ width: `${100 / columns}%` }));

  return (
    <PharmacyDataTable columns={columnConfig}>
      <tbody aria-label="Loading pharmacy records">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <tr key={rowIndex} aria-hidden="true">
            {columnConfig.map((_, columnIndex) => (
              <td key={columnIndex}>
                <span className="pharmacy-table-skeleton" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </PharmacyDataTable>
  );
}

export default PharmacyDataTable;
