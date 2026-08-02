import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/students/[id]/history/route'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    userSchool: { findUnique: vi.fn() },
    studentAssessment: { findMany: vi.fn() },
    studentCommentary: { findMany: vi.fn() },
  }
}))

vi.mock('@/lib/auth', () => ({
  verifyToken: vi.fn()
}))

describe('GET /api/students/[id]/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockUserAccess = (schools = [{ schoolId: 'school-1', role: 'TEACHER' }]) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'teacher-1',
      email: 'test@test.com',
      isGlobalAdmin: false,
      schools,
    } as never)
  }

  const mockRequest = () => ({
    headers: new Headers({ authorization: 'Bearer valid-token' }),
  } as Request)

  const mockNoAuthRequest = () => ({
    headers: new Headers({}),
  } as Request)

  it('should return 401 without token', async () => {
    const res = await GET(mockNoAuthRequest(), { params: Promise.resolve({ id: 'student-1' }) })
    expect(res.status).toBe(401)
  })

  it('should return 401 with invalid token', async () => {
    vi.mocked(verifyToken).mockReturnValue(null)
    const res = await GET(mockRequest(), { params: Promise.resolve({ id: 'student-1' }) })
    expect(res.status).toBe(401)
  })

  it('should return 404 if student not found', async () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'test@test.com' })
    mockUserAccess()
    vi.mocked(prisma.student.findUnique).mockResolvedValue(null)

    const res = await GET(mockRequest(), { params: Promise.resolve({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })

  it('should return 403 if teacher has no access to student school', async () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'test@test.com' })
    mockUserAccess([])
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: 'student-1', schoolId: 'school-1', class: {}, school: { id: 'school-1', name: 'Test' }
    } as never)
    vi.mocked(prisma.userSchool.findUnique).mockResolvedValue(null)

    const res = await GET(mockRequest(), { params: Promise.resolve({ id: 'student-1' }) })
    expect(res.status).toBe(403)
  })

  it('should return student with full history', async () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'test@test.com' })
    mockUserAccess()
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: 'student-1', name: 'John', studentNumber: '001', schoolId: 'school-1',
      class: { grade: '1º Ano', section: 'A', shift: 'Morning' },
      school: { id: 'school-1', name: 'Test School' }
    } as never)
    vi.mocked(prisma.userSchool.findUnique).mockResolvedValue({} as never)
    vi.mocked(prisma.studentAssessment.findMany).mockResolvedValue([
      {
        id: 'h1', referenceMonth: new Date(2026, 4, 1), notes: 'Good progress',
        assessmentLevelId: 'level-rw',
        assessmentLevel: { code: 'RW', name: 'Reads Words', order: 4 },
        user: { name: 'Teacher A' }
      },
      {
        id: 'h2', referenceMonth: new Date(2026, 3, 1), notes: null,
        assessmentLevelId: 'level-lo',
        assessmentLevel: { code: 'LO', name: 'Letters Only', order: 2 },
        user: { name: 'Teacher A' }
      },
    ] as never)
    vi.mocked(prisma.studentCommentary.findMany).mockResolvedValue([])

    const res = await GET(mockRequest(), { params: Promise.resolve({ id: 'student-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.student.name).toBe('John')
    expect(data.history).toHaveLength(2)
    expect(data.history[0].readingLevel.code).toBe('RW')
    expect(data.history[0].teacher.name).toBe('Teacher A')
    expect(data.history[1].notes).toBeNull()
  })

  it('should return empty history for student with no assessments', async () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'test@test.com' })
    mockUserAccess()
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: 'student-1', name: 'Jane', studentNumber: '002', schoolId: 'school-1',
      class: { grade: '2º Ano', section: 'B', shift: 'Afternoon' },
      school: { id: 'school-1', name: 'Test School' }
    } as never)
    vi.mocked(prisma.userSchool.findUnique).mockResolvedValue({} as never)
    vi.mocked(prisma.studentAssessment.findMany).mockResolvedValue([])
    vi.mocked(prisma.studentCommentary.findMany).mockResolvedValue([])

    const res = await GET(mockRequest(), { params: Promise.resolve({ id: 'student-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.student.name).toBe('Jane')
    expect(data.history).toHaveLength(0)
  })
})
