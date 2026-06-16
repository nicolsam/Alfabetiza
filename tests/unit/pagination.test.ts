import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  buildPaginationMeta,
  hasNamedPaginationParams,
  hasPaginationParams,
  parseNamedPaginationParams,
  parsePaginationParams,
} from '@/lib/pagination'

describe('pagination helpers', () => {
  it('parses valid pagination params', () => {
    const params = parsePaginationParams(new URLSearchParams('page=3&pageSize=40'))

    expect(params).toEqual({
      page: 3,
      pageSize: 40,
      skip: 80,
      take: 40,
    })
  })

  it('falls back for invalid page and page size values', () => {
    const params = parsePaginationParams(new URLSearchParams('page=-5&pageSize=999'))

    expect(params).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    })
  })

  it('detects default and named pagination params', () => {
    expect(hasPaginationParams(new URLSearchParams('page=1'))).toBe(true)
    expect(hasPaginationParams(new URLSearchParams('q=ana'))).toBe(false)
    expect(hasNamedPaginationParams(new URLSearchParams('usersPage=2'), 'usersPage', 'usersPageSize')).toBe(true)
    expect(hasNamedPaginationParams(new URLSearchParams('page=2'), 'usersPage', 'usersPageSize')).toBe(false)
  })

  it('parses named pagination params', () => {
    const params = parseNamedPaginationParams(
      new URLSearchParams('invitesPage=2&invitesPageSize=60'),
      'invitesPage',
      'invitesPageSize'
    )

    expect(params).toMatchObject({ page: 2, pageSize: 60, skip: 60, take: 60 })
  })

  it('builds metadata for empty and out-of-range pages', () => {
    expect(buildPaginationMeta({ page: 1, pageSize: 30, totalItems: 0 })).toEqual({
      page: 1,
      pageSize: 30,
      totalItems: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    })

    expect(buildPaginationMeta({ page: 99, pageSize: 30, totalItems: 61 })).toMatchObject({
      page: 3,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    })
  })
})
