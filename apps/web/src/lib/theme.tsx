import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'horizon-theme'

/** The prototype opens in dark mode. */
export const DEFAULT_THEME: Theme = 'dark'

type ThemeReader = { getItem: (key: string) => string | null } | undefined

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

export const readStoredTheme = (storage: ThemeReader): Theme => {
  const stored = storage?.getItem(THEME_STORAGE_KEY)
  return isTheme(stored) ? stored : DEFAULT_THEME
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
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)

  // The stored theme is only readable on the client, after hydration.
  useEffect(() => {
    setThemeState(readStoredTheme(globalThis.localStorage))
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
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
