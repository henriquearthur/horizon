import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '~/components/shell/app-header'
import { initialsOf } from '~/lib/initials'
import { ThemeProvider } from '~/lib/theme'
import { renderWithRouter } from './router-harness'

const renderHeader = (props: Partial<React.ComponentProps<typeof AppHeader>> = {}) =>
  renderWithRouter(
    <ThemeProvider>
      <AppHeader userName={null} query="" onQueryChange={() => {}} {...props} />
    </ThemeProvider>,
  )

describe('initialsOf', () => {
  it('builds a monogram from the first two words', () => {
    expect(initialsOf('Camila Duarte')).toBe('CD')
    expect(initialsOf('ana beatriz de souza')).toBe('AB')
    expect(initialsOf('gitlab-agent')).toBe('G')
  })

  it('falls back to an em dash when nobody is known', () => {
    expect(initialsOf(null)).toBe('—')
    expect(initialsOf('   ')).toBe('—')
  })
})

describe('AppHeader', () => {
  it('shows the product name without the Conexão host', async () => {
    await renderHeader()
    expect(screen.getByText('Horizon')).toBeInTheDocument()
    expect(screen.queryByText(/gitlab/i)).not.toBeInTheDocument()
  })

  it('shows the user monogram', async () => {
    await renderHeader({ userName: 'Camila Duarte' })
    expect(screen.getByText('CD')).toBeInTheDocument()
  })

  it('reports what the user types in the global search', async () => {
    const onQueryChange = vi.fn()
    await renderHeader({ onQueryChange })
    const search = screen.getByRole('searchbox', { name: 'Buscar issues, projetos, discussões' })

    await userEvent.type(search, 'tf')

    expect(onQueryChange).toHaveBeenCalledWith('t')
    expect(onQueryChange).toHaveBeenCalledWith('f')
  })

  it('clears the controlled search without leaving stale text', async () => {
    const onQueryChange = vi.fn()
    await renderHeader({ query: 'antiga', onQueryChange })
    await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
    expect(onQueryChange).toHaveBeenLastCalledWith('')
  })

  it('opens and focuses the same global search with Command+K and Ctrl+K', async () => {
    await renderHeader()
    const search = screen.getByRole('searchbox', { name: 'Buscar issues, projetos, discussões' })
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(search).toHaveFocus()
    search.blur()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(search).toHaveFocus()
  })

  it('navigates through matching actions with the keyboard', async () => {
    const onNavigate = vi.fn()
    await renderHeader({ query: 'configurar', onNavigate })
    const search = screen.getByRole('searchbox', { name: 'Buscar issues, projetos, discussões' })
    await userEvent.click(search)
    expect(screen.getByRole('option', { name: /Configurar escopo/ })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'action', id: 'scope' })
  })

  it('offers the opposite theme on the toggle', async () => {
    await renderHeader()
    expect(screen.getByRole('button', { name: /tema escuro/i })).toHaveTextContent('Escuro')
  })

  it('lets the user choose and persist the accent color', async () => {
    await renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Escolher cor de destaque' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Roxo' }))
    expect(document.documentElement.dataset.accent).toBe('purple')
    expect(localStorage.getItem('horizon-accent')).toBe('purple')
  })
})
