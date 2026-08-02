import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { logAction } from '@/lib/audit'
import { getEnrollmentForMonth } from '@/lib/enrollments'
import { formatReferenceMonth, getMonthKey, parseReferenceMonth } from '@/lib/monthly-updates'
import { forbiddenResponse, hasSchoolAccess, isAuthFailure, requireAuth } from '@/lib/permissions'

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const body = await request.json()
    const { studentId, readingLevelId, referenceMonth = getMonthKey(), confirmReplace = false } = body

    if (!studentId || !readingLevelId) {
      return NextResponse.json({ 
        error: 'Missing fields',
        details: { studentId: !!studentId, readingLevelId: !!readingLevelId }
      }, { status: 400 })
    }

    const assessmentMonth = parseReferenceMonth(referenceMonth)
    if (!assessmentMonth) {
      return NextResponse.json({ error: `Invalid reference month: ${referenceMonth}. Expected MM/YYYY.` }, { status: 400 })
    }

    if (assessmentMonth > parseReferenceMonth(getMonthKey())!) {
      return NextResponse.json({ error: 'Future reference months are not allowed' }, { status: 400 })
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

    const enrollment = getEnrollmentForMonth(student.enrollments, assessmentMonth)
    if (!enrollment) {
      return NextResponse.json({
        error: `No enrollment found overlapping reference month ${referenceMonth}. Create or fix the student enrollment first.`,
      }, { status: 400 })
    }

    const existingAssessment = await prisma.studentAssessment.findUnique({
      where: {
        studentId_assessmentTypeId_referenceMonth: {
          studentId,
          assessmentTypeId: readingLevel.assessmentTypeId,
          referenceMonth: assessmentMonth,
        },
      },
      include: { assessmentLevel: true },
    })

    if (existingAssessment && !confirmReplace) {
      return NextResponse.json({
        error: 'A level is already recorded for this month.',
        code: 'MONTH_ALREADY_RECORDED',
        existingAssessment: {
          id: existingAssessment.id,
          referenceMonth: formatReferenceMonth(existingAssessment.referenceMonth),
          readingLevelId: existingAssessment.assessmentLevelId,
          readingLevel: existingAssessment.assessmentLevel,
        },
      }, { status: 409 })
    }

    const assessmentData = {
      studentId,
      enrollmentId: enrollment.id,
      assessmentTypeId: readingLevel.assessmentTypeId,
      assessmentLevelId: readingLevelId,
      userId: auth.user.id,
      referenceMonth: assessmentMonth,
      notes: body.notes || null,
    }
    let assessment
    try {
      assessment = confirmReplace
        ? await prisma.studentAssessment.upsert({
            where: {
              studentId_assessmentTypeId_referenceMonth: {
                studentId,
                assessmentTypeId: readingLevel.assessmentTypeId,
                referenceMonth: assessmentMonth,
              },
            },
            create: assessmentData,
            update: {
              enrollmentId: enrollment.id,
              assessmentLevelId: readingLevelId,
              userId: auth.user.id,
              notes: body.notes || null,
            },
            include: { assessmentLevel: true },
          })
        : await prisma.studentAssessment.create({
            data: assessmentData,
            include: { assessmentLevel: true },
          })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json({
          error: 'A level is already recorded for this month.',
          code: 'MONTH_ALREADY_RECORDED',
        }, { status: 409 })
      }
      throw error
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, confirmReplace ? 'REPLACE_STUDENT_LEVEL' : 'UPDATE_STUDENT_LEVEL', {
      studentId,
      readingLevelId,
      referenceMonth,
      replacedAssessmentId: existingAssessment?.id,
    }, ipAddress)

    const history = {
      ...assessment,
      referenceMonth: formatReferenceMonth(assessment.referenceMonth),
      readingLevelId: assessment.assessmentLevelId,
      readingLevel: assessment.assessmentLevel,
    }

    return NextResponse.json({ history })
  } catch (error) {
    console.error('Update reading level error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
