import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { logAction } from '@/lib/audit'
import {
  forbiddenResponse,
  getCoordinatorSchoolId,
  isAuthFailure,
  requireAuth,
  USER_SCHOOL_ROLES,
} from '@/lib/permissions'

async function canManageTargetUser(request: Request, userId: string) {
  const auth = await requireAuth(request)
  if (isAuthFailure(auth)) return { response: auth.error }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { schools: true },
  })
  if (!target) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (target.isGlobalAdmin) return { response: forbiddenResponse() }

  if (auth.user.isGlobalAdmin) return { auth, target }

  const coordinatorSchoolId = getCoordinatorSchoolId(auth.user)
  const canManage = Boolean(coordinatorSchoolId) && target.schools.some((school) => (
    school.schoolId === coordinatorSchoolId && school.role === USER_SCHOOL_ROLES.TEACHER
  ))

  if (!canManage) return { response: forbiddenResponse() }
  return { auth, target }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const access = await canManageTargetUser(request, id)
    if (access.response) return access.response

    const { name, email } = await request.json()
    if (!name || !email) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    if (email !== access.target!.email) {
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (existingUser) return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name, email },
      include: { schools: { include: { school: true } } },
    })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(access.auth!.user.id, 'UPDATE_USER', { userId: id, email }, ipAddress)

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        gender: updatedUser.gender,
        isGlobalAdmin: updatedUser.isGlobalAdmin,
        schools: updatedUser.schools.map((school) => ({
          schoolId: school.schoolId,
          schoolName: school.school.name,
          role: school.role,
        })),
      },
    })
  } catch (error) {
    console.error('Users PATCH error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
