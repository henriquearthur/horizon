/** Two-letter monogram for an avatar, or an em dash when nobody is known. */
export const initialsOf = (name: string | null | undefined): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  return words
    .slice(0, 2)
    .map((word) => word[0]!)
    .join('')
    .toUpperCase()
}
