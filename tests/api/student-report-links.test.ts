import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/students/[id]/report-link/route'
import { DELETE } from '@/app/api/students/[id]/report-links/route'
import { getStudentParentReportByToken } from '@/lib/student-parent-reports'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    studentParentReportLink: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    studentAssessment: { findMany: vi.fn() },
    studentCommentary: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({
  verifyToken: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  logAction: vi.fn(),
}))

describe('student report links API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const request = () => ({
    url: 'https://alfabetiza.test/api/students/student-1/report-link',
    headers: new Headers({ authorization: 'Bearer valid-token' }),
  } as Request)

  function mockAccess(schools = [{ schoolId: 'school-1', role: 'TEACHER' }]) {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'teacher@test.com' })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'teacher-1',
      email: 'teacher@test.com',
      name: 'Teacher',
      isGlobalAdmin: false,
      schools,
    } as never)
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: 'student-1',
      name: 'Ana',
      schoolId: 'school-1',
      school: { id: 'school-1', name: 'Escola Teste', deletedAt: null },
    } as never)
  }

  it('creates a 30-day report link for an accessible student', async () => {
    mockAccess()
    const expiresAt = new Date('2026-06-02T12:00:00.000Z')
    vi.mocked(prisma.studentParentReportLink.create).mockResolvedValue({
      id: 'report-link-1',
      expiresAt,
    } as never)

    const res = await POST(request(), { params: Promise.resolve({ id: 'student-1' }) })
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.reportLink.url).toMatch(/^https:\/\/alfabetiza.test\/reports\/students\/.+/)
    expect(data.shareText).toContain('Ana')
    expect(prisma.studentParentReportLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'student-1',
        createdById: 'teacher-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    })
  })

  it('does not create a report link without school access', async () => {
    mockAccess([])

    const res = await POST(request(), { params: Promise.resolve({ id: 'student-1' }) })

    expect(res.status).toBe(403)
    expect(prisma.studentParentReportLink.create).not.toHaveBeenCalled()
  })

  it('revokes active report links for an accessible student', async () => {
    mockAccess()
    vi.mocked(prisma.studentParentReportLink.updateMany).mockResolvedValue({ count: 2 } as never)

    const res = await DELETE(request(), { params: Promise.resolve({ id: 'student-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.revokedCount).toBe(2)
    expect(prisma.studentParentReportLink.updateMany).toHaveBeenCalledWith({
      where: { studentId: 'student-1', revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { revokedAt: expect.any(Date) },
    })
  })
})

describe('public student parent reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for expired report links', async () => {
    vi.mocked(prisma.studentParentReportLink.findUnique).mockResolvedValue({
      id: 'report-link-1',
      studentId: 'student-1',
      expiresAt: new Date('2026-05-02T12:00:00.000Z'),
      revokedAt: null,
      student: {
        deletedAt: null,
        school: { deletedAt: null },
        class: { deletedAt: null },
      },
    } as never)

    await expect(getStudentParentReportByToken('token', new Date('2026-05-03T12:00:00.000Z'))).resolves.toBeNull()
    expect(prisma.studentAssessment.findMany).not.toHaveBeenCalled()
  })

  it('returns live student history for valid report links', async () => {
    vi.mocked(prisma.studentParentReportLink.findUnique).mockResolvedValue({
      id: 'report-link-1',
      studentId: 'student-1',
      expiresAt: new Date('2026-06-02T12:00:00.000Z'),
      revokedAt: null,
      student: {
        id: 'student-1',
        name: 'Ana',
        studentNumber: '001',
        deletedAt: null,
        school: { name: 'Escola Teste', deletedAt: null },
        class: {
          grade: '1º Ano',
          section: 'A',
          shift: 'Morning',
          academicYear: 2026,
          deletedAt: null,
        },
      },
    } as never)
    vi.mocked(prisma.studentParentReportLink.update).mockResolvedValue({} as never)
    vi.mocked(prisma.studentAssessment.findMany).mockResolvedValue([
      {
        id: 'history-1',
        referenceMonth: new Date(2026, 4, 1),
        notes: 'Good progress',
        assessmentLevel: { code: 'RW', name: 'Reads Words', order: 4 },
        user: { name: 'Teacher' },
      },
    ] as never)
    vi.mocked(prisma.studentCommentary.findMany).mockResolvedValue([] as never)

    const report = await getStudentParentReportByToken('token', new Date('2026-05-03T12:00:00.000Z'))

    expect(report?.student.name).toBe('Ana')
    expect(report?.history[0].teacher.name).toBe('Teacher')
    expect(prisma.studentParentReportLink.update).toHaveBeenCalledWith({
      where: { id: 'report-link-1' },
      data: { lastViewedAt: new Date('2026-05-03T12:00:00.000Z') },
    })
  })
})
