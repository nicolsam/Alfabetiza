import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { logAction } from '@/lib/audit'
import { getAcademicYearStartDate, parseAcademicYear } from '@/lib/enrollments'
import { forbiddenResponse, getAccessibleSchoolIds, isAuthFailure, isCoordinatorForSchool, requireAuth } from '@/lib/permissions'
import { normalizeStudentContactInputs } from '@/lib/student-contacts'
import {
  getLatestAssessmentDate,
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
    const selectedAcademicYear = parseAcademicYear(searchParams.get('academicYear')) || getYearFromMonthKey(selectedMonth)

    const validSchoolIds = await getAccessibleSchoolIds(auth.user, schoolId)

    const classFilters: Prisma.ClassWhereInput = { deletedAt: null }
    classFilters.academicYear = selectedAcademicYear
    if (grade) classFilters.grade = grade
    if (section) classFilters.section = section
    if (shift) classFilters.shift = shift

    const rawStudents = await prisma.student.findMany({
      where: {
        schoolId: { in: validSchoolIds },
        deletedAt: null,
        school: { deletedAt: null },
        enrollments: {
          some: {
            deletedAt: null,
            class: {
              ...classFilters,
              schoolId: { in: validSchoolIds },
              school: { deletedAt: null },
            },
          },
        },
      },
      include: {
        class: true,
        enrollments: {
          where: {
            deletedAt: null,
            class: {
              academicYear: selectedAcademicYear,
              schoolId: { in: validSchoolIds },
              deletedAt: null,
            },
          },
          include: { class: true },
          orderBy: { startedAt: 'desc' },
        },
        assessments: {
          where: { assessmentType: { code: READING_ASSESSMENT_TYPE_CODE } },
          orderBy: [
            { recordedAt: 'desc' },
            { createdAt: 'desc' },
          ],
          include: { assessmentLevel: true },
        },
      },
    })

    const students = rawStudents.map((student) => ({
      ...student,
      readingHistory: (student.assessments || []).map((assessment) => ({
        ...assessment,
        readingLevelId: assessment.assessmentLevelId,
        readingLevel: assessment.assessmentLevel,
      })),
    }))

    const studentsWithMonthlyStatus = students.map((student) => {
      const selectedEnrollment = student.enrollments?.[0] || null
      return {
        ...student,
        class: selectedEnrollment?.class || student.class,
        selectedEnrollment,
        selectedAcademicYear,
        monthlyUpdateStatus: hasMonthlyReadingUpdate(student.readingHistory, selectedMonthRange)
          ? 'updated'
          : 'missing',
        monthStatus,
        selectedMonth,
        latestAssessmentDate: getLatestAssessmentDate(student.readingHistory),
      }
    })

    return NextResponse.json({ students: studentsWithMonthlyStatus })
  } catch (error) {
    console.error('Students error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const { name, studentNumber, classId, contacts } = await request.json()

    if (!name || !studentNumber || !classId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const classRecord = await prisma.class.findUnique({ where: { id: classId } })
    if (!classRecord) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    if (!isCoordinatorForSchool(auth.user, classRecord.schoolId)) return forbiddenResponse()

    const existingStudent = await prisma.student.findUnique({
      where: { studentNumber_schoolId: { studentNumber, schoolId: classRecord.schoolId } }
    })

    if (existingStudent) {
      return NextResponse.json({ error: 'Student number exists' }, { status: 400 })
    }

    const normalizedContacts = normalizeStudentContactInputs(contacts)
    const student = await prisma.$transaction(async (transaction) => transaction.student.create({
        data: {
          name,
          studentNumber,
          schoolId: classRecord.schoolId,
          classId,
          enrollments: {
            create: {
              classId,
              startedAt: getAcademicYearStartDate(classRecord.academicYear),
            },
          },
          contacts: normalizedContacts.length > 0 ? {
            create: normalizedContacts.map((contact) => ({
              name: contact.name,
              relationship: contact.relationship,
              phone: contact.phone,
              whatsappPhone: contact.whatsappPhone,
              isPrimary: contact.isPrimary,
            })),
          } : undefined,
        },
        include: {
          class: true,
          contacts: true,
          enrollments: {
            include: { class: true },
          },
        },
      }))

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'CREATE_STUDENT', { studentId: student.id, name }, ipAddress)

    return NextResponse.json({ student })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Create student error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
