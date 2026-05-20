import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  mockVerifyToken,
  mockFindInvite,
  mockFindUser,
  mockCreateUser,
  mockUpdateInvite,
  mockDeleteInvite,
  mockTransaction,
  mockHashPassword,
} = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockFindInvite: vi.fn(),
  mockFindUser: vi.fn(),
  mockCreateUser: vi.fn(),
  mockUpdateInvite: vi.fn(),
  mockDeleteInvite: vi.fn(),
  mockTransaction: vi.fn(),
  mockHashPassword: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  verifyToken: mockVerifyToken,
  hashPassword: mockHashPassword,
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    userInvite: {
      findUnique: mockFindInvite,
      delete: mockDeleteInvite,
    },
    user: {
      findUnique: mockFindUser,
    },
    $transaction: mockTransaction,
  },
}))

import { DELETE, POST } from '@/app/api/invites/[token]/route'

function createRequest(body: unknown) {
  return new Request('https://aleno.test/api/invites/invite-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createDeleteRequest() {
  return new Request('https://aleno.test/api/invites/invite-1', {
    method: 'DELETE',
    headers: { authorization: 'Bearer valid-token' },
  })
}

function createInvite() {
  return {
    id: 'invite-1',
    name: 'Teacher',
    email: 'teacher@test.com',
    role: 'TEACHER',
    schoolId: 'school-1',
    acceptedAt: null,
    expiresAt: new Date('2099-05-01T00:00:00.000Z'),
    school: { id: 'school-1', name: 'School 1' },
  }
}

describe('API: /api/invites/[token] POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockHashPassword.mockResolvedValue('hashed-password')
    mockFindUser.mockResolvedValue(null)
    mockCreateUser.mockResolvedValue({ id: 'user-1', name: 'Teacher', email: 'teacher@test.com' })
    mockUpdateInvite.mockResolvedValue({})
    mockTransaction.mockImplementation(async (callback) => callback({
      user: { create: mockCreateUser },
      userInvite: { update: mockUpdateInvite },
    }))
  })

  it('requires invited users to choose a gender before accepting', async () => {
    const response = await POST(createRequest({ password: 'password123' }), {
      params: Promise.resolve({ token: 'invite-token' }),
    })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Gender is required')
    expect(mockFindInvite).not.toHaveBeenCalled()
  })

  it('stores gender on the user created from the invitation link', async () => {
    mockFindInvite.mockResolvedValue(createInvite())

    const response = await POST(createRequest({ password: 'password123', gender: 'FEMALE' }), {
      params: Promise.resolve({ token: 'invite-token' }),
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.user.email).toBe('teacher@test.com')
    expect(mockCreateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Teacher',
        email: 'teacher@test.com',
        password: 'hashed-password',
        gender: 'FEMALE',
      }),
    })
  })
})

describe('API: /api/invites/[token] DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockVerifyToken.mockReturnValue({ id: 'coordinator-1', email: 'coordinator@test.com' })
    mockFindUser.mockResolvedValue({
      id: 'coordinator-1',
      email: 'coordinator@test.com',
      name: 'Coordinator',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
    })
    mockDeleteInvite.mockResolvedValue({})
  })

  it('prevents coordinators from deleting coordinator invites', async () => {
    mockFindInvite.mockResolvedValue({ ...createInvite(), role: 'COORDINATOR' })

    const response = await DELETE(createDeleteRequest(), {
      params: Promise.resolve({ token: 'invite-1' }),
    })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
    expect(mockDeleteInvite).not.toHaveBeenCalled()
  })

  it('allows coordinators to delete same-school teacher invites', async () => {
    mockFindInvite.mockResolvedValue(createInvite())

    const response = await DELETE(createDeleteRequest(), {
      params: Promise.resolve({ token: 'invite-1' }),
    })

    expect(response.status).toBe(200)
    expect(mockDeleteInvite).toHaveBeenCalledWith({ where: { id: 'invite-1' } })
  })
})
