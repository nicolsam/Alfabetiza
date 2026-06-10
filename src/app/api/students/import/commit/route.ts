import { NextResponse } from 'next/server'

import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { logAction } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { getAcademicYearStartDate } from '@/lib/enrollments'
import { parseDateInput } from '@/lib/monthly-updates'
import { forbiddenResponse, isAuthFailure, isCoordinatorForSchool, requireAuth } from '@/lib/permissions'
import {
  MAX_STUDENT_IMPORT_ROWS,
  type StudentImportCellResult,
  type StudentImportGridRow,
  type StudentImportRowResult,
  buildStudentImportCommitResult,
} from '@/lib/student-imports'

type ExistingStudentWithEnrollments = {
  id: string
  name: string
  studentNumber: string
  schoolId: string
  enrollments: { id: string; classId: string }[]
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (isAuthFailure(auth)) return auth.error

    const body = await request.json()
    const selectedClassId = readStringField(body, 'selectedClassId')
    const months = parseMonths(body?.months)
    const rows = parseGridRows(body?.rows)

    if (!selectedClassId || months.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const classRecord = await prisma.class.findFirst({
      where: { id: selectedClassId, deletedAt: null, school: { deletedAt: null } },
      select: { id: true, schoolId: true, academicYear: true, grade: true },
    })

    if (!classRecord) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!isCoordinatorForSchool(auth.user, classRecord.schoolId)) return forbiddenResponse()

    const matriculas = rows.map((row) => row.matricula).filter(Boolean)
    const [levels, existingStudents] = await Promise.all([
      prisma.assessmentLevel.findMany({
        where: {
          isActive: true,
          assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
        },
        select: {
          id: true,
          code: true,
          name: true,
          assessmentTypeId: true,
          color: true,
          backgroundColor: true,
          textColor: true,
        },
      }),
      prisma.student.findMany({
        where: {
          schoolId: classRecord.schoolId,
          deletedAt: null,
          studentNumber: { in: matriculas },
        },
        select: {
          id: true,
          name: true,
          studentNumber: true,
          schoolId: true,
          enrollments: {
            where: { classId: classRecord.id, deletedAt: null },
            select: { id: true, classId: true },
            orderBy: { startedAt: 'desc' },
          },
        },
      }),
    ])

    const validated = buildStudentImportCommitResult({
      rows,
      months,
      classRecord,
      levels,
      existingStudents,
    })

    const importedRows = await prisma.$transaction(async (transaction) => {
      const existingByMatricula = new Map(
        (existingStudents as ExistingStudentWithEnrollments[]).map((student) => [student.studentNumber, student])
      )
      const imported: StudentImportRowResult[] = []

      for (const row of validated.rows) {
        if (row.status !== 'imported') {
          imported.push(row)
          continue
        }

        const existingStudent = existingByMatricula.get(row.matricula)
        const student = existingStudent || await transaction.student.create({
          data: {
            name: row.name,
            studentNumber: row.matricula,
            schoolId: classRecord.schoolId,
            classId: classRecord.id,
            enrollments: {
              create: {
                classId: classRecord.id,
                startedAt: getAcademicYearStartDate(classRecord.academicYear),
              },
            },
          },
          include: {
            enrollments: {
              where: { classId: classRecord.id, deletedAt: null },
              orderBy: { startedAt: 'desc' },
            },
          },
        })

        const enrollment = student.enrollments[0] || await transaction.studentEnrollment.create({
          data: {
            studentId: student.id,
            classId: classRecord.id,
            startedAt: getAcademicYearStartDate(classRecord.academicYear),
          },
        })

        const importedCells = await createAssessmentsForCells({
          cells: row.cells,
          studentId: student.id,
          enrollmentId: enrollment.id,
          userId: auth.user.id,
          transaction,
        })

        imported.push({
          ...row,
          studentId: student.id,
          createdStudent: !existingStudent,
          cells: importedCells,
        })
      }

      return imported
    })

    const result = {
      summary: summarizeImportedRows(importedRows),
      rows: importedRows,
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'Unknown'
    await logAction(auth.user.id, 'BATCH_IMPORT_STUDENTS', {
      classId: classRecord.id,
      schoolId: classRecord.schoolId,
      createdStudents: result.summary.createdStudents,
      reusedStudents: result.summary.reusedStudents,
      importedCells: result.summary.importedCells,
      invalidRows: result.summary.invalidRows,
      incompleteRows: result.summary.incompleteRows,
      assessmentTypeCode: READING_ASSESSMENT_TYPE_CODE,
    }, ipAddress)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof StudentImportCommitError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Student import commit error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function createAssessmentsForCells(input: {
  cells: StudentImportCellResult[]
  studentId: string
  enrollmentId: string
  userId: string
  transaction: {
    studentAssessment: {
      create: (args: {
        data: {
          studentId: string
          enrollmentId: string
          assessmentTypeId: string
          assessmentLevelId: string
          userId: string
          recordedAt: Date
        }
      }) => Promise<{ id: string }>
    }
  }
}): Promise<StudentImportCellResult[]> {
  const importedCells: StudentImportCellResult[] = []

  for (const cell of input.cells) {
    if (cell.status !== 'imported' || !cell.readingLevelId || !cell.assessmentTypeId || !cell.recordedAt) {
      importedCells.push(cell)
      continue
    }

    const recordedAt = parseDateInput(cell.recordedAt)
    if (!recordedAt) throw new Error(`Invalid generated assessment date: ${cell.recordedAt}`)

    const assessment = await input.transaction.studentAssessment.create({
      data: {
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        assessmentTypeId: cell.assessmentTypeId,
        assessmentLevelId: cell.readingLevelId,
        userId: input.userId,
        recordedAt,
      },
    })

    importedCells.push({ ...cell, assessmentId: assessment.id })
  }

  return importedCells
}

class StudentImportCommitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudentImportCommitError'
  }
}

