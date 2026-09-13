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

  it('falls back to the default when storage access is blocked', () => {
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('The operation is insecure.')
        },
      }),
    ).toBe(DEFAULT_THEME)
  })

  it('defaults to light mode', () => {
    expect(DEFAULT_THEME).toBe('light')
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

  it('adopts the theme the bootstrap script already applied', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    document.documentElement.setAttribute('data-theme', 'light')
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button')).toHaveTextContent('light')
  })

  it('never repaints the default over the stored theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    document.documentElement.setAttribute('data-theme', 'light')

    const seen: (string | undefined)[] = []
    const observer = new MutationObserver(() => {
      seen.push(document.documentElement.dataset.theme)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    observer.disconnect()

    expect(seen).not.toContain('dark')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('toggles, applies and persists the theme', async () => {
    const user = userEvent.setup()
    document.documentElement.setAttribute('data-theme', 'light')
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(document.documentElement.dataset.theme).toBe('light')

    await act(async () => {
      await user.click(screen.getByRole('button'))
    })

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getByRole('button')).toHaveTextContent('dark')
  })
})
