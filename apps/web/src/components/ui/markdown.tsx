import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '~/lib/utils'

/**
 * Issue descriptions and comments arrive from the Provider as GitLab Flavoured
 * Markdown. Raw HTML is deliberately not enabled, so nothing a Provider sends
 * can inject markup into Horizon.
 */
const baseComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-4 mb-2 text-[15px] font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 mb-2 text-[14px] font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3.5 mb-1.5 text-[13px] font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1.5 text-[12.5px] font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-muted-foreground">{children}</del>,
  ul: ({ children, className }) => (
    <ul
      className={cn(
        'my-2 list-disc space-y-1 pl-5',
        className?.includes('contains-task-list') && 'list-none pl-0',
        className,
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children, className }) => (
    <li
      className={cn(
        'marker:text-muted-foreground',
        className?.includes('task-list-item') && 'list-none',
        className,
      )}
    >
      {children}
    </li>
  ),
  input: ({ checked, type }) =>
    type === 'checkbox' ? (
      <span
        aria-hidden
        className={cn(
          'mr-1.5 inline-flex size-3.5 translate-y-0.5 items-center justify-center rounded-[4px] border align-text-top text-[9px] leading-none',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input text-transparent',
        )}
      >
        ✓
      </span>
    ) : null,
  blockquote: ({ children }) => (
    <blockquote className="my-2.5 border-l-2 border-primary/40 pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  code: ({ children, className }) =>
    /language-/.test(className ?? '') ? (
      <code className={cn('font-mono text-[11.5px] leading-relaxed', className)}>{children}</code>
    ) : (
      <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-2.5 overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b px-2.5 py-1.5 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b px-2.5 py-1.5 last:border-0">{children}</td>,
  img: () => null,
}

/** `#123` inside Horizon opens the panel in place instead of reloading the app. */
const issueLinkComponents = (onIssueSelect: (iid: number) => void): Components => ({
  ...baseComponents,
  a: ({ children, href }) => {
    const reference = /^\/\?.*issue=\d+%3A(\d+)|^\/\?.*issue=\d+:(\d+)/.exec(href ?? '')
    const iid = Number(reference?.[1] ?? reference?.[2])
    if (!Number.isInteger(iid))
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {children}
        </a>
      )
    return (
      <a
        href={href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          onIssueSelect(iid)
        }}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        {children}
      </a>
    )
  },
})

export function Markdown({
  children,
  className,
  empty = 'Sem descrição.',
  issueHref,
  onIssueSelect,
}: {
  readonly children: string | null | undefined
  readonly className?: string
  /** Shown instead of the document when there is nothing to render. */
  readonly empty?: string
  /** Turns plain `#123` references into links to issues in Horizon. */
  readonly issueHref?: (iid: number) => string
  /** Opens a `#123` reference inside Horizon, without leaving the page. */
  readonly onIssueSelect?: ((iid: number) => void) | undefined
}) {
  const source = (children ?? '').trim()
  if (!source) return <p className={cn('text-muted-foreground', className)}>{empty}</p>
  return (
    <div className={cn('[text-wrap:pretty]', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...(issueHref ? [remarkIssueReferences(issueHref)] : [])]}
        components={onIssueSelect ? issueLinkComponents(onIssueSelect) : baseComponents}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

const remarkIssueReferences = (hrefFor: (iid: number) => string) => () => (tree: any) => {
  const visit = (node: any) => {
    if (
      !Array.isArray(node.children) ||
      node.type === 'link' ||
      node.type === 'code' ||
      node.type === 'inlineCode'
    )
      return
    node.children = node.children.flatMap((child: any) => {
      if (child.type !== 'text') {
        visit(child)
        return [child]
      }
      const parts: any[] = []
      const pattern = /(^|[\s(])#(\d+)\b/g
      let cursor = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(child.value)) !== null) {
        const prefixEnd = match.index + (match[1] ?? '').length
        if (prefixEnd > cursor)
          parts.push({ type: 'text', value: child.value.slice(cursor, prefixEnd) })
        const label = `#${match[2]}`
        parts.push({
          type: 'link',
          url: hrefFor(Number(match[2])),
          children: [{ type: 'text', value: label }],
        })
        cursor = pattern.lastIndex
      }
      if (!parts.length) return [child]
      if (cursor < child.value.length)
        parts.push({ type: 'text', value: child.value.slice(cursor) })
      return parts
    })
  }
  visit(tree)
}
