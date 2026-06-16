const ACCENT_VARIANTS: Record<string, string[]> = {
  a: ['a', 'á', 'à', 'â', 'ã'],
  e: ['e', 'é', 'ê'],
  i: ['i', 'í'],
  o: ['o', 'ó', 'ô', 'õ'],
  u: ['u', 'ú'],
  c: ['c', 'ç'],
}
const MAX_VARIANTS_PER_TOKEN = 64

export function getAccentInsensitiveSearchTokens(query: string | null | undefined): string[][] {
  return (query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(expandAccentVariants)
}

function expandAccentVariants(token: string): string[] {
  let variants = ['']

  for (const character of token.toLowerCase()) {
    const characterVariants = ACCENT_VARIANTS[character] || [character]
    const nextVariants = variants.flatMap((prefix) => (
      characterVariants.map((variant) => `${prefix}${variant}`)
    ))
    variants = nextVariants.slice(0, MAX_VARIANTS_PER_TOKEN)
  }

  return Array.from(new Set([token, ...variants]))
}
