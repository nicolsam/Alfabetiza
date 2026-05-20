import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindLevels } = vi.hoisted(() => ({
  mockFindLevels: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    assessmentLevel: { findMany: mockFindLevels },
  },
}))

import { GET } from '@/app/api/levels/route'

describe('API: /api/levels GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns reading levels ordered by level order', async () => {
    const levels = [
      { id: 'level-1', code: 'DNI', order: 1 },
      { id: 'level-2', code: 'LO', order: 2 },
    ]
    mockFindLevels.mockResolvedValue(levels)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(levels)
    expect(mockFindLevels).toHaveBeenCalledWith({
      where: {
        assessmentType: { code: 'READING' },
        isActive: true,
      },
      orderBy: { order: 'asc' },
    })
  })

  it('returns 500 when the database query fails', async () => {
    mockFindLevels.mockRejectedValue(new Error('DB failed'))

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal error')
  })
})
