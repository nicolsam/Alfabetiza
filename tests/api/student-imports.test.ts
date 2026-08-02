import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockVerifyToken,
  mockFindUser,
  mockFindClass,
  mockFindLevels,
  mockFindStudents,
  mockCreateStudents,
  mockCreateEnrollments,
  mockCreateAssessments,
  mockTransaction,
  mockLogAction,
} = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockFindUser: vi.fn(),
  mockFindClass: vi.fn(),
  mockFindLevels: vi.fn(),
  mockFindStudents: vi.fn(),
  mockCreateStudents: vi.fn(),
  mockCreateEnrollments: vi.fn(),
  mockCreateAssessments: vi.fn(),
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
    class: { findFirst: mockFindClass },
    assessmentLevel: { findMany: mockFindLevels },
    student: {
      findMany: mockFindStudents,
      createMany: mockCreateStudents,
    },
    studentEnrollment: { createMany: mockCreateEnrollments },
    studentAssessment: { createMany: mockCreateAssessments, upsert: mockCreateAssessments },
    $transaction: mockTransaction,
  },
}))

import { POST as commitImport } from '@/app/api/students/import/commit/route'

const readingLevels = [
  { id: 'level-rw', code: 'RW', name: 'Reads Words', assessmentTypeId: 'type-reading' },
  { id: 'level-rs', code: 'RS', name: 'Reads Sentences', assessmentTypeId: 'type-reading' },
]

function mockCoordinator() {
  mockVerifyToken.mockReturnValue({ id: 'user-1', email: 'coordinator@test.com' })
  mockFindUser.mockResolvedValue({
    id: 'user-1',
    email: 'coordinator@test.com',
    name: 'Coordinator',
    isGlobalAdmin: false,
    schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
  })
}

function createCommitRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/students/import/commit', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify({
      selectedClassId: 'class-1',
      months: ['02/2026', '03/2026'],
      ...body,
    }),
  })
}

