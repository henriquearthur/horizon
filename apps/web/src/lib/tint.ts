import type { CSSProperties } from 'react'

/**
 * Deterministic colour for the things Horizon shows many of — labels, people,
 * groups. Two rules: a name always gets the same hue, and hues are drawn from
 * a spread palette so neighbouring chips never look like the same colour.
 *
 * Hues that carry meaning elsewhere (red for P1, amber for Em andamento, green
 * for Concluído, teal for the accent) are left out of the palette, so a label
 * can never impersonate a Status.
 */
const CURATED_HUES: Readonly<Record<string, number>> = {
  incident: 22,
  bug: 22,
  security: 8,
  terraform: 274,
  kubernetes: 258,
  ci: 172,
  observability: 225,
  'needs-review': 92,
  'tech-debt': 300,
  agent: 325,
  networking: 240,
  cost: 128,
  runbook: 285,
  documentation: 210,
  feature: 165,
  enhancement: 165,
}

const PALETTE = [8, 22, 45, 92, 128, 165, 185, 210, 225, 240, 258, 274, 300, 325, 345] as const

const hash = (value: string): number => {
  let result = 0
  for (let index = 0; index < value.length; index += 1)
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  return result
}

/** The hue a given name is always painted with. */
export const hueFor = (value: string): number =>
  CURATED_HUES[value] ?? PALETTE[hash(value) % PALETTE.length]!

/** Inline custom properties consumed by the `tint-surface` utility. */
export const tintStyle = (value: string, chroma?: number): CSSProperties =>
  ({
    '--tint-hue': String(hueFor(value)),
    ...(chroma === undefined ? {} : { '--tint-chroma': String(chroma) }),
  }) as CSSProperties
