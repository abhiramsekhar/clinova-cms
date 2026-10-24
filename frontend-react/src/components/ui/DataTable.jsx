import React, { useState, useMemo } from 'react';
import Icon from '../Icon';

export function DataTable({
  columns = [],
  data = [],
  isLoading = false,
  emptyTitle = 'No records found',
  emptyMessage,
  emptyAction,
  emptyIcon = 'icon-search',
  perPage = 10,
  defaultSort = null,
  searchPlaceholder = 'Search records...',
  showSearch = false,
  onRowClick,
}) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState(defaultSort);
  const [sortAsc, setSortAsc] = useState(true);

  // Filtered by local search if showSearch
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.render ? col.render(row) : row[col.key];
        return String(val ?? '').replace(/<[^>]+>/g, '').toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortKey, sortAsc]);

  // Paginated data
  const totalPages = Math.max(1, Math.ceil(sortedData.length / perPage));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedData = useMemo(() => {
    const start = (activePage - 1) * perPage;
    return sortedData.slice(start, start + perPage);
  }, [sortedData, activePage, perPage]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="datatable-wrapper">
      {showSearch && (
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="search-bar" style={{ maxWidth: '320px', flex: 1 }}>
            <span className="search-bar__icon">
              <Icon name="icon-search" size={16} />
            </span>
            <input
              type="text"
              className="search-bar__input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
            />
            {search && (
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: 0 }}
              >
                <Icon name="icon-x" size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col, idx) => (
                  <th key={idx} style={{ width: col.width }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(Math.min(perPage, 5))].map((_, i) => (
                <tr key={i}>
                  {columns.map((_, j) => (
                    <td key={j}>
                      <div
                        className="skeleton"
                        style={{
                          height: '20px',
                          width: `${40 + ((i + j) % 4) * 15}%`,
                          borderRadius: '4px',
                          background: 'var(--hover-bg, rgba(255,255,255,0.06))',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : sortedData.length === 0 ? (
        <div className="empty-state" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <div className="empty-state__icon" style={{ marginBottom: '1rem', color: 'var(--muted)' }}>
            <Icon name={emptyIcon} size={40} />
          </div>
          <div className="empty-state__title" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
            {emptyTitle}
          </div>
          {emptyMessage && (
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{emptyMessage}</p>
          )}
          {emptyAction && <div style={{ marginTop: '1.25rem' }}>{emptyAction}</div>}
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((col, idx) => (
                    <th
                      key={idx}
                      style={{
                        width: col.width,
                        cursor: col.sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span>{col.label}</span>
                        {col.sortable && sortKey === col.key && (
                          <Icon name={sortAsc ? 'icon-chevron-up' : 'icon-chevron-down'} size={14} />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, rowIdx) => (
                  <tr
                    key={row.id || rowIdx}
                    onClick={() => onRowClick?.(row)}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    {columns.map((col, colIdx) => (
                      <td key={colIdx}>
                        {col.render ? col.render(row) : (row[col.key] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 0.5rem',
                fontSize: '0.875rem',
                color: 'var(--muted)',
                marginTop: '0.5rem',
              }}
            >
              <span>
                Showing {(activePage - 1) * perPage + 1} to{' '}
                {Math.min(activePage * perPage, sortedData.length)} of {sortedData.length} entries
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={activePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {activePage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={activePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default DataTable;
