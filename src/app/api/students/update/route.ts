import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { logAction } from '@/lib/audit'
import { getEnrollmentForDate } from '@/lib/enrollments'
import { parseDateInput } from '@/lib/monthly-updates'
import { forbiddenResponse, hasSchoolAccess, isAuthFailure, requireAuth } from '@/lib/permissions'

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const body = await request.json()
    const { studentId, readingLevelId, recordedAt } = body

    if (!studentId || !readingLevelId) {
      return NextResponse.json({ 
        error: 'Missing fields',
        details: { studentId: !!studentId, readingLevelId: !!readingLevelId }
      }, { status: 400 })
    }

    const assessmentDate = recordedAt ? parseDateInput(recordedAt) : new Date()
    if (!assessmentDate) {
      return NextResponse.json({ error: 'Invalid assessment date' }, { status: 400 })
    }

    if (assessmentDate > new Date()) {
      return NextResponse.json({ error: 'Future assessment dates are not allowed' }, { status: 400 })
    }

    const readingLevel = await prisma.assessmentLevel.findFirst({
      where: {
        id: readingLevelId,
        isActive: true,
        assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
      },
      include: { assessmentType: true },
    })

    if (!readingLevel) {
      return NextResponse.json({
        error: 'Invalid reading level',
        details: { readingLevelId, expectedAssessmentType: READING_ASSESSMENT_TYPE_CODE },
      }, { status: 400 })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: {
          where: { deletedAt: null },
          include: { class: true },
          orderBy: { startedAt: 'desc' },
        },
      },
    })

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    if (!hasSchoolAccess(auth.user, student.schoolId)) return forbiddenResponse()

    const enrollment = getEnrollmentForDate(student.enrollments, assessmentDate)
    if (!enrollment) {
      return NextResponse.json({
        error: 'No enrollment found for this assessment date. Create or fix the student enrollment first.',
      }, { status: 400 })
    }

    const assessment = await prisma.studentAssessment.create({
      data: {
        studentId,
        enrollmentId: enrollment.id,
        assessmentTypeId: readingLevel.assessmentTypeId,
        assessmentLevelId: readingLevelId,
        userId: auth.user.id,
        recordedAt: assessmentDate,
        notes: body.notes || null,
      },
      include: { assessmentLevel: true },
    })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'UPDATE_STUDENT_LEVEL', { studentId, readingLevelId }, ipAddress)

    const history = {
      ...assessment,
      readingLevelId: assessment.assessmentLevelId,
      readingLevel: assessment.assessmentLevel,
    }

    return NextResponse.json({ history })
  } catch (error) {
    console.error('Update reading level error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
