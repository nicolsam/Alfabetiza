import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { logAction } from '@/lib/audit'
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
      include: { school: true }
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
    const { readingLevelId, recordedAt, notes } = body

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
    }

    const updated = await prisma.studentAssessment.update({
      where: { id: historyId },
      data: {
        assessmentLevelId: readingLevelId || undefined,
        recordedAt: recordedAt ? new Date(recordedAt) : undefined,
        notes: notes !== undefined ? notes : undefined,
      },
      include: { assessmentLevel: true },
    })

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'UPDATE_HISTORY', { studentId, historyId, readingLevelId }, ipAddress)

    return NextResponse.json({
      ...updated,
      readingLevelId: updated.assessmentLevelId,
      readingLevel: updated.assessmentLevel,
    })
  } catch (error) {
    console.error('Update history error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
