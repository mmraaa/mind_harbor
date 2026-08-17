export function formatCell(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return String(value)
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function rowsToMarkdownTable(headers: string[], rows: Record<string, unknown>[]): string {
  const head = `| ${headers.map((h) => escapeMdCell(h)).join(' | ')} |`
  const sep = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map(
    (row) => `| ${headers.map((h) => escapeMdCell(formatCell(row[h]))).join(' | ')} |`,
  )
  return [head, sep, ...body].join('\n')
}

export function rowsToMarkdownTableFromObjects(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  return rowsToMarkdownTable(Object.keys(rows[0]), rows)
}
