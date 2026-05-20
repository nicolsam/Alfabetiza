import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { mockVerifyAdmin, mockCountSchool, mockCountStudent, mockCountHistory, mockCountSession } = vi.hoisted(() => ({
  mockVerifyAdmin: vi.fn(),
  mockCountSchool: vi.fn(),
  mockCountStudent: vi.fn(),
  mockCountHistory: vi.fn(),
  mockCountSession: vi.fn(),
}))

vi.mock('@/lib/admin', () => ({
  verifyAdmin: mockVerifyAdmin,
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    school: { count: mockCountSchool },
    student: { count: mockCountStudent },
    studentAssessment: { count: mockCountHistory },
    userSession: { count: mockCountSession },
  },
}))

import { GET as getAdminStats } from '../../src/app/api/admin/stats/route'

describe('API: /api/admin/stats GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should return unauthorized/forbidden if verifyAdmin fails', async () => {
    mockVerifyAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })

    const request = new Request('http://localhost/api/admin/stats')
    const response = await getAdminStats(request)
    
    expect(response.status).toBe(403)
  })

  it('should return correct stats on success', async () => {
    mockVerifyAdmin.mockResolvedValue({ payload: { id: 'admin-1' } })
    mockCountSchool.mockResolvedValue(5)
    mockCountStudent.mockResolvedValue(100)
    mockCountHistory.mockResolvedValue(250)
    mockCountSession.mockResolvedValue(10)

    const request = new Request('http://localhost/api/admin/stats')
    const response = await getAdminStats(request)
    
    expect(response.status).toBe(200)
    const data = await response.json()
    
    expect(data.stats).toEqual({
      totalSchools: 5,
      totalStudents: 100,
      totalAssessments: 250,
      activeSessions: 10
    })
  })

  it('should return 500 if database query fails', async () => {
    mockVerifyAdmin.mockResolvedValue({ payload: { id: 'admin-1' } })
    mockCountSchool.mockRejectedValue(new Error('DB timeout'))

    const request = new Request('http://localhost/api/admin/stats')
    const response = await getAdminStats(request)
    
    expect(response.status).toBe(500)
  })
})