describe('API: /api/students/import/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCoordinator()
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', academicYear: 2026, grade: '2' })
    mockFindLevels.mockResolvedValue(readingLevels)
    mockFindStudents.mockResolvedValue([])
    mockLogAction.mockResolvedValue(undefined)
    mockCreateAssessments.mockResolvedValue({ count: 1 })
    mockCreateEnrollments.mockResolvedValue({ count: 1 })
    mockCreateStudents.mockResolvedValue({ count: 1 })
    mockTransaction.mockImplementation(async (callback) => callback({
      student: { createMany: mockCreateStudents },
      studentEnrollment: { createMany: mockCreateEnrollments },
      studentAssessment: { createMany: mockCreateAssessments, upsert: mockCreateAssessments },
    }))
  })

  it('creates a new student and multiple month assessments', async () => {
    const response = await commitImport(createCommitRequest({
      rows: [
        {
          rowId: 'row-1',
          matricula: 'MAT-1',
          name: 'Ana',
          levelsByMonth: { '02/2026': 'RW', '03/2026': 'Lê Frases' },
        },
      ],
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toMatchObject({ importedRows: 1, importedCells: 2, createdStudents: 1 })
    expect(data.rows[0].studentId).toEqual(expect.any(String))
    expect(data.rows[0].cells[0].assessmentId).toEqual(expect.any(String))
    expect(data.rows[0].cells[1].assessmentId).toEqual(expect.any(String))
    expect(mockCreateStudents).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: data.rows[0].studentId,
          name: 'Ana',
          studentNumber: 'MAT-1',
          schoolId: 'school-1',
          classId: 'class-1',
        }),
      ],
    })
    expect(mockCreateEnrollments).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          studentId: data.rows[0].studentId,
          classId: 'class-1',
          startedAt: new Date(2026, 0, 1),
        }),
      ],
    })
    expect(mockCreateAssessments).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: data.rows[0].cells[0].assessmentId,
          studentId: data.rows[0].studentId,
          assessmentLevelId: 'level-rw',
          assessmentTypeId: 'type-reading',
          referenceMonth: new Date('2026-02-01T00:00:00.000Z'),
        }),
        expect.objectContaining({
          id: data.rows[0].cells[1].assessmentId,
          studentId: data.rows[0].studentId,
          assessmentLevelId: 'level-rs',
          referenceMonth: new Date('2026-03-01T00:00:00.000Z'),
        }),
      ],
    })
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 20000 })
  })

  it('creates multiple students and assessments with batch inserts', async () => {
    const response = await commitImport(createCommitRequest({
      rows: [
        { rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } },
        { rowId: 'row-2', matricula: 'MAT-2', name: 'Bia', levelsByMonth: { '03/2026': 'RS' } },
      ],
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toMatchObject({ importedRows: 2, importedCells: 2, createdStudents: 2 })
    expect(mockCreateStudents).toHaveBeenCalledTimes(1)
    expect(mockCreateStudents).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          name: 'Ana',
          studentNumber: 'MAT-1',
          schoolId: 'school-1',
          classId: 'class-1',
        }),
        expect.objectContaining({
          name: 'Bia',
          studentNumber: 'MAT-2',
          schoolId: 'school-1',
          classId: 'class-1',
        }),
      ]),
    })
    expect(mockCreateEnrollments).toHaveBeenCalledTimes(1)
    expect(mockCreateAssessments).toHaveBeenCalledTimes(1)
    expect(mockCreateAssessments).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ assessmentLevelId: 'level-rw' }),
        expect.objectContaining({ assessmentLevelId: 'level-rs' }),
      ]),
    })
  })

  it('reuses an existing student and appends assessments', async () => {
    mockFindStudents.mockResolvedValue([
      {
        id: 'student-existing',
        name: 'Ana',
        studentNumber: 'MAT-1',
        schoolId: 'school-1',
        enrollments: [{ id: 'enrollment-existing', classId: 'class-1' }],
      },
    ])

    const response = await commitImport(createCommitRequest({
      rows: [
        {
          rowId: 'row-1',
          matricula: 'MAT-1',
          name: 'Ana',
          levelsByMonth: { '02/2026': 'RW' },
        },
      ],
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toMatchObject({ importedRows: 1, importedCells: 1, reusedStudents: 1 })
    expect(data.rows[0].message).toContain('Existing student found')
    expect(mockCreateStudents).not.toHaveBeenCalled()
    expect(mockCreateEnrollments).not.toHaveBeenCalled()
    expect(mockCreateAssessments).toHaveBeenCalledWith({
      data: [expect.objectContaining({
          studentId: 'student-existing',
          enrollmentId: 'enrollment-existing',
      })],
    })
  })

  it('requires confirmation before replacing imported monthly levels', async () => {
    mockFindStudents.mockResolvedValue([{
      id: 'student-existing',
      name: 'Ana',
      studentNumber: 'MAT-1',
      schoolId: 'school-1',
      enrollments: [{ id: 'enrollment-existing', classId: 'class-1' }],
      assessments: [{
        id: 'assessment-existing',
        assessmentTypeId: 'type-reading',
        referenceMonth: new Date('2026-02-01T00:00:00.000Z'),
      }],
    }])
    const body = {
      months: ['02/2026'],
      rows: [{ rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } }],
    }

    const conflict = await commitImport(createCommitRequest(body))
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toMatchObject({ code: 'MONTH_ALREADY_RECORDED' })

    const confirmed = await commitImport(createCommitRequest({ ...body, confirmReplace: true }))
    expect(confirmed.status).toBe(200)
    expect(mockCreateAssessments).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ assessmentLevelId: 'level-rw' }),
    }))
  })

  it('creates an enrollment for an existing student without one in the selected class', async () => {
    mockFindStudents.mockResolvedValue([
      {
        id: 'student-existing',
        name: 'Ana',
        studentNumber: 'MAT-1',
        schoolId: 'school-1',
        enrollments: [],
      },
    ])

    const response = await commitImport(createCommitRequest({
      rows: [
        {
          rowId: 'row-1',
          matricula: 'MAT-1',
          name: 'Ana',
          levelsByMonth: { '02/2026': 'RW' },
        },
      ],
    }))

    expect(response.status).toBe(200)
    expect(mockCreateEnrollments).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          studentId: 'student-existing',
          classId: 'class-1',
          startedAt: new Date(2026, 0, 1),
        }),
      ],
    })
  })

  it('rejects import for teachers', async () => {
    mockFindUser.mockResolvedValue({
      id: 'user-1',
      email: 'teacher@test.com',
      name: 'Teacher',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'TEACHER' }],
    })

    const response = await commitImport(createCommitRequest({
      rows: [{ rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } }],
    }))

    expect(response.status).toBe(403)
    expect(mockCreateStudents).not.toHaveBeenCalled()
  })

  it('rejects requests without a selected class', async () => {
    const response = await commitImport(createCommitRequest({
      selectedClassId: '',
      rows: [{ rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } }],
    }))

    expect(response.status).toBe(400)
    expect(mockFindClass).not.toHaveBeenCalled()
  })

  it('reports missing class grade before creating initial assessments', async () => {
    mockFindClass.mockResolvedValue({ id: 'class-1', schoolId: 'school-1', academicYear: 2026, grade: '' })

    const response = await commitImport(createCommitRequest({
      rows: [{ rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } }],
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toMatchObject({ importedRows: 0, incompleteRows: 1 })
    expect(data.rows[0].message).toContain('Class grade is required')
    expect(mockCreateStudents).not.toHaveBeenCalled()
    expect(mockCreateAssessments).not.toHaveBeenCalled()
  })

  it('reports duplicate matrícula values in the submitted list', async () => {
    const response = await commitImport(createCommitRequest({
      rows: [
        { rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } },
        { rowId: 'row-2', matricula: 'mat-1', name: 'Bia', levelsByMonth: { '02/2026': 'RW' } },
      ],
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toMatchObject({ importedRows: 0, invalidRows: 2 })
    expect(data.rows[0].message).toContain('Duplicate matrícula')
    expect(data.rows[1].message).toContain('Duplicate matrícula')
    expect(mockCreateStudents).not.toHaveBeenCalled()
    expect(mockCreateAssessments).not.toHaveBeenCalled()
  })

  it('reports invalid month and level rows without importing them', async () => {
    const response = await commitImport(createCommitRequest({
      months: ['02/2026', '12/2026'],
      rows: [
        { rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'Unknown' } },
        { rowId: 'row-2', matricula: 'MAT-2', name: 'Bia', levelsByMonth: { '12/2026': 'RW' } },
      ],
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toMatchObject({ importedRows: 0, invalidRows: 2 })
    expect(mockCreateStudents).not.toHaveBeenCalled()
    expect(mockCreateAssessments).not.toHaveBeenCalled()
  })
})
