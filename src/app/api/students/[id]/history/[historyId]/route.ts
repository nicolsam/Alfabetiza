import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { logAction } from '@/lib/audit'
import { getEnrollmentForMonth } from '@/lib/enrollments'
import { formatReferenceMonth, getMonthKey, parseReferenceMonth } from '@/lib/monthly-updates'
import { requireAuth, isAuthFailure } from '@/lib/permissions'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; historyId: string }> }
) {
  const { id: studentId, historyId } = await params
  const auth = await requireAuth(request)
  if (isAuthFailure(auth)) return auth.error

  try {
    const entry = await prisma.studentAssessment.findFirst({
      where: {
        id: historyId,
        studentId,
        assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
      },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (entry.userId !== auth.user.id && !auth.user.isGlobalAdmin) {
      // Check if user is a coordinator at this school
      const student = await prisma.student.findUnique({ where: { id: studentId } })
      if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      const schoolAccess = auth.user.schools.find(s => s.schoolId === student.schoolId)
      if (schoolAccess?.role !== 'COORDINATOR') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    await prisma.studentAssessment.delete({
      where: { id: historyId },
    })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'DELETE_HISTORY', { studentId, historyId }, ipAddress)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete history error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; historyId: string }> }
) {
  const { id: studentId, historyId } = await params
  const auth = await requireAuth(request)
  if (isAuthFailure(auth)) return auth.error

  try {
    const entry = await prisma.studentAssessment.findFirst({
      where: {
        id: historyId,
        studentId,
        assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
      },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Permission: Any Teacher/Coordinator/Admin can edit assessments
    // Actually wait, let's verify if they have access to the student's school
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        school: true,
        enrollments: {
          where: { deletedAt: null },
          include: { class: true },
          orderBy: { startedAt: 'desc' },
        },
      }
    })
    
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    if (!auth.user.isGlobalAdmin) {
      const access = auth.user.schools.find(s => s.schoolId === student.schoolId)
      if (!access) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { readingLevelId, referenceMonth, notes, confirmReplace = false } = body
    const assessmentMonth = referenceMonth
      ? parseReferenceMonth(referenceMonth)
      : entry.referenceMonth

    if (!assessmentMonth) {
      return NextResponse.json({ error: `Invalid reference month: ${referenceMonth}. Expected MM/YYYY.` }, { status: 400 })
    }
    if (assessmentMonth > parseReferenceMonth(getMonthKey())!) {
      return NextResponse.json({ error: 'Future reference months are not allowed' }, { status: 400 })
    }

    let assessmentTypeId = entry.assessmentTypeId
    if (readingLevelId) {
      const readingLevel = await prisma.assessmentLevel.findFirst({
        where: {
          id: readingLevelId,
          isActive: true,
          assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
        },
      })

      if (!readingLevel) {
        return NextResponse.json({
          error: 'Invalid reading level',
          details: { readingLevelId, expectedAssessmentType: READING_ASSESSMENT_TYPE_CODE },
        }, { status: 400 })
      }
      assessmentTypeId = readingLevel.assessmentTypeId
    }

    const enrollment = getEnrollmentForMonth(student.enrollments, assessmentMonth)
    if (!enrollment) {
      return NextResponse.json({
        error: `No enrollment found overlapping reference month ${formatReferenceMonth(assessmentMonth)}.`,
      }, { status: 400 })
    }

    const target = await prisma.studentAssessment.findUnique({
      where: {
        studentId_assessmentTypeId_referenceMonth: {
          studentId,
          assessmentTypeId,
          referenceMonth: assessmentMonth,
        },
      },
      include: { assessmentLevel: true },
    })

    if (target && target.id !== historyId && !confirmReplace) {
      return NextResponse.json({
        error: 'A level is already recorded for this month.',
        code: 'MONTH_ALREADY_RECORDED',
        existingAssessment: {
          id: target.id,
          referenceMonth: formatReferenceMonth(target.referenceMonth),
          readingLevelId: target.assessmentLevelId,
          readingLevel: target.assessmentLevel,
        },
      }, { status: 409 })
    }

    const updateData = {
      enrollmentId: enrollment.id,
      assessmentLevelId: readingLevelId || undefined,
      referenceMonth: assessmentMonth,
      userId: auth.user.id,
      notes: notes !== undefined ? notes : undefined,
    }
    const updated = target && target.id !== historyId
      ? await prisma.$transaction(async (transaction) => {
          const replacement = await transaction.studentAssessment.update({
            where: { id: target.id },
            data: updateData,
            include: { assessmentLevel: true },
          })
          await transaction.studentAssessment.delete({ where: { id: historyId } })
          return replacement
        })
      : await prisma.studentAssessment.update({
          where: { id: historyId },
          data: updateData,
          include: { assessmentLevel: true },
        })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, target && target.id !== historyId ? 'REPLACE_HISTORY_MONTH' : 'UPDATE_HISTORY', {
      studentId,
      historyId,
      readingLevelId,
      referenceMonth: formatReferenceMonth(assessmentMonth),
      replacedAssessmentId: target && target.id !== historyId ? target.id : undefined,
    }, ipAddress)

    return NextResponse.json({
      ...updated,
      referenceMonth: formatReferenceMonth(updated.referenceMonth),
      readingLevelId: updated.assessmentLevelId,
      readingLevel: updated.assessmentLevel,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({
        error: 'A level is already recorded for this month.',
        code: 'MONTH_ALREADY_RECORDED',
      }, { status: 409 })
    }
    console.error('Update history error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
