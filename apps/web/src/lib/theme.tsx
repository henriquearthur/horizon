import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'horizon-theme'

/** The prototype opens in dark mode. */
export const DEFAULT_THEME: Theme = 'dark'

type ThemeReader = { getItem: (key: string) => string | null } | undefined

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

/**
 * Reads the persisted theme, falling back to the default. Browsers throw on
 * storage access when cookies are blocked, so the whole read is guarded:
 * reaching `localStorage` can fail before `getItem` is ever called.
 */
export const readStoredTheme = (storage?: ThemeReader): Theme => {
  try {
    const stored = (storage ?? globalThis.localStorage)?.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Runs before hydration so the document never paints with the wrong theme.
 * Kept in sync with `readStoredTheme` by the tests in `test/theme.test.tsx`.
 */
export const themeBootstrapScript = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');document.documentElement.setAttribute('data-theme',t==='light'||t==='dark'?t:'${DEFAULT_THEME}')}catch(e){}`

export interface ThemeContextValue {
  readonly theme: Theme
  readonly setTheme: (theme: Theme) => void
  readonly toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server-rendered markup cannot know the stored theme, so it starts at the
  // default and the effect below catches up once the client takes over.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)

  // `themeBootstrapScript` already put the stored theme on the document before
  // paint; this only brings React's state in line with it. Writing the
  // attribute here instead would repaint the default first.
  useEffect(() => {
    setThemeState(readStoredTheme())
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private browsing or a full storage quota must not break the toggle.
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside a ThemeProvider')
  return value
}
