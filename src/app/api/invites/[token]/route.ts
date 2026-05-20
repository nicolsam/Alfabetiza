import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { hashInviteToken, isInviteExpired } from '@/lib/invites'
import { USER_SCHOOL_ROLES, requireAuth, isAuthFailure, isCoordinatorForSchool } from '@/lib/permissions'
import { normalizeGender } from '@/lib/user-profile'

async function findInvite(token: string) {
  return prisma.userInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { school: true },
  })
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const invite = await findInvite(token)

    if (!invite || invite.acceptedAt || isInviteExpired(invite.expiresAt)) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }

    return NextResponse.json({
      invite: {
        name: invite.name,
        email: invite.email,
        role: invite.role,
        schoolName: invite.school.name,
        expiresAt: invite.expiresAt,
      },
    })
  } catch (error) {
    console.error('Invite GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { password, gender: rawGender } = await request.json()
    const gender = normalizeGender(rawGender)

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must have at least 8 characters' }, { status: 400 })
    }

    if (!gender) {
      return NextResponse.json({ error: 'Gender is required' }, { status: 400 })
    }

    const invite = await findInvite(token)
    if (!invite || invite.acceptedAt || isInviteExpired(invite.expiresAt)) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invite.email } })
    if (existingUser) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    const hashedPassword = await hashPassword(password)
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: invite.name,
          email: invite.email,
          password: hashedPassword,
          gender,
          schools: {
            create: {
              schoolId: invite.schoolId,
              role: invite.role === USER_SCHOOL_ROLES.COORDINATOR
                ? USER_SCHOOL_ROLES.COORDINATOR
                : USER_SCHOOL_ROLES.TEACHER,
            },
          },
        },
      })

      await tx.userInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      })

      return createdUser
    })

    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } })
  } catch (error) {
    console.error('Invite POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error
    
    const { user } = auth

    const { token: id } = await params
    const invite = await prisma.userInvite.findUnique({
      where: { id },
    })

    if (!invite) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!user.isGlobalAdmin && !isCoordinatorForSchool(user, invite.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!user.isGlobalAdmin && invite.role === USER_SCHOOL_ROLES.COORDINATOR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (invite.acceptedAt) {
      return NextResponse.json({ error: 'Invite already accepted' }, { status: 400 })
    }

    await prisma.userInvite.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/invites/[token] error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
