import { useText } from '../i18n'

export function FilePagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPage,
  onPageSize,
}: {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const { text } = useText()

  return (
    <nav className="file-pagination" aria-label={text('pagination')}>
      <span>{text('itemCount', { count: totalItems })}</span>
      <label>
        <span>{text('perPage')}</span>
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </label>
      <div>
        <button
          className="secondary-button"
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {text('previous')}
        </button>
        <span>{text('pageCount', { page, total: totalPages })}</span>
        <button
          className="secondary-button"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          {text('next')}
        </button>
      </div>
    </nav>
  )
}
