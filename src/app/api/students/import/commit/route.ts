import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'

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

type PersistedStudent = {
  id: string
  studentNumber: string
  enrollments: { id: string; classId: string }[]
}

type ImportTransaction = Pick<
  Prisma.TransactionClient,
  'student' | 'studentEnrollment' | 'studentAssessment'
>

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

    const importedRows = await prisma.$transaction(
      (transaction) => persistStudentImportRows({
        rows: validated.rows,
        classRecord,
        existingStudents: existingStudents as ExistingStudentWithEnrollments[],
        userId: auth.user.id,
        transaction,
      }),
      { timeout: 20000 }
    )

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

async function persistStudentImportRows(input: {
  rows: StudentImportRowResult[]
  classRecord: { id: string; schoolId: string; academicYear: number }
  existingStudents: ExistingStudentWithEnrollments[]
  userId: string
  transaction: ImportTransaction
}): Promise<StudentImportRowResult[]> {
  const existingByMatricula = new Map(input.existingStudents.map((student) => [student.studentNumber, student]))
  const persistedByMatricula = buildPersistedStudentMap(input.rows, existingByMatricula)
  const enrollmentIdByStudentId = buildEnrollmentMap(persistedByMatricula)
  const enrollmentStartedAt = getAcademicYearStartDate(input.classRecord.academicYear)

  const studentsToCreate = buildStudentsToCreate(input.rows, existingByMatricula, persistedByMatricula, input.classRecord)
  if (studentsToCreate.length > 0) await input.transaction.student.createMany({ data: studentsToCreate })

  const enrollmentsToCreate = buildEnrollmentsToCreate(
    input.rows,
    persistedByMatricula,
    enrollmentIdByStudentId,
    input.classRecord.id,
    enrollmentStartedAt
  )
  if (enrollmentsToCreate.length > 0) await input.transaction.studentEnrollment.createMany({ data: enrollmentsToCreate })

  const assessmentIdsByCell = new Map<string, string>()
  const assessmentsToCreate = buildAssessmentsToCreate(
    input.rows,
    persistedByMatricula,
    enrollmentIdByStudentId,
    input.userId,
    assessmentIdsByCell
  )
  if (assessmentsToCreate.length > 0) await input.transaction.studentAssessment.createMany({ data: assessmentsToCreate })

  return input.rows.map((row) => addPersistedIdsToRow(row, persistedByMatricula, assessmentIdsByCell))
}

function buildPersistedStudentMap(
  rows: StudentImportRowResult[],
  existingByMatricula: Map<string, ExistingStudentWithEnrollments>
): Map<string, PersistedStudent> {
  const persistedByMatricula = new Map<string, PersistedStudent>()

  for (const row of rows.filter(isImportedRow)) {
    const existingStudent = existingByMatricula.get(row.matricula)
    persistedByMatricula.set(row.matricula, existingStudent || {
      id: randomUUID(),
      studentNumber: row.matricula,
      enrollments: [],
    })
  }

  return persistedByMatricula
}

function buildEnrollmentMap(persistedByMatricula: Map<string, PersistedStudent>): Map<string, string> {
  const enrollmentIdByStudentId = new Map<string, string>()

  for (const student of persistedByMatricula.values()) {
    enrollmentIdByStudentId.set(student.id, student.enrollments[0]?.id || randomUUID())
  }

  return enrollmentIdByStudentId
}

function buildStudentsToCreate(
  rows: StudentImportRowResult[],
  existingByMatricula: Map<string, ExistingStudentWithEnrollments>,
  persistedByMatricula: Map<string, PersistedStudent>,
  classRecord: { id: string; schoolId: string }
): Prisma.StudentCreateManyInput[] {
  return rows
    .filter(isImportedRow)
    .filter((row) => !existingByMatricula.has(row.matricula))
    .map((row) => {
      const student = getPersistedStudent(row, persistedByMatricula)
      return {
        id: student.id,
        name: row.name,
        studentNumber: row.matricula,
        schoolId: classRecord.schoolId,
        classId: classRecord.id,
      }
    })
}

function buildEnrollmentsToCreate(
  rows: StudentImportRowResult[],
  persistedByMatricula: Map<string, PersistedStudent>,
  enrollmentIdByStudentId: Map<string, string>,
  classId: string,
  startedAt: Date
): Prisma.StudentEnrollmentCreateManyInput[] {
  return rows
    .filter(isImportedRow)
    .map((row) => getPersistedStudent(row, persistedByMatricula))
    .filter((student) => !student.enrollments.some((enrollment) => enrollment.classId === classId))
    .map((student) => ({
      id: getEnrollmentId(student.id, enrollmentIdByStudentId),
      studentId: student.id,
      classId,
      startedAt,
    }))
}

function buildAssessmentsToCreate(
  rows: StudentImportRowResult[],
  persistedByMatricula: Map<string, PersistedStudent>,
  enrollmentIdByStudentId: Map<string, string>,
  userId: string,
  assessmentIdsByCell: Map<string, string>
): Prisma.StudentAssessmentCreateManyInput[] {
  return rows.filter(isImportedRow).flatMap((row) => {
    const student = getPersistedStudent(row, persistedByMatricula)
    const enrollmentId = getEnrollmentId(student.id, enrollmentIdByStudentId)

    return row.cells.filter(isImportedCell).map((cell) => {
      const recordedAt = parseDateInput(cell.recordedAt)
      if (!recordedAt) throw new Error(`Invalid generated assessment date: ${cell.recordedAt}`)

      const id = randomUUID()
      assessmentIdsByCell.set(getCellKey(row.rowId, cell.month), id)
      return {
        id,
        studentId: student.id,
        enrollmentId,
        assessmentTypeId: cell.assessmentTypeId,
        assessmentLevelId: cell.readingLevelId,
        userId,
        recordedAt,
      }
    })
  })
}

function addPersistedIdsToRow(
  row: StudentImportRowResult,
  persistedByMatricula: Map<string, PersistedStudent>,
  assessmentIdsByCell: Map<string, string>
): StudentImportRowResult {
  if (row.status !== 'imported') return row

  const student = getPersistedStudent(row, persistedByMatricula)
  return {
    ...row,
    studentId: student.id,
    cells: row.cells.map((cell) => ({
      ...cell,
      assessmentId: assessmentIdsByCell.get(getCellKey(row.rowId, cell.month)) || cell.assessmentId,
    })),
  }
}

function getPersistedStudent(
  row: StudentImportRowResult,
  persistedByMatricula: Map<string, PersistedStudent>
): PersistedStudent {
  const student = persistedByMatricula.get(row.matricula)
  if (!student) throw new Error(`Missing persisted student for matrícula "${row.matricula}".`)
  return student
}

function getEnrollmentId(studentId: string, enrollmentIdByStudentId: Map<string, string>): string {
  const enrollmentId = enrollmentIdByStudentId.get(studentId)
  if (!enrollmentId) throw new Error(`Missing enrollment for student "${studentId}".`)
  return enrollmentId
}

function getCellKey(rowId: string, month: string): string {
  return `${rowId}:${month}`
}

function isImportedRow(row: StudentImportRowResult): boolean {
  return row.status === 'imported'
}

function isImportedCell(
  cell: StudentImportCellResult
): cell is StudentImportCellResult & {
  status: 'imported'
  readingLevelId: string
  assessmentTypeId: string
  recordedAt: string
} {
  return cell.status === 'imported' && Boolean(cell.readingLevelId && cell.assessmentTypeId && cell.recordedAt)
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
