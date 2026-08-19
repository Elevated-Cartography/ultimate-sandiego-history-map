import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Annotation bodies are authored in-repo, but they still land in the DOM as HTML —
// sanitising keeps a bad paste or a stray PR from turning into script execution.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function renderMarkdown(source: string): string {
  const html = marked.parse(source ?? '', { async: false, gfm: true, breaks: true })
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}
