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

  it('offers the opposite theme on the toggle', async () => {
    await renderHeader()
    expect(screen.getByRole('button', { name: /tema claro/i })).toHaveTextContent('Claro')
  })

  it('lets the user choose and persist the accent color', async () => {
    await renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Escolher cor de destaque' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Roxo' }))
    expect(document.documentElement.dataset.accent).toBe('purple')
    expect(localStorage.getItem('horizon-accent')).toBe('purple')
  })
})