function parseMonths(value: unknown): string[] {
  if (!Array.isArray(value)) throw new StudentImportCommitError('Months must be an array.')

  return Array.from(new Set(value.map((month) => (
    typeof month === 'string' ? month.trim() : ''
  )).filter(Boolean)))
}

function parseGridRows(value: unknown): StudentImportGridRow[] {
  if (!Array.isArray(value)) throw new StudentImportCommitError('Rows must be an array.')
  if (value.length > MAX_STUDENT_IMPORT_ROWS) {
    throw new StudentImportCommitError(`Too many rows. Expected at most ${MAX_STUDENT_IMPORT_ROWS} students.`)
  }

  return value.map((row, index) => ({
    rowId: readStringField(row, 'rowId') || `row-${index}`,
    matricula: readStringField(row, 'matricula'),
    name: readStringField(row, 'name'),
    levelsByMonth: readLevelsByMonth(row),
  }))
}

function readLevelsByMonth(row: unknown): Record<string, string> {
  if (!row || typeof row !== 'object') return {}

  const rawLevels = (row as Record<string, unknown>).levelsByMonth
  if (!rawLevels || typeof rawLevels !== 'object' || Array.isArray(rawLevels)) return {}

  return Object.entries(rawLevels).reduce<Record<string, string>>((levelsByMonth, [month, level]) => {
    if (typeof level === 'string' || typeof level === 'number') {
      levelsByMonth[month] = String(level).trim()
    }
    return levelsByMonth
  }, {})
}

function readStringField(row: unknown, key: string): string {
  if (!row || typeof row !== 'object') return ''
  const value = (row as Record<string, unknown>)[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function summarizeImportedRows(rows: StudentImportRowResult[]) {
  return {
    totalRows: rows.length,
    importedRows: rows.filter((row) => row.status === 'imported').length,
    importedCells: rows.reduce((count, row) => count + row.cells.filter((cell) => cell.status === 'imported').length, 0),
    createdStudents: rows.filter((row) => row.status === 'imported' && row.createdStudent).length,
    reusedStudents: rows.filter((row) => row.status === 'imported' && !row.createdStudent).length,
    skippedRows: rows.filter((row) => row.status === 'skipped').length,
    invalidRows: rows.filter((row) => row.status === 'invalid').length,
    incompleteRows: rows.filter((row) => row.status === 'incomplete').length,
  }
}
