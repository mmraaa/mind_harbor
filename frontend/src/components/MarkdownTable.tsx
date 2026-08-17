import { MarkdownMessage } from './MarkdownMessage'

export function MarkdownTable({ markdown }: { markdown: string }) {
  if (!markdown) return null
  return (
    <div className="table-wrap">
      <MarkdownMessage text={markdown} className="md-body--table" />
    </div>
  )
}
