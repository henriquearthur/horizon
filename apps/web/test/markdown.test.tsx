import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Markdown } from '~/components/ui/markdown'

describe('Markdown', () => {
  it('links plain issue references inside Horizon', () => {
    const onIssueSelect = vi.fn()
    render(
      <Markdown issueHref={(iid) => `/?issue=7:${iid}`} onIssueSelect={onIssueSelect}>
        Relacionado a #193.
      </Markdown>,
    )
    const link = screen.getByRole('link', { name: '#193' })
    expect(link).toHaveAttribute('href', '/?issue=7:193')
    expect(link).not.toHaveAttribute('target')

    link.click()

    expect(onIssueSelect).toHaveBeenCalledWith(193)
  })

  it('does not rewrite references inside inline code', () => {
    render(<Markdown issueHref={(iid) => `/?issue=7:${iid}`}>{'Use `#193` no exemplo.'}</Markdown>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
