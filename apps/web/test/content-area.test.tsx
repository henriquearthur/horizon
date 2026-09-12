import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContentHeader } from '~/components/shell/content-header'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { decodeViewRef } from '@horizon/domain'
import { activeViewHeading } from '~/lib/view-heading'
import { renderWithRouter } from './router-harness'

describe('activeViewHeading', () => {
  it('describes a builtin View', () => {
    expect(activeViewHeading(decodeViewRef('all'))).toEqual({
      title: 'Todos os issues',
      subtitle: 'todos os grupos e subgrupos',
    })
  })

  it('describes a project View', () => {
    expect(activeViewHeading(decodeViewRef('project:infra/terraform-aws'))).toEqual({
      title: 'infra/terraform-aws',
      subtitle: 'projeto',
    })
  })

  it('describes a saved View', () => {
    expect(activeViewHeading(decodeViewRef('saved:v1')).subtitle).toBe('filtros salvos por você')
  })

  it('falls back to the Inbox for an unknown View', () => {
    expect(activeViewHeading(decodeViewRef('nope')).title).toBe('Inbox')
  })
})

describe('ContentHeader', () => {
  it('shows the View title and subtitle', async () => {
    await renderWithRouter(
      <ContentHeader title="Inbox" subtitle="precisa da sua atenção" mode="list" />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inbox')
    expect(screen.getByText('precisa da sua atenção')).toBeInTheDocument()
  })

  it('marks the current mode and links to the other one', async () => {
    await renderWithRouter(<ContentHeader title="Inbox" subtitle="" mode="list" />, {
      url: '/?view=all',
    })
    expect(screen.getByRole('link', { name: 'Lista' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Kanban' })).toHaveAttribute(
      'href',
      '/?view=all&mode=kanban',
    )
  })
})

describe('ContentToolbar', () => {
  it('omits the result count while there is no Issue data', async () => {
    await renderWithRouter(<ContentToolbar />)
    expect(screen.queryByText(/issues?$/)).not.toBeInTheDocument()
  })

  it('shows the result count when given one', async () => {
    await renderWithRouter(<ContentToolbar resultCount="12 issues" />)
    expect(screen.getByText('12 issues')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('renders its message', async () => {
    await renderWithRouter(<EmptyState>Nada aqui.</EmptyState>)
    expect(screen.getByText('Nada aqui.')).toBeInTheDocument()
  })
})
