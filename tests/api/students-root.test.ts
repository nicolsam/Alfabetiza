import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockVerifyToken,
  mockFindUser,
  mockFindUserSchools,
  mockFindUserSchool,
  mockFindStudents,
  mockCountStudents,
  mockFindClass,
  mockFindStudent,
  mockCreateStudent,
  mockTransaction,
  mockLogAction,
} = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockFindUser: vi.fn(),
  mockFindUserSchools: vi.fn(),
  mockFindUserSchool: vi.fn(),
  mockFindStudents: vi.fn(),
  mockCountStudents: vi.fn(),
  mockFindClass: vi.fn(),
  mockFindStudent: vi.fn(),
  mockCreateStudent: vi.fn(),
  mockTransaction: vi.fn(),
  mockLogAction: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  verifyToken: mockVerifyToken,
}))

vi.mock('@/lib/audit', () => ({
  logAction: mockLogAction,
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mockFindUser },
    userSchool: {
      findMany: mockFindUserSchools,
      findUnique: mockFindUserSchool,
    },
    student: {
      findMany: mockFindStudents,
      count: mockCountStudents,
      findUnique: mockFindStudent,
      create: mockCreateStudent,
    },
    class: { findUnique: mockFindClass },
    $transaction: mockTransaction,
  },
}))

import { GET, POST } from '@/app/api/students/route'

