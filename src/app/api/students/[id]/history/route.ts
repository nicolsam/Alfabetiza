import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { forbiddenResponse, hasSchoolAccess, isAuthFailure, requireAuth } from '@/lib/permissions'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { id } = await params

    const student = await prisma.student.findUnique({
      where: { id, deletedAt: null },
      include: {
        class: true,
        school: { select: { id: true, name: true } },
      },
    })

    if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!hasSchoolAccess(auth.user, student.schoolId)) return forbiddenResponse()

    const userSelect = { 
      name: true, 
      isGlobalAdmin: true, 
      schools: { 
        where: { schoolId: student.school.id }, 
        select: { role: true } 
      } 
    }

    const assessments = await prisma.studentAssessment.findMany({
      where: {
        studentId: id,
        assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
      },
      orderBy: [
        { recordedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        assessmentLevel: true,
        user: { select: userSelect },
      },
    })

    const commentaries = await prisma.studentCommentary.findMany({
      where: { studentId: id },
      orderBy: [
        { recordedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        user: { select: userSelect },
      },
    })

    const mapTeacher = (user: any) => ({
      name: user.name,
      role: user.isGlobalAdmin ? 'Admin' : (user.schools?.[0]?.role === 'COORDINATOR' ? 'Coordinator' : 'Teacher')
    })

    return NextResponse.json({
      student,
      history: assessments.map((entry) => ({
        ...entry,
        readingLevelId: entry.assessmentLevelId,
        readingLevel: entry.assessmentLevel,
        teacher: mapTeacher(entry.user),
      })),
      commentaries: commentaries.map((entry: any) => ({ ...entry, teacher: mapTeacher(entry.user) })),
    })
  } catch (error) {
    console.error('Student history error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
