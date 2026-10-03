import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/utils/cn'

type MarkdownAnswerProps = {
  children: string
  className?: string
}

/**
 * Render jawaban agent yang berupa markdown.
 *
 * `react-markdown` mengubah AST markdown menjadi React element, bukan
 * `dangerouslySetInnerHTML`, jadi tidak ada kebutuhan sanitizer HTML
 * terpisah. Markdown mentah dari model juga tidak dieksekusi sebagai HTML.
 *
 * Override komponen di bawah memakai token desain yang sudah ada
 * (`font-headline-*`, `text-text-*`, `surface-container-low`) supaya
 * jawaban tidak terlihat seperti konten luar aplikasi.
 */
export function MarkdownAnswer({ children, className }: MarkdownAnswerProps) {
  return (
    <div className={cn('min-w-0 break-words', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: nodes }) => (
            <h1 className="font-headline-lg text-headline-lg text-text-primary mt-4 mb-2 first:mt-0">
              {nodes}
            </h1>
          ),
          h2: ({ children: nodes }) => (
            <h2 className="font-headline-md text-headline-md text-text-primary mt-4 mb-2 first:mt-0">
              {nodes}
            </h2>
          ),
          h3: ({ children: nodes }) => (
            <h3 className="font-headline-sm text-headline-sm text-text-primary mt-3 mb-1.5 first:mt-0">
              {nodes}
            </h3>
          ),
          p: ({ children: nodes }) => (
            <p className="font-body-md text-body-md text-text-primary leading-relaxed my-2 first:mt-0 last:mb-0">
              {nodes}
            </p>
          ),
          ul: ({ children: nodes }) => (
            <ul className="my-2 space-y-1 pl-5 list-disc marker:text-text-secondary">
              {nodes}
            </ul>
          ),
          ol: ({ children: nodes }) => (
            <ol className="my-2 space-y-1 pl-5 list-decimal marker:text-text-secondary">
              {nodes}
            </ol>
          ),
          li: ({ children: nodes }) => (
            <li className="font-body-md text-body-md text-text-primary leading-relaxed marker:text-text-secondary">
              {nodes}
            </li>
          ),
          strong: ({ children: nodes }) => (
            <strong className="font-semibold text-text-primary">{nodes}</strong>
          ),
          em: ({ children: nodes }) => <em className="italic">{nodes}</em>,
          a: ({ children: nodes, href }) => (
            <a
              href={href}
              target="_blank"
              // `noopener` mencegah tab baru memegang handle window ini.
              rel="noopener noreferrer"
              className="text-secondary underline underline-offset-2 hover:no-underline transition-colors break-all"
            >
              {nodes}
            </a>
          ),
          code: ({ children: nodes, className: codeClass }) => {
            // Kode blok selalu dibungkus <pre>, jadi gaya khusus hanya
            // perlu untuk kode inline yang berdiri sendiri.
            const isBlock = typeof codeClass === 'string' && codeClass.includes('language-')
            if (isBlock) return <code className={codeClass}>{nodes}</code>
            return (
              <code className="rounded-md bg-surface-container-low px-1.5 py-0.5 font-body-sm text-body-sm text-text-primary">
                {nodes}
              </code>
            )
          },
          pre: ({ children: nodes }) => (
            <pre className="my-3 overflow-x-auto rounded-xl border border-border-subtle bg-surface-container-low p-3">
              {nodes}
            </pre>
          ),
          blockquote: ({ children: nodes }) => (
            <blockquote className="my-3 border-l-2 border-border-subtle pl-3 text-text-secondary">
              {nodes}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border-subtle" />,
          table: ({ children: nodes }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-left font-body-sm text-body-sm">
                {nodes}
              </table>
            </div>
          ),
          th: ({ children: nodes }) => (
            <th className="border border-border-subtle bg-surface-container-low px-2.5 py-1.5 font-semibold text-text-primary">
              {nodes}
            </th>
          ),
          td: ({ children: nodes }) => (
            <td className="border border-border-subtle px-2.5 py-1.5 text-text-primary">
              {nodes}
            </td>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
