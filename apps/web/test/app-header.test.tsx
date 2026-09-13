import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppHeader } from '~/components/shell/app-header'
import { initialsOf } from '~/lib/initials'
import { ThemeProvider } from '~/lib/theme'
import { renderWithRouter } from './router-harness'

const renderHeader = (props: Partial<React.ComponentProps<typeof AppHeader>> = {}) =>
  renderWithRouter(
    <ThemeProvider>
      <AppHeader userName={null} {...props} />
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

  it('no longer carries a global search field or command palette', async () => {
    await renderHeader()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
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
