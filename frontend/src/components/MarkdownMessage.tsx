import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  text: string
  className?: string
}

/** Renders companion/assistant text as Markdown (bold, lists, links, GFM tables, etc.). */
export function MarkdownMessage({ text, className }: Props) {
  if (!text) return null
  return (
    <div className={className ? `md-body ${className}` : 'md-body'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
