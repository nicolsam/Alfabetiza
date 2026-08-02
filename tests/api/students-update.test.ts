import { describe, it, expect, beforeEach, vi } from 'vitest'

// Use vi.hoisted to define mocks at the right time
const { mockCreateHistory, mockUpsertHistory, mockFindExisting, mockFindReadingLevel, mockFindStudent, mockFindUser, mockFindUserSchool, mockVerifyToken } = vi.hoisted(() => ({
  mockCreateHistory: vi.fn(),
  mockUpsertHistory: vi.fn(),
  mockFindExisting: vi.fn(),
  mockFindReadingLevel: vi.fn(),
  mockFindStudent: vi.fn(),
  mockFindUser: vi.fn(),
  mockFindUserSchool: vi.fn(),
  mockVerifyToken: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    studentAssessment: { create: mockCreateHistory, findUnique: mockFindExisting, upsert: mockUpsertHistory },
    user: { findUnique: mockFindUser },
    school: { findMany: vi.fn() },
    userSchool: { findMany: vi.fn(), findUnique: mockFindUserSchool },
    student: { findMany: vi.fn(), findUnique: mockFindStudent },
    assessmentLevel: { findMany: vi.fn(), findFirst: mockFindReadingLevel },
  },
}))

vi.mock('@/lib/auth', () => ({
  verifyToken: mockVerifyToken,
}))

import { PATCH as UpdateReadingLevel } from '@/app/api/students/update/route'

describe('API: /api/students/update PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockVerifyToken.mockImplementation((token: string) => {
      if (token && token.startsWith('valid-')) {
        return { id: 'teacher-123', email: 'teacher@test.com' }
      }
      return null
    })
    mockFindUserSchool.mockResolvedValue({ userId: 'teacher-123', schoolId: 'school-1' })
    mockFindUser.mockResolvedValue({
      id: 'teacher-123',
      email: 'teacher@test.com',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'TEACHER' }],
    })
    mockFindStudent.mockResolvedValue({
      id: 'student-123',
      schoolId: 'school-1',
      enrollments: [{
        id: 'enrollment-2026',
        startedAt: new Date(2026, 0, 1),
        endedAt: null,
        deletedAt: null,
        class: { academicYear: 2026 },
      }],
    })
    mockFindReadingLevel.mockResolvedValue({
      id: 'level-123',
      assessmentTypeId: 'assessment-type-reading',
      assessmentType: { id: 'assessment-type-reading', code: 'READING' },
    })
    mockFindExisting.mockResolvedValue(null)
  })

  // Test 1: No token
  it('should return 401 when no token provided', async () => {
    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ studentId: 's1', readingLevelId: 'l1' }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')
  })

  // Test 2: Invalid token
  it('should return 401 for invalid token', async () => {
    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { 
        authorization: 'Bearer bad-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ studentId: 's1', readingLevelId: 'l1' }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(401)
  })

  // Test 3: Missing studentId
  it('should return 400 when studentId is missing', async () => {
    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { 
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ readingLevelId: 'level-1' }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Missing fields')
  })

  // Test 4: Missing readingLevelId  
  it('should return 400 when readingLevelId is missing', async () => {
    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { 
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ studentId: 'student-1' }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(400)
  })

  // Test 5: Empty readingLevelId (the bug case!)
  it('should return 400 when readingLevelId is empty string', async () => {
    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { 
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ studentId: 'student-1', readingLevelId: '' }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Missing fields')
  })

  // Test 6: Success case
  it('should return 200 with valid data', async () => {
    mockCreateHistory.mockResolvedValue({ 
      id: 'history-1', 
      studentId: 'student-123', 
      assessmentLevelId: 'level-123',
      userId: 'teacher-123',
      referenceMonth: new Date('2026-04-01T00:00:00.000Z'),
      notes: 'Good progress',
      assessmentLevel: { id: 'level-123', code: 'RW', order: 4 },
    })

    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { 
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ 
        studentId: 'student-123', 
        readingLevelId: 'level-123',
        notes: 'Good progress',
        referenceMonth: '04/2026',
      }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.history).toBeDefined()
    expect(data.history.id).toBe('history-1')
    expect(mockCreateHistory).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        studentId: 'student-123',
        enrollmentId: 'enrollment-2026',
        assessmentTypeId: 'assessment-type-reading',
        assessmentLevelId: 'level-123',
        referenceMonth: new Date('2026-04-01T00:00:00.000Z'),
      }),
    }))
  })

  it('should reject levels outside the reading assessment type', async () => {
    mockFindReadingLevel.mockResolvedValue(null)

    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        studentId: 'student-123',
        readingLevelId: 'writing-level-123',
        referenceMonth: '04/2026',
      }),
    })

    const response = await UpdateReadingLevel(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid reading level')
    expect(mockCreateHistory).not.toHaveBeenCalled()
  })

  it('requires confirmation before replacing an existing monthly level', async () => {
    mockFindExisting.mockResolvedValue({
      id: 'existing-assessment',
      assessmentLevelId: 'old-level',
      referenceMonth: new Date(2026, 3, 1),
      assessmentLevel: { id: 'old-level', code: 'SO' },
    })

    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        studentId: 'student-123',
        readingLevelId: 'level-123',
        referenceMonth: '04/2026',
      }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'MONTH_ALREADY_RECORDED' })
    expect(mockUpsertHistory).not.toHaveBeenCalled()
    expect(mockCreateHistory).not.toHaveBeenCalled()
  })

  it('should reject future assessment dates', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 10))

    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        studentId: 'student-123',
        readingLevelId: 'level-123',
        referenceMonth: '05/2026',
      }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Future reference months are not allowed')
    expect(mockCreateHistory).not.toHaveBeenCalled()
  })

  it('should reject dates without a matching enrollment year', async () => {
    mockFindStudent.mockResolvedValue({
      id: 'student-123',
      schoolId: 'school-1',
      enrollments: [{
        id: 'enrollment-2026',
        startedAt: new Date(2026, 0, 1),
        endedAt: null,
        deletedAt: null,
        class: { academicYear: 2026 },
      }],
    })

    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        studentId: 'student-123',
        readingLevelId: 'level-123',
        referenceMonth: '04/2025',
      }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('No enrollment found')
    expect(mockCreateHistory).not.toHaveBeenCalled()
  })

  // Test 7: DB failure
  it('should return 500 when database fails', async () => {
    mockCreateHistory.mockRejectedValue(new Error('DB connection failed'))

    const request = new Request('http://localhost/api/students/update', {
      method: 'PATCH',
      headers: { 
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ 
        studentId: 'student-123', 
        readingLevelId: 'level-123',
        referenceMonth: '04/2026',
      }),
    })

    const response = await UpdateReadingLevel(request)
    expect(response.status).toBe(500)
  })
})
