type AdminPaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  label?: string;
};

export function AdminPagination({ total, page, pageSize, onPageChange, label = "records" }: AdminPaginationProps) {
  if (total <= pageSize) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  return (
    <nav className="ops-pagination" aria-label={`Page navigation for ${label}`}>
      <span aria-live="polite">Showing {start}–{end} of {total} {label}</span>
      <div>
        <button type="button" className="admin-secondary-button" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>Previous</button>
        <span>Page {current} of {pages}</span>
        <button type="button" className="admin-secondary-button" disabled={current >= pages} onClick={() => onPageChange(current + 1)}>Next</button>
      </div>
    </nav>
  );
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
