import { vi } from 'vitest'

// Mock Prisma Client
export const mockPrisma = {
  $transaction: vi.fn(),
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  school: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  userSchool: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  student: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  studentContact: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  studentParentReportLink: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  assessmentType: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  assessmentLevel: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  studentAssessment: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
}

mockPrisma.$transaction.mockImplementation((callback: (transaction: typeof mockPrisma) => unknown) => callback(mockPrisma))

// Mock the db module
vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}))

// Mock auth module
vi.mock('@/lib/auth', () => ({
  hashPassword: vi.fn().mockImplementation((password: string) => Promise.resolve(`hashed_${password}`)),
  verifyPassword: vi.fn().mockImplementation((password: string, hash: string) => Promise.resolve(password === 'test123' || hash.startsWith('hashed_'))),
  generateToken: vi.fn().mockImplementation(() => 'mock.jwt.token'),
  verifyToken: vi.fn().mockImplementation((token: string) => {
    if (token === 'mock.jwt.token') {
      return { id: 'teacher-1', email: 'test@test.com' }
    }
    if (token === 'valid-token') {
      return { id: 'teacher-1', email: 'test@test.com' }
    }
    return null
  }),
}))

export default mockPrisma
