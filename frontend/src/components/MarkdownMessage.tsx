import ReactMarkdown from 'react-markdown'

type Props = {
  text: string
  className?: string
}

/** Renders companion/assistant text as Markdown (bold, lists, links, etc.). */
export function MarkdownMessage({ text, className }: Props) {
  if (!text) return null
  return (
    <div className={className ? `md-body ${className}` : 'md-body'}>
      <ReactMarkdown
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
