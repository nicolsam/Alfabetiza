import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { logAction } from '@/lib/audit'
import { buildInviteUrl, createInviteToken, getInviteExpirationDate, hashInviteToken } from '@/lib/invites'
import {
  forbiddenResponse,
  getCoordinatorSchoolId,
  isAuthFailure,
  isCoordinatorForSchool,
  requireAuth,
  USER_SCHOOL_ROLES,
} from '@/lib/permissions'

const MANAGEABLE_ROLES = [USER_SCHOOL_ROLES.TEACHER, USER_SCHOOL_ROLES.COORDINATOR] as const

function normalizeRole(role: unknown): string | null {
  return typeof role === 'string' && MANAGEABLE_ROLES.includes(role as (typeof MANAGEABLE_ROLES)[number]) ? role : null
}

function getRoleFilter(role: string | null): string[] | NextResponse {
  if (!role) return [...MANAGEABLE_ROLES]

  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  return [normalizedRole]
}

function hasCoordinatorAssignment(user: { schools: { role: string }[] }): boolean {
  return user.schools.some((school) => school.role === USER_SCHOOL_ROLES.COORDINATOR)
}

function serializeUser(user: {
  id: string
  name: string
  email: string
  gender?: string | null
  isGlobalAdmin: boolean
  schools: { schoolId: string; role: string; school: { id: string; name: string } }[]
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    gender: user.gender,
    isGlobalAdmin: user.isGlobalAdmin,
    schools: user.schools.map((school) => ({
      schoolId: school.schoolId,
      schoolName: school.school.name,
      role: school.role,
    })),
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { searchParams } = new URL(request.url)
    const requestedSchoolId = searchParams.get('schoolId')
    const requestedRole = searchParams.get('role')
    const roleFilter = getRoleFilter(requestedRole)
    if (!Array.isArray(roleFilter)) return roleFilter

    const coordinatorSchoolId = getCoordinatorSchoolId(auth.user)
    const schoolId = auth.user.isGlobalAdmin ? requestedSchoolId : coordinatorSchoolId
    const manageableRoles = auth.user.isGlobalAdmin
      ? roleFilter
      : requestedRole ? roleFilter : [USER_SCHOOL_ROLES.TEACHER]

    if (!auth.user.isGlobalAdmin && !schoolId) return forbiddenResponse()

    const users = await prisma.user.findMany({
      where: {
        isGlobalAdmin: false,
        schools: {
          some: {
            ...(schoolId ? { schoolId } : {}),
            role: { in: manageableRoles },
            school: { deletedAt: null },
          },
        },
      },
      include: {
        schools: {
          where: {
            ...(schoolId ? { schoolId } : {}),
            role: { in: manageableRoles },
            school: { deletedAt: null },
          },
          include: { school: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    })

    const invites = await prisma.userInvite.findMany({
      where: {
        acceptedAt: null,
        ...(schoolId ? { schoolId } : {}),
        role: { in: manageableRoles },
        school: { deletedAt: null },
      },
      include: { school: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      users: users.map(serializeUser),
      invites: invites.map((invite) => ({
        id: invite.id,
        name: invite.name,
        email: invite.email,
        role: invite.role,
        schoolId: invite.schoolId,
        schoolName: invite.school.name,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        inviteLink: invite.token ? buildInviteUrl(request, invite.token) : null,
      })),
    })
  } catch (error) {
    console.error('Users GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { name, email, role: rawRole, schoolId: rawSchoolId } = await request.json()
    const role = normalizeRole(rawRole)
    const coordinatorSchoolId = getCoordinatorSchoolId(auth.user)
    const schoolId = auth.user.isGlobalAdmin ? rawSchoolId : coordinatorSchoolId

    if (!name || !email || !role || !schoolId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (role === USER_SCHOOL_ROLES.COORDINATOR && !auth.user.isGlobalAdmin) {
      return forbiddenResponse()
    }

    if (role === USER_SCHOOL_ROLES.TEACHER && !isCoordinatorForSchool(auth.user, schoolId)) {
      return forbiddenResponse()
    }

    const school = await prisma.school.findFirst({ where: { id: schoolId, deletedAt: null } })
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { schools: { include: { school: { select: { id: true, name: true } } } } },
    })
    if (existingUser) {
      if (existingUser.isGlobalAdmin) return forbiddenResponse()
      if (existingUser.schools.some((userSchool) => userSchool.schoolId === schoolId)) {
        return NextResponse.json({ error: 'User already assigned to this school' }, { status: 400 })
      }
      if (role === USER_SCHOOL_ROLES.COORDINATOR && hasCoordinatorAssignment(existingUser)) {
        return NextResponse.json({ error: 'Coordinator already assigned to a school' }, { status: 400 })
      }

      await prisma.userSchool.create({
        data: {
          userId: existingUser.id,
          schoolId,
          role,
        },
      })

      const reassignedUser = await prisma.user.findUnique({
        where: { id: existingUser.id },
        include: { schools: { include: { school: { select: { id: true, name: true } } } } },
      })
      if (!reassignedUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

      const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
      await logAction(auth.user.id, 'ASSIGN_USER_SCHOOL', { userId: existingUser.id, role, schoolId }, ipAddress)

      return NextResponse.json({ user: serializeUser(reassignedUser) })
    }

    const existingInvite = await prisma.userInvite.findFirst({
      where: { email, acceptedAt: null },
    })
    if (existingInvite) return NextResponse.json({ error: 'Invite already exists' }, { status: 400 })

    const token = createInviteToken()
    const invite = await prisma.userInvite.create({
      data: {
        name,
        email,
        role,
        schoolId,
        token,
        tokenHash: hashInviteToken(token),
        expiresAt: getInviteExpirationDate(),
        createdById: auth.user.id,
      },
      include: { school: true },
    })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'CREATE_USER_INVITE', { inviteId: invite.id, email, role, schoolId }, ipAddress)

    return NextResponse.json({
      invite: {
        id: invite.id,
        name: invite.name,
        email: invite.email,
        role: invite.role,
        schoolId: invite.schoolId,
        schoolName: invite.school.name,
        expiresAt: invite.expiresAt,
        inviteLink: buildInviteUrl(request, token),
      },
      inviteLink: buildInviteUrl(request, token),
    })
  } catch (error) {
    console.error('Users POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
