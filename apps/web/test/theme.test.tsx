import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  readStoredTheme,
  THEME_STORAGE_KEY,
  themeBootstrapScript,
  ThemeProvider,
  useTheme,
} from '~/lib/theme'

describe('readStoredTheme', () => {
  it('reads a stored theme', () => {
    expect(readStoredTheme({ getItem: () => 'light' })).toBe('light')
  })

  it('falls back to the default for missing or unknown values', () => {
    expect(readStoredTheme({ getItem: () => null })).toBe(DEFAULT_THEME)
    expect(readStoredTheme({ getItem: () => 'sepia' })).toBe(DEFAULT_THEME)
    expect(readStoredTheme(undefined)).toBe(DEFAULT_THEME)
  })

  it('defaults to dark, like the prototype', () => {
    expect(DEFAULT_THEME).toBe('dark')
  })
})

describe('themeBootstrapScript', () => {
  it('reads the stored theme and sets the document attribute', () => {
    expect(themeBootstrapScript).toContain(THEME_STORAGE_KEY)
    expect(themeBootstrapScript).toContain('data-theme')
  })
})

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('applies the stored theme to the document on mount', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button')).toHaveTextContent('light')
  })

  it('toggles, applies and persists the theme', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(document.documentElement.dataset.theme).toBe('dark')

    await act(async () => {
      await user.click(screen.getByRole('button'))
    })

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(screen.getByRole('button')).toHaveTextContent('light')
  })
})