function createRequest(url: string, body?: unknown, token = 'valid-token') {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('API: /api/students', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockVerifyToken.mockReturnValue({ id: 'teacher-1', email: 'teacher@test.com' })
    mockFindUser.mockResolvedValue({
      id: 'teacher-1',
      email: 'teacher@test.com',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
    })
    mockFindUserSchools.mockResolvedValue([{ schoolId: 'school-1' }])
    mockFindUserSchool.mockResolvedValue({ userId: 'teacher-1', schoolId: 'school-1' })
    mockTransaction.mockImplementation(async (callback) => callback({ student: { create: mockCreateStudent } }))
    mockLogAction.mockResolvedValue(undefined)
  })

  it('GET lists visible students with optional class filters', async () => {
    const students = [{ id: 'student-1', name: 'Student 1' }]
    mockFindStudents.mockResolvedValue(students)

    const response = await GET(createRequest(
      'http://localhost/api/students?schoolId=school-1&grade=1%C2%BA%20Ano&section=A&shift=Morning'
    ))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.students).toEqual([
      expect.objectContaining({
        id: students[0].id,
        name: students[0].name,
        monthlyUpdateStatus: 'missing',
        latestAssessmentMonth: null,
      }),
    ])
    expect(mockFindUserSchool).not.toHaveBeenCalled()
    expect(mockFindStudents).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        assessments: expect.objectContaining({
          where: expect.anything(),
        }),
      }),
      where: expect.objectContaining({
        schoolId: { in: ['school-1'] },
        deletedAt: null,
        enrollments: expect.objectContaining({
          some: expect.objectContaining({
            class: expect.objectContaining({
              grade: '1º Ano',
              section: 'A',
              shift: 'Morning',
            }),
          }),
        }),
      }),
    }))
    expect(mockCountStudents).not.toHaveBeenCalled()
  })

  it('GET paginates and searches visible students when pagination params are present', async () => {
    const students = [{ id: 'student-1', name: 'Ana Student', assessments: [] }]
    mockCountStudents.mockResolvedValue(61)
    mockFindStudents.mockResolvedValue(students)

    const response = await GET(createRequest('http://localhost/api/students?page=2&pageSize=30&q=Ana'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.students).toHaveLength(1)
    expect(data.pagination).toMatchObject({
      page: 2,
      pageSize: 30,
      totalItems: 61,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    })
    expect(mockCountStudents).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'Ana' }) }),
              expect.objectContaining({ studentNumber: expect.objectContaining({ contains: 'Ana' }) }),
            ]),
          }),
        ]),
      }),
    })
    expect(mockFindStudents).toHaveBeenCalledWith(expect.objectContaining({
      skip: 30,
      take: 30,
    }))
  })

  it('GET marks students with monthly update status for the selected month', async () => {
    mockFindStudents.mockResolvedValue([
      {
        id: 'student-1',
        name: 'Student 1',
        assessments: [{ id: 'history-1', assessmentLevelId: 'level-1', assessmentLevel: {}, referenceMonth: new Date(2026, 3, 1) }],
      },
      {
        id: 'student-2',
        name: 'Student 2',
        assessments: [{ id: 'history-2', assessmentLevelId: 'level-2', assessmentLevel: {}, referenceMonth: new Date(2026, 2, 1) }],
      },
      { id: 'student-3', name: 'Student 3', assessments: [] },
    ])

    const response = await GET(createRequest('http://localhost/api/students?month=04/2026'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.students).toMatchObject([
      {
        id: 'student-1',
        monthlyUpdateStatus: 'updated',
        monthStatus: expect.stringMatching(/current|past/),
        selectedMonth: '04/2026',
        latestAssessmentMonth: '04/2026',
      },
      {
        id: 'student-2',
        monthlyUpdateStatus: 'missing',
        monthStatus: expect.stringMatching(/current|past/),
        selectedMonth: '04/2026',
        latestAssessmentMonth: '03/2026',
      },
      {
        id: 'student-3',
        monthlyUpdateStatus: 'missing',
        monthStatus: expect.stringMatching(/current|past/),
        selectedMonth: '04/2026',
        latestAssessmentMonth: null,
      },
    ])
  })

  it('GET returns 401 for invalid tokens', async () => {
    mockVerifyToken.mockReturnValue(null)

    const response = await GET(createRequest('http://localhost/api/students', undefined, 'bad-token'))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Invalid token')
    expect(mockFindStudents).not.toHaveBeenCalled()
  })

  it('POST creates a student in an accessible class', async () => {
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', academicYear: 2026 })
    mockFindStudent.mockResolvedValue(null)
    mockCreateStudent.mockResolvedValue({ id: 'student-1', name: 'Student 1', classId: 'class-1' })

    const response = await POST(createRequest('http://localhost/api/students', {
      name: 'Student 1',
      studentNumber: '123',
      classId: 'class-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.student.id).toBe('student-1')
    expect(mockCreateStudent).toHaveBeenCalledWith({
      data: {
        name: 'Student 1',
        studentNumber: '123',
        schoolId: 'school-1',
        classId: 'class-1',
        enrollments: {
          create: {
            classId: 'class-1',
            startedAt: new Date(2026, 0, 1),
          },
        },
        contacts: undefined,
      },
      include: {
        class: true,
        contacts: true,
        enrollments: {
          include: { class: true },
        },
      },
    })
    expect(mockLogAction).toHaveBeenCalledWith(
      'teacher-1',
      'CREATE_STUDENT',
      { studentId: 'student-1', name: 'Student 1' },
      '127.0.0.1'
    )
  })

  it('POST creates a student with normalized parent contacts', async () => {
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', academicYear: 2026 })
    mockFindStudent.mockResolvedValue(null)
    mockCreateStudent.mockResolvedValue({
      id: 'student-1',
      name: 'Student 1',
      classId: 'class-1',
      contacts: [{ id: 'contact-1', isPrimary: true }],
    })

    const response = await POST(createRequest('http://localhost/api/students', {
      name: 'Student 1',
      studentNumber: '123',
      classId: 'class-1',
      contacts: [
        { name: 'Maria', relationship: 'MOTHER', phone: '(85) 99999-0000' },
        { name: 'Jose', relationship: 'FATHER', phone: '(85) 3333-4444' },
      ],
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.student.id).toBe('student-1')
    expect(mockCreateStudent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        contacts: {
          create: [
            {
              name: 'Maria',
              relationship: 'MOTHER',
              phone: '(85) 99999-0000',
              whatsappPhone: '5585999990000',
              isPrimary: true,
            },
            {
              name: 'Jose',
              relationship: 'FATHER',
              phone: '(85) 3333-4444',
              whatsappPhone: '558533334444',
              isPrimary: false,
            },
          ],
        },
      }),
    }))
  })

  it('POST rejects invalid parent contacts', async () => {
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', academicYear: 2026 })
    mockFindStudent.mockResolvedValue(null)

    const response = await POST(createRequest('http://localhost/api/students', {
      name: 'Student 1',
      studentNumber: '123',
      classId: 'class-1',
      contacts: [{ name: 'Maria', relationship: '', phone: '(85) 99999-0000' }],
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Invalid contact relationship')
    expect(mockCreateStudent).not.toHaveBeenCalled()
  })

  it('POST rejects contact creation for non-coordinator teachers', async () => {
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', academicYear: 2026 })
    mockFindUser.mockResolvedValue({
      id: 'teacher-1',
      email: 'teacher@test.com',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'TEACHER' }],
    })

    const response = await POST(createRequest('http://localhost/api/students', {
      name: 'Student 1',
      studentNumber: '123',
      classId: 'class-1',
      contacts: [{ name: 'Maria', relationship: 'MOTHER', phone: '(85) 99999-0000' }],
    }))

    expect(response.status).toBe(403)
    expect(mockCreateStudent).not.toHaveBeenCalled()
  })

  it('POST rejects missing required fields', async () => {
    const response = await POST(createRequest('http://localhost/api/students', {
      name: 'Student 1',
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Missing required fields')
    expect(mockCreateStudent).not.toHaveBeenCalled()
  })

  it('POST rejects duplicate student numbers in the same school', async () => {
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', academicYear: 2026 })
    mockFindStudent.mockResolvedValue({ id: 'existing-student' })

    const response = await POST(createRequest('http://localhost/api/students', {
      name: 'Student 1',
      studentNumber: '123',
      classId: 'class-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Student number exists')
    expect(mockCreateStudent).not.toHaveBeenCalled()
  })

  it('POST rejects classes outside the teacher school access', async () => {
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-2', academicYear: 2026 })
    mockFindUser.mockResolvedValue({
      id: 'teacher-1',
      email: 'teacher@test.com',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
    })

    const response = await POST(createRequest('http://localhost/api/students', {
      name: 'Student 1',
      studentNumber: '123',
      classId: 'class-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
    expect(mockCreateStudent).not.toHaveBeenCalled()
  })
})
