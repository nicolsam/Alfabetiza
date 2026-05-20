import { vi } from 'vitest'
import { NextResponse } from 'next/server'

// Mock Prisma Client - functions only (not the actual Prisma)
export const mockTeacher = {
  findUnique: vi.fn(),
  create: vi.fn(),
}

export const mockSchool = {
  findMany: vi.fn(),
  create: vi.fn(),
}

export const mockUserSchool = {
  findMany: vi.fn(),
  create: vi.fn(),
}

export const mockStudent = {
  findMany: vi.fn(),
  create: vi.fn(),
}

export const mockAssessmentLevel = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}

export const mockStudentAssessment = {
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
}

export const mockPrisma = {
  teacher: mockTeacher,
  school: mockSchool,
  userSchool: mockUserSchool,
  student: mockStudent,
  assessmentLevel: mockAssessmentLevel,
  studentAssessment: mockStudentAssessment,
}

// Reset all mocks
export function resetMocks() {
  type ResettableMock = {
    mockReset: () => void
    mockResolvedValue: (value: unknown) => void
  }
  const mocks: Record<string, ResettableMock>[] = [
    mockTeacher,
    mockSchool,
    mockUserSchool,
    mockStudent,
    mockAssessmentLevel,
    mockStudentAssessment,
  ]

  mocks.forEach(model => {
    Object.keys(model).forEach((key: string) => {
      const fn = model[key]
      if (typeof fn.mockReset === 'function') {
        fn.mockReset()
        fn.mockResolvedValue(undefined)
      }
    })
  })
}

// Helper to create NextResponse for comparisons
export { NextResponse }

// Re-export commonly used vitest functions
export { expect, describe, it, beforeEach, vi } from 'vitest'
