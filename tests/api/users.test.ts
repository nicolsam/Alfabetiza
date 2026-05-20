import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  mockVerifyToken,
  mockFindAuthUser,
  mockFindUsers,
  mockFindInvites,
  mockFindSchool,
  mockFindExistingInvite,
  mockCreateInvite,
  mockUpdateUser,
  mockCreateUserSchool,
  mockLogAction,
} = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockFindAuthUser: vi.fn(),
  mockFindUsers: vi.fn(),
  mockFindInvites: vi.fn(),
  mockFindSchool: vi.fn(),
  mockFindExistingInvite: vi.fn(),
  mockCreateInvite: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockCreateUserSchool: vi.fn(),
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
    user: {
      findUnique: mockFindAuthUser,
      findMany: mockFindUsers,
      update: mockUpdateUser,
    },
    userInvite: {
      findMany: mockFindInvites,
      findFirst: mockFindExistingInvite,
      create: mockCreateInvite,
    },
    userSchool: {
      create: mockCreateUserSchool,
    },
    school: {
      findFirst: mockFindSchool,
    },
  },
}))

import { GET, POST } from '@/app/api/users/route'
import { PATCH } from '@/app/api/users/[id]/route'

function createRequest(path = '/api/users', body?: unknown) {
  return new Request(`https://aleno.test${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockCoordinatorAuth() {
  mockVerifyToken.mockReturnValue({ id: 'coordinator-1', email: 'coordinator@test.com' })
  mockFindAuthUser.mockResolvedValueOnce({
    id: 'coordinator-1',
    email: 'coordinator@test.com',
    name: 'Coordinator',
    isGlobalAdmin: false,
    schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
  })
}

function mockGlobalAdminAuth() {
  mockVerifyToken.mockReturnValue({ id: 'admin-1', email: 'admin@test.com' })
  mockFindAuthUser.mockResolvedValueOnce({
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Admin',
    isGlobalAdmin: true,
    schools: [],
  })
}

describe('API: /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLogAction.mockResolvedValue(undefined)
  })

  it('returns pending invitation links when the stored token is available', async () => {
    mockCoordinatorAuth()
    mockFindUsers.mockResolvedValue([])
    mockFindInvites.mockResolvedValue([
      {
        id: 'invite-1',
        name: 'Teacher',
        email: 'teacher@test.com',
        role: 'TEACHER',
        schoolId: 'school-1',
        school: { id: 'school-1', name: 'School 1' },
        token: 'invite-token',
        expiresAt: new Date('2026-05-08T00:00:00.000Z'),
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ])

    const response = await GET(createRequest('/api/users?schoolId=school-1'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.invites[0].inviteLink).toBe('https://aleno.test/invite/invite-token')
  })

  it('filters admin user lists to teachers when role=TEACHER', async () => {
    mockGlobalAdminAuth()
    mockFindUsers.mockResolvedValue([
      {
        id: 'teacher-1',
        name: 'Teacher',
        email: 'teacher@test.com',
        isGlobalAdmin: false,
        schools: [{
          schoolId: 'school-1',
          role: 'TEACHER',
          school: { id: 'school-1', name: 'School 1' },
        }],
      },
    ])
    mockFindInvites.mockResolvedValue([])

    const response = await GET(createRequest('/api/users?role=TEACHER'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.users).toHaveLength(1)
    expect(data.users[0].schools[0].role).toBe('TEACHER')
    expect(mockFindUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        schools: expect.objectContaining({
          some: expect.objectContaining({ role: { in: ['TEACHER'] } }),
        }),
      }),
    }))
  })

  it('filters admin user lists to coordinators when role=COORDINATOR', async () => {
    mockGlobalAdminAuth()
    mockFindUsers.mockResolvedValue([
      {
        id: 'coordinator-2',
        name: 'Coordinator',
        email: 'coordinator2@test.com',
        gender: 'FEMALE',
        isGlobalAdmin: false,
        schools: [{
          schoolId: 'school-1',
          role: 'COORDINATOR',
          school: { id: 'school-1', name: 'School 1' },
        }],
      },
    ])
    mockFindInvites.mockResolvedValue([])

    const response = await GET(createRequest('/api/users?role=COORDINATOR'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.users).toHaveLength(1)
    expect(data.users[0].gender).toBe('FEMALE')
    expect(data.users[0].schools[0].role).toBe('COORDINATOR')
    expect(mockFindUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        schools: expect.objectContaining({
          some: expect.objectContaining({ role: { in: ['COORDINATOR'] } }),
        }),
      }),
    }))
  })

  it('rejects invalid role filters', async () => {
    mockGlobalAdminAuth()

    const response = await GET(createRequest('/api/users?role=ADMIN'))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid role')
    expect(mockFindUsers).not.toHaveBeenCalled()
    expect(mockFindInvites).not.toHaveBeenCalled()
  })

  it('lets coordinators list same-school coordinators with role=COORDINATOR', async () => {
    mockCoordinatorAuth()
    mockFindUsers.mockResolvedValue([
      {
        id: 'coordinator-1',
        name: 'Coordinator',
        email: 'coordinator@test.com',
        isGlobalAdmin: false,
        schools: [{
          schoolId: 'school-1',
          role: 'COORDINATOR',
          school: { id: 'school-1', name: 'School 1' },
        }],
      },
    ])
    mockFindInvites.mockResolvedValue([])

    const response = await GET(createRequest('/api/users?role=COORDINATOR'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.users[0].email).toBe('coordinator@test.com')
    expect(mockFindUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        schools: expect.objectContaining({
          some: expect.objectContaining({
            schoolId: 'school-1',
            role: { in: ['COORDINATOR'] },
          }),
        }),
      }),
    }))
  })

  it('ignores requested school when coordinators list coordinators', async () => {
    mockCoordinatorAuth()
    mockFindUsers.mockResolvedValue([])
    mockFindInvites.mockResolvedValue([])

    const response = await GET(createRequest('/api/users?role=COORDINATOR&schoolId=school-2'))

    expect(response.status).toBe(200)
    expect(mockFindUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        schools: expect.objectContaining({
          some: expect.objectContaining({ schoolId: 'school-1' }),
        }),
      }),
    }))
  })

  it('stores the invite token so pending invitations can show their links later', async () => {
    mockCoordinatorAuth()
    mockFindSchool.mockResolvedValue({ id: 'school-1', name: 'School 1' })
    mockFindAuthUser.mockResolvedValueOnce(null)
    mockFindExistingInvite.mockResolvedValue(null)
    mockCreateInvite.mockImplementation(async ({ data }) => ({
      id: 'invite-1',
      name: data.name,
      email: data.email,
      role: data.role,
      schoolId: data.schoolId,
      school: { id: 'school-1', name: 'School 1' },
      expiresAt: data.expiresAt,
    }))

    const response = await POST(createRequest('/api/users', {
      name: 'Teacher',
      email: 'teacher@test.com',
      role: 'TEACHER',
      schoolId: 'school-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.invite.inviteLink).toBe(data.inviteLink)
    expect(mockCreateInvite).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token: expect.any(String),
        tokenHash: expect.any(String),
      }),
      include: { school: true },
    })
  })

  it('reassigns an existing teacher to the coordinator school without a new invite', async () => {
    mockCoordinatorAuth()
    mockFindSchool.mockResolvedValue({ id: 'school-1', name: 'School 1' })
    mockFindAuthUser
      .mockResolvedValueOnce({
        id: 'teacher-1',
        name: 'Teacher',
        email: 'teacher@test.com',
        isGlobalAdmin: false,
        schools: [],
      })
      .mockResolvedValueOnce({
        id: 'teacher-1',
        name: 'Teacher',
        email: 'teacher@test.com',
        isGlobalAdmin: false,
        schools: [{
          schoolId: 'school-1',
          role: 'TEACHER',
          school: { id: 'school-1', name: 'School 1' },
        }],
      })
    mockCreateUserSchool.mockResolvedValue({})

    const response = await POST(createRequest('/api/users', {
      name: 'Teacher',
      email: 'teacher@test.com',
      role: 'TEACHER',
      schoolId: 'school-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.inviteLink).toBeUndefined()
    expect(data.user.email).toBe('teacher@test.com')
    expect(mockCreateUserSchool).toHaveBeenCalledWith({
      data: { userId: 'teacher-1', schoolId: 'school-1', role: 'TEACHER' },
    })
    expect(mockCreateInvite).not.toHaveBeenCalled()
    expect(mockLogAction).toHaveBeenCalledWith(
      'coordinator-1',
      'ASSIGN_USER_SCHOOL',
      { userId: 'teacher-1', role: 'TEACHER', schoolId: 'school-1' },
      '127.0.0.1'
    )
  })

  it('rejects existing users already assigned to the school', async () => {
    mockCoordinatorAuth()
    mockFindSchool.mockResolvedValue({ id: 'school-1', name: 'School 1' })
    mockFindAuthUser.mockResolvedValueOnce({
      id: 'teacher-1',
      name: 'Teacher',
      email: 'teacher@test.com',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'TEACHER', school: { id: 'school-1', name: 'School 1' } }],
    })

    const response = await POST(createRequest('/api/users', {
      name: 'Teacher',
      email: 'teacher@test.com',
      role: 'TEACHER',
      schoolId: 'school-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('User already assigned to this school')
    expect(mockCreateUserSchool).not.toHaveBeenCalled()
  })

  it('prevents coordinators from reassigning coordinator users', async () => {
    mockCoordinatorAuth()

    const response = await POST(createRequest('/api/users', {
      name: 'Coordinator',
      email: 'coordinator2@test.com',
      role: 'COORDINATOR',
      schoolId: 'school-1',
    }))

    expect(response.status).toBe(403)
    expect(mockCreateUserSchool).not.toHaveBeenCalled()
  })

  it('lets global admins reassign an existing coordinator with no coordinator school', async () => {
    mockGlobalAdminAuth()
    mockFindSchool.mockResolvedValue({ id: 'school-1', name: 'School 1' })
    mockFindAuthUser
      .mockResolvedValueOnce({
        id: 'coordinator-2',
        name: 'Coordinator',
        email: 'coordinator2@test.com',
        isGlobalAdmin: false,
        schools: [],
      })
      .mockResolvedValueOnce({
        id: 'coordinator-2',
        name: 'Coordinator',
        email: 'coordinator2@test.com',
        isGlobalAdmin: false,
        schools: [{
          schoolId: 'school-1',
          role: 'COORDINATOR',
          school: { id: 'school-1', name: 'School 1' },
        }],
      })

    const response = await POST(createRequest('/api/users', {
      name: 'Coordinator',
      email: 'coordinator2@test.com',
      role: 'COORDINATOR',
      schoolId: 'school-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.user.schools[0].role).toBe('COORDINATOR')
    expect(mockCreateUserSchool).toHaveBeenCalledWith({
      data: { userId: 'coordinator-2', schoolId: 'school-1', role: 'COORDINATOR' },
    })
  })

  it('rejects coordinator reassignment when the user coordinates another school', async () => {
    mockGlobalAdminAuth()
    mockFindSchool.mockResolvedValue({ id: 'school-1', name: 'School 1' })
    mockFindAuthUser.mockResolvedValueOnce({
      id: 'coordinator-2',
      name: 'Coordinator',
      email: 'coordinator2@test.com',
      isGlobalAdmin: false,
      schools: [{
        schoolId: 'school-2',
        role: 'COORDINATOR',
        school: { id: 'school-2', name: 'School 2' },
      }],
    })

    const response = await POST(createRequest('/api/users', {
      name: 'Coordinator',
      email: 'coordinator2@test.com',
      role: 'COORDINATOR',
      schoolId: 'school-1',
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Coordinator already assigned to a school')
    expect(mockCreateUserSchool).not.toHaveBeenCalled()
  })

  it('rejects reassigning existing global admin accounts', async () => {
    mockGlobalAdminAuth()
    mockFindSchool.mockResolvedValue({ id: 'school-1', name: 'School 1' })
    mockFindAuthUser.mockResolvedValueOnce({
      id: 'admin-2',
      name: 'Other Admin',
      email: 'other-admin@test.com',
      isGlobalAdmin: true,
      schools: [],
    })

    const response = await POST(createRequest('/api/users', {
      name: 'Other Admin',
      email: 'other-admin@test.com',
      role: 'TEACHER',
      schoolId: 'school-1',
    }))

    expect(response.status).toBe(403)
    expect(mockCreateUserSchool).not.toHaveBeenCalled()
  })

  it('allows coordinators to update teacher name and email in their school', async () => {
    mockCoordinatorAuth()
    mockFindAuthUser.mockResolvedValueOnce({
      id: 'teacher-1',
      name: 'Old Teacher',
      email: 'old.teacher@test.com',
      isGlobalAdmin: false,
      schools: [{ schoolId: 'school-1', role: 'TEACHER' }],
    })
    mockUpdateUser.mockResolvedValue({
      id: 'teacher-1',
      name: 'Updated Teacher',
      email: 'updated.teacher@test.com',
      isGlobalAdmin: false,
      schools: [{
        schoolId: 'school-1',
        role: 'TEACHER',
        school: { id: 'school-1', name: 'School 1' },
      }],
    })

    const response = await PATCH(createRequest('/api/users/teacher-1', {
      name: 'Updated Teacher',
      email: 'updated.teacher@test.com',
    }), { params: Promise.resolve({ id: 'teacher-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.user.name).toBe('Updated Teacher')
    expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'teacher-1' },
      data: { name: 'Updated Teacher', email: 'updated.teacher@test.com' },
    }))
    expect(mockLogAction).toHaveBeenCalledWith(
      'coordinator-1',
      'UPDATE_USER',
      { userId: 'teacher-1', email: 'updated.teacher@test.com' },
      '127.0.0.1'
    )
  })

  it('rejects teacher updates that reuse another account email', async () => {
    mockCoordinatorAuth()
    mockFindAuthUser
      .mockResolvedValueOnce({
        id: 'teacher-1',
        name: 'Old Teacher',
        email: 'old.teacher@test.com',
        isGlobalAdmin: false,
        schools: [{ schoolId: 'school-1', role: 'TEACHER' }],
      })
      .mockResolvedValueOnce({ id: 'teacher-2', email: 'used@test.com' })

    const response = await PATCH(createRequest('/api/users/teacher-1', {
      name: 'Updated Teacher',
      email: 'used@test.com',
    }), { params: Promise.resolve({ id: 'teacher-1' }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Email already exists')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})
