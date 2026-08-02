import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isAttentionAssessmentLevel, READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { getAccessibleSchoolIds, isAuthFailure, requireAuth } from '@/lib/permissions'
import {
  formatReferenceMonth,
  getLatestAssessmentMonth,
  getYearFromMonthKey,
  hasMonthlyReadingUpdate,
  resolveMonthInfo,
} from '@/lib/monthly-updates'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId')
    const grade = searchParams.get('grade')
    const section = searchParams.get('section')
    const shift = searchParams.get('shift')
    const { month: selectedMonth, monthStatus, range: selectedMonthRange } = resolveMonthInfo(searchParams.get('month'))
    const selectedAcademicYear = getYearFromMonthKey(selectedMonth)

    const schoolIds = await getAccessibleSchoolIds(auth.user, schoolId)

    if (schoolIds.length === 0) {
      return NextResponse.json({ 
        totalStudents: 0,
        distribution: [],
        byLevel: [],
        needAttention: [],
        monthlyUpdates: {
          month: selectedMonth,
          monthStatus,
          academicYear: selectedAcademicYear,
          totalStudents: 0,
          updatedCount: 0,
          missingCount: 0,
          missingStudents: [],
        },
      })
    }

    const rawStudents = await prisma.student.findMany({
      where: { 
        schoolId: { in: schoolIds },
        deletedAt: null,
        school: { deletedAt: null },
        enrollments: {
          some: {
            deletedAt: null,
            class: {
              academicYear: selectedAcademicYear,
              schoolId: { in: schoolIds },
              deletedAt: null,
              ...(grade ? { grade } : {}),
              ...(section ? { section } : {}),
              ...(shift ? { shift } : {}),
            },
          },
        },
      },
      include: {
        enrollments: {
          where: {
            deletedAt: null,
            class: {
              academicYear: selectedAcademicYear,
              schoolId: { in: schoolIds },
              deletedAt: null,
              ...(grade ? { grade } : {}),
              ...(section ? { section } : {}),
              ...(shift ? { shift } : {}),
            },
          },
          include: { class: { include: { school: true } } },
          orderBy: { startedAt: 'desc' },
        },
        assessments: {
          where: { assessmentType: { code: READING_ASSESSMENT_TYPE_CODE } },
          orderBy: [
            { referenceMonth: 'desc' },
            { createdAt: 'desc' },
          ],
          include: { assessmentLevel: true },
        },
        school: true,
      },
    })

    const students = rawStudents.map((student) => ({
      ...student,
      readingHistory: (student.assessments || []).map((assessment) => ({
        ...assessment,
        referenceMonth: formatReferenceMonth(assessment.referenceMonth),
        readingLevelId: assessment.assessmentLevelId,
        readingLevel: assessment.assessmentLevel,
      })),
    }))

    const levels = await prisma.assessmentLevel.findMany({
      where: {
        assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
        isActive: true,
      },
      orderBy: { order: 'asc' },
    })

    const distribution = levels.map((level) => {
      const count = students.filter(
        (s) => s.readingHistory[0]?.readingLevelId === level.id
      ).length
      return {
        level: level.code,
        name: level.name,
        count,
        percentage: students.length > 0 ? Math.round((count / students.length) * 100) : 0,
      }
    })

    const needAttention = students
      .filter((s) => isAttentionAssessmentLevel(s.readingHistory[0]?.readingLevel))
      .map((s) => ({
        id: s.id,
        name: s.name,
        studentNumber: s.studentNumber,
        classId: s.classId,
        schoolName: s.enrollments?.[0]?.class.school.name || s.school.name,
        level: s.readingHistory[0]?.readingLevel.name || 'Not assessed',
        levelCode: s.readingHistory[0]?.readingLevel.code || 'N/A',
      }))

    const missingMonthlyUpdateStudents = students
      .filter((s) => !hasMonthlyReadingUpdate(s.readingHistory, selectedMonthRange))
      .map((s) => ({
        id: s.id,
        name: s.name,
        studentNumber: s.studentNumber,
        classId: s.classId,
        schoolName: s.enrollments?.[0]?.class.school.name || s.school.name,
        level: s.readingHistory[0]?.readingLevel.name || 'Not assessed',
        levelCode: s.readingHistory[0]?.readingLevel.code || 'N/A',
        latestAssessmentMonth: getLatestAssessmentMonth(s.readingHistory),
      }))

    // Most common level
    const mostCommon = distribution.reduce((best, d) => d.count > best.count ? d : best, distribution[0])
    const mostCommonLevel = mostCommon && mostCommon.count > 0 ? mostCommon.level : null

    const improvedStudents = students
      .filter((student) => {
        const history = student.readingHistory
        // Find all assessments that happened in the selected month
        const assessmentsInMonth = history.filter(entry => entry.referenceMonth === selectedMonth)
        
        if (assessmentsInMonth.length === 0) return false

        // For each assessment in the month, check if it's an improvement over the one before it
        return assessmentsInMonth.some(current => {
          // Find the assessment immediately preceding this one
          const previous = history.find(entry => entry.referenceMonth < current.referenceMonth)
          
          return previous && current.readingLevel.order > previous.readingLevel.order
        })
      })
      .map((s) => ({
        id: s.id,
        name: s.name,
        studentNumber: s.studentNumber,
        classId: s.classId,
        schoolName: s.enrollments?.[0]?.class.school.name || s.school.name,
        level: s.readingHistory[0]?.readingLevel.name || 'Not assessed',
        levelCode: s.readingHistory[0]?.readingLevel.code || 'N/A',
        latestAssessmentMonth: getLatestAssessmentMonth(s.readingHistory),
      }))

    return NextResponse.json({
      totalStudents: students.length,
      distribution,
      byLevel: distribution,
      needAttention,
      mostCommonLevel,
      improved: improvedStudents,
      improvedCount: improvedStudents.length,
      improvedThisMonth: improvedStudents.length,
      monthlyUpdates: {
        month: selectedMonth,
        monthStatus,
        academicYear: selectedAcademicYear,
        totalStudents: students.length,
        updatedCount: students.length - missingMonthlyUpdateStudents.length,
        missingCount: missingMonthlyUpdateStudents.length,
        missingStudents: missingMonthlyUpdateStudents,
      },
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
