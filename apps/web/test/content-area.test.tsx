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
    expect(activeViewHeading(decodeViewRef('general'))).toEqual({
      title: 'Geral',
      subtitle: 'issues de todo o Escopo',
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

  it('falls back to Geral for an unknown View', () => {
    expect(activeViewHeading(decodeViewRef('nope')).title).toBe('Geral')
  })
})

describe('ContentHeader', () => {
  it('shows the View title and subtitle', async () => {
    await renderWithRouter(
      <ContentHeader title="Geral" subtitle="issues de todo o Escopo" mode="list" />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Geral')
    expect(screen.getByText('issues de todo o Escopo')).toBeInTheDocument()
  })

  it('marks the current mode and links to the other one', async () => {
    await renderWithRouter(<ContentHeader title="Geral" subtitle="" mode="list" />, {
      url: '/',
    })
    expect(screen.getByRole('link', { name: 'Lista' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Kanban' })).toHaveAttribute('href', '/?mode=kanban')
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
