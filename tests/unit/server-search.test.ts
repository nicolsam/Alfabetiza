import { describe, expect, it } from 'vitest'
import { getAccentInsensitiveSearchTokens } from '@/lib/server-search'

describe('server search helpers', () => {
  it('expands Portuguese accent variants per search token', () => {
    const tokens = getAccentInsensitiveSearchTokens('sao search')

    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toContain('sao')
    expect(tokens[0]).toContain('são')
    expect(tokens[1]).toContain('search')
  })
})
