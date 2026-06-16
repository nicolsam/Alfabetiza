import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/classes/route'
import { PUT } from '@/app/api/classes/[id]/route'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userSchool: { findUnique: vi.fn(), findMany: vi.fn() },
    class: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() }
  }
}))

vi.mock('@/lib/auth', () => ({
  verifyToken: vi.fn()
}))

vi.mock('@/lib/audit', () => ({
  logAction: vi.fn()
}))

describe('Classes API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockRequest = (body?: unknown) => ({
    headers: new Headers({ authorization: 'Bearer valid-token', 'x-forwarded-for': '127.0.0.1' }),
    json: async () => body
  } as unknown as Request)

  const mockAccess = () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'test@example.com' })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'teacher-1',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
    } as never)
    vi.mocked(prisma.userSchool.findUnique).mockResolvedValue({} as never)
  }

  it('GET returns only academic years that exist in accessible classes', async () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'test@example.com' })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'teacher-1',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'TEACHER' }],
    } as never)
    vi.mocked(prisma.userSchool.findMany).mockResolvedValue([{ schoolId: 'school-1' }] as never)
    vi.mocked(prisma.class.findMany)
      .mockResolvedValueOnce([
        { academicYear: 2026 },
        { academicYear: 2025 },
        { academicYear: 2025 },
      ] as never)
      .mockResolvedValueOnce([
        { id: 'class-1', academicYear: 2026 },
      ] as never)

    const response = await GET(new Request('http://localhost/api/classes?academicYear=2026', {
      headers: { authorization: 'Bearer valid-token' },
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.academicYears).toEqual([2026, 2025])
    expect(data.classes).toEqual([{ id: 'class-1', academicYear: 2026 }])
    expect(prisma.class.count).not.toHaveBeenCalled()
  })

  it('GET paginates and searches classes when pagination params are present', async () => {
    vi.mocked(verifyToken).mockReturnValue({ id: 'teacher-1', email: 'test@example.com' })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'teacher-1',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
    } as never)
    vi.mocked(prisma.userSchool.findMany).mockResolvedValue([{ schoolId: 'school-1' }] as never)
    vi.mocked(prisma.class.findMany)
      .mockResolvedValueOnce([{ academicYear: 2026 }] as never)
      .mockResolvedValueOnce([{ id: 'class-1', grade: '1º Ano', section: 'A', academicYear: 2026 }] as never)
    vi.mocked(prisma.class.count).mockResolvedValue(41 as never)

    const response = await GET(new Request('http://localhost/api/classes?page=2&pageSize=40&q=1%C2%BA', {
      headers: { authorization: 'Bearer valid-token' },
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.pagination).toMatchObject({
      page: 2,
      pageSize: 40,
      totalItems: 41,
      totalPages: 2,
    })
    expect(prisma.class.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ grade: expect.objectContaining({ contains: '1º' }) }),
            ]),
          }),
        ]),
      }),
    })
    expect(prisma.class.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      skip: 40,
      take: 40,
      where: expect.objectContaining({ AND: expect.any(Array) }),
    }))
  })

  it('POST should create a class if valid', async () => {
    mockAccess()
    vi.mocked(prisma.class.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.class.create).mockResolvedValue({ id: 'class-1', grade: '1º Ano', academicYear: 2026 } as never)

    const res = await POST(mockRequest({ grade: '1º Ano', section: 'A', shift: 'Morning', schoolId: 'school-1', academicYear: 2026 }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.class.id).toBe('class-1')
    expect(prisma.class.findUnique).toHaveBeenCalledWith({
      where: {
        schoolId_grade_section_shift_academicYear: {
          schoolId: 'school-1',
          grade: '1º Ano',
          section: 'A',
          shift: 'Morning',
          academicYear: 2026,
        },
      },
    })
    expect(prisma.class.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ academicYear: 2026 }),
    }))
  })

  it('POST should reject invalid shift', async () => {
    mockAccess()

    const res = await POST(mockRequest({ grade: '1º Ano', section: 'A', shift: 'InvalidShift', schoolId: 'school-1' }))
    expect(res.status).toBe(400)
  })

  it('POST should reject invalid grade', async () => {
    mockAccess()

    const res = await POST(mockRequest({ grade: 'InvalidGrade', section: 'A', shift: 'Morning', schoolId: 'school-1' }))
    expect(res.status).toBe(400)
  })

  it('PUT should update class details', async () => {
    mockAccess()
    vi.mocked(prisma.class.findUnique).mockResolvedValue({ id: 'class-1', schoolId: 'school-1' } as never)
    vi.mocked(prisma.class.update).mockResolvedValue({ id: 'class-1', grade: '2º Ano' } as never)

    const res = await PUT(mockRequest({ grade: '2º Ano', section: 'B', shift: 'Afternoon', academicYear: 2026 }), { params: Promise.resolve({ id: 'class-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.class.grade).toBe('2º Ano')
    expect(prisma.class.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ academicYear: 2026 }),
    }))
  })
})
