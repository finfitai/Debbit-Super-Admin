// =============================================================================
// PostgREST returns at most 1,000 rows per request (the project's max-rows
// setting), no matter what .limit() asks for. A plain select on a table that has
// grown past that silently drops the rest — wrong counts, missing rows. Anything
// that must see EVERY row goes through here: it pulls pages until a short page
// comes back.
// =============================================================================
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
  maxRows = 50000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: rows, error }
    const got = data ?? []
    rows.push(...got)
    if (got.length < pageSize) break
  }
  return { data: rows, error: null }
}
