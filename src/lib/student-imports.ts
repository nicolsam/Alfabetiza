import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'

export const MIN_STUDENT_IMPORT_GRID_ROWS = 1
export const STUDENT_IMPORT_ROW_GROWTH_SIZE = 5
export const STUDENT_IMPORT_ROW_GROWTH_BUFFER = 3
export const MAX_STUDENT_IMPORT_ROWS = 500

export type StudentImportCellStatus = 'imported' | 'skipped' | 'invalid' | 'incomplete'

export type StudentImportClass = {
  id: string
  schoolId: string
  academicYear: number
  grade?: string | null
}

export type StudentImportLevel = {
  id: string
  code: string
  name: string
  assessmentTypeId: string
  color?: string | null
  backgroundColor?: string | null
  textColor?: string | null
}

export type StudentImportExistingStudent = {
  id: string
  name: string
  studentNumber: string
  schoolId: string
}

export type StudentImportGridRow = {
  rowId: string
  matricula: string
  name: string
  levelsByMonth: Record<string, string>
}

export type StudentImportCellResult = {
  month: string
  status: StudentImportCellStatus
  message: string
  readingLevelInput: string
  readingLevelId: string | null
  readingLevelCode: string | null
  assessmentTypeId: string | null
  referenceMonth: string | null
  assessmentId?: string
}

export type StudentImportRowResult = {
  rowId: string
  matricula: string
  name: string
  status: StudentImportCellStatus
  message: string
  studentId: string | null
  createdStudent: boolean
  cells: StudentImportCellResult[]
}

export type StudentImportSummary = {
  totalRows: number
  importedRows: number
  importedCells: number
  createdStudents: number
  reusedStudents: number
  skippedRows: number
  invalidRows: number
  incompleteRows: number
}

export type StudentImportCommitResult = {
  summary: StudentImportSummary
  rows: StudentImportRowResult[]
}

type MonthParseResult =
  | { ok: true; month: number; monthKey: string; referenceMonth: string }
  | { ok: false; message: string }

type HeaderMapping = {
  matricula?: number
  name?: number
  monthColumns: { index: number; monthKey: string }[]
}

export function normalizeImportText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeImportLookupKey(value: unknown): string {
  return normalizeImportText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function buildStudentImportDraftKey(
  userId: string | undefined,
  classId: string,
  assessmentTypeCode = READING_ASSESSMENT_TYPE_CODE
): string {
  return `student-import:v2:${userId || 'anonymous'}:${classId || 'no-class'}:${assessmentTypeCode}`
}

export function createBlankStudentImportRows(
  count = MIN_STUDENT_IMPORT_GRID_ROWS,
  startIndex = 0
): StudentImportGridRow[] {
  return Array.from({ length: count }, (_, index) => createBlankStudentImportRow(startIndex + index))
}

export function createBlankStudentImportRow(index: number): StudentImportGridRow {
  return {
    rowId: `row-${index}-${Math.random().toString(36).slice(2, 9)}`,
    matricula: '',
    name: '',
    levelsByMonth: {},
  }
}

export function ensureGridHasBlankRows(rows: StudentImportGridRow[]): StudentImportGridRow[] {
  if (rows.length >= MIN_STUDENT_IMPORT_GRID_ROWS) return rows
  return [
    ...rows,
    ...createBlankStudentImportRows(MIN_STUDENT_IMPORT_GRID_ROWS - rows.length, rows.length),
  ]
}

export function growRowsAfterEdit(rows: StudentImportGridRow[], editedIndex: number): StudentImportGridRow[] {
  if (rows.length >= MAX_STUDENT_IMPORT_ROWS) return rows
  if (editedIndex < rows.length - STUDENT_IMPORT_ROW_GROWTH_BUFFER) return rows

  const nextCount = Math.min(STUDENT_IMPORT_ROW_GROWTH_SIZE, MAX_STUDENT_IMPORT_ROWS - rows.length)
  return [...rows, ...createBlankStudentImportRows(nextCount, rows.length)]
}

export function hasStudentImportRowValue(row: StudentImportGridRow): boolean {
  return Boolean(row.matricula.trim() || row.name.trim() || Object.values(row.levelsByMonth).some((value) => value.trim()))
}

export function hasStudentImportRowLevel(row: StudentImportGridRow): boolean {
  return Object.values(row.levelsByMonth).some((value) => value.trim())
}

export function compactImportedRows(
  rows: StudentImportGridRow[],
  results: StudentImportRowResult[]
): StudentImportGridRow[] {
  const resultByRowId = new Map(results.map((result) => [result.rowId, result]))

  const compacted = rows.flatMap((row) => {
    const result = resultByRowId.get(row.rowId)
    if (!result) return [row]

    const importedMonths = new Set(
      result.cells
        .filter((cell) => cell.status === 'imported')
        .map((cell) => cell.month)
    )

    if (importedMonths.size === 0) return [row]

    const levelsByMonth = { ...row.levelsByMonth }
    for (const month of importedMonths) {
      delete levelsByMonth[month]
    }

    const nextRow = { ...row, levelsByMonth }
    return hasStudentImportRowLevel(nextRow) ? [nextRow] : []
  }).filter(hasStudentImportRowValue)

  return ensureGridHasBlankRows(compacted)
}

export function parseImportMonth(
  value: string,
  academicYear: number,
  fallbackMonthKey: string,
  now = new Date()
): MonthParseResult {
  const trimmedValue = value.trim()
  return parseImportMonthKey(trimmedValue || fallbackMonthKey, academicYear, now)
}

export function parseImportMonthKey(value: string, academicYear: number, now = new Date()): MonthParseResult {
  const month = resolveImportMonthNumber(value)
  if (!month) {
    return {
      ok: false,
      message: `Invalid month "${value}". Expected values like FEB, FEV, March, Março, 02, or 02/${academicYear}.`,
    }
  }

  const explicitYear = getExplicitYear(value)
  const year = explicitYear || academicYear
  if (year !== academicYear) {
    return { ok: false, message: `Month "${value}" must belong to academic year ${academicYear}.` }
  }

  const date = new Date(academicYear, month - 1, 1)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  if (date > currentMonthStart) return { ok: false, message: 'Reading month cannot be in the future.' }

  return {
    ok: true,
    month,
    monthKey: `${String(month).padStart(2, '0')}/${academicYear}`,
    referenceMonth: `${String(month).padStart(2, '0')}/${academicYear}`,
  }
}

export function matchStudentImportLevel(
  levels: StudentImportLevel[],
  input: string
): StudentImportLevel | null {
  return buildLevelMatcher(levels).get(normalizeImportLookupKey(input)) || null
}

export function parseStudentImportClipboard(input: {
  text: string
  months: string[]
  focusedMonth: string
  academicYear: number
}): { rows: StudentImportGridRow[]; months: string[] } {
  const parsedRows = input.text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean))

  if (parsedRows.length === 0) return { rows: [], months: input.months }

  const headerMapping = getClipboardHeaderMapping(parsedRows[0], input.academicYear)
  if (headerMapping) {
    const months = mergeMonths(input.months, headerMapping.monthColumns.map((column) => column.monthKey))
    return {
      months,
      rows: parsedRows.slice(1).map((row, index) => buildRowFromHeaderMapping(row, headerMapping, index)),
    }
  }

  return {
    months: input.months,
    rows: parsedRows.map((row, index) => buildRowFromFocusedMonth(row, input.focusedMonth, index)),
  }
}

export function buildStudentImportCommitResult(input: {
  rows: StudentImportGridRow[]
  months: string[]
  classRecord: StudentImportClass
  levels: StudentImportLevel[]
  existingStudents: StudentImportExistingStudent[]
  now?: Date
}): StudentImportCommitResult {
  const existingByMatricula = new Map(
    input.existingStudents
      .filter((student) => student.schoolId === input.classRecord.schoolId)
      .map((student) => [normalizeMatriculaLookupKey(student.studentNumber), student])
  )
  const levelMatcher = buildLevelMatcher(input.levels)
  const parsedMonths = new Map(input.months.map((month) => [month, parseImportMonthKey(month, input.classRecord.academicYear, input.now)]))
  const duplicateMatriculas = findDuplicateMatriculas(input.rows)

  const results = input.rows
    .filter(hasStudentImportRowValue)
    .map((row) => {
      const matricula = row.matricula.trim()
      const matriculaKey = normalizeMatriculaLookupKey(matricula)

      return buildValidatedRowResult({
        row,
        months: input.months,
        classRecord: input.classRecord,
        parsedMonths,
        existingStudent: existingByMatricula.get(matriculaKey) || null,
        levelMatcher,
        isDuplicateRow: duplicateMatriculas.has(matriculaKey),
      })
    })

  return {
    summary: summarizeCommitRows(results),
    rows: results,
  }
}

function buildValidatedRowResult(input: {
  row: StudentImportGridRow
  months: string[]
  classRecord: StudentImportClass
  parsedMonths: Map<string, MonthParseResult>
  existingStudent: StudentImportExistingStudent | null
  levelMatcher: Map<string, StudentImportLevel>
  isDuplicateRow: boolean
}): StudentImportRowResult {
  const matricula = input.row.matricula.trim()
  const name = input.row.name.trim()
  const hasAnyLevel = hasStudentImportRowLevel(input.row)

  if (!hasAnyLevel) {
    return toRowResult(input.row, 'skipped', 'No reading levels filled.', input.existingStudent, false, [])
  }

  if (!matricula) {
    return toRowResult(input.row, 'incomplete', 'Matrícula is required when any month has a reading level.', null, false, [])
  }

  if (!name) {
    return toRowResult(input.row, 'incomplete', 'Student name is required.', input.existingStudent, false, [])
  }

  if (!input.existingStudent && !input.classRecord.grade?.trim()) {
    return toRowResult(
      input.row,
      'incomplete',
      'Class grade is required before importing initial reading assessments.',
      null,
      false,
      []
    )
  }

  if (input.isDuplicateRow) {
    return toRowResult(input.row, 'invalid', `Duplicate matrícula "${matricula}" in this grid.`, input.existingStudent, false, [])
  }

  const cells = input.months
    .filter((month) => input.row.levelsByMonth[month]?.trim())
    .map((month) => buildValidatedCell(input.row.levelsByMonth[month], month, input.parsedMonths, input.levelMatcher))

  if (cells.some((cell) => cell.status === 'invalid')) {
    return toRowResult(input.row, 'invalid', 'One or more month cells are invalid.', input.existingStudent, false, cells)
  }

  const message = input.existingStudent
    ? 'Existing student found in this school; ready to append assessments.'
    : 'Ready to import.'

  return toRowResult(input.row, 'imported', message, input.existingStudent, !input.existingStudent, cells)
}

function buildValidatedCell(
  levelInput: string,
  month: string,
  parsedMonths: Map<string, MonthParseResult>,
  levelMatcher: Map<string, StudentImportLevel>
): StudentImportCellResult {
  const parsedMonth = parsedMonths.get(month)
  if (!parsedMonth?.ok) {
    return {
      month,
      status: 'invalid',
      message: parsedMonth?.message || `Invalid month "${month}".`,
      readingLevelInput: levelInput,
      readingLevelId: null,
      readingLevelCode: null,
      assessmentTypeId: null,
      referenceMonth: null,
    }
  }

  const level = levelMatcher.get(normalizeImportLookupKey(levelInput))
  if (!level) {
    return {
      month,
      status: 'invalid',
      message: `Invalid reading level "${levelInput}".`,
      readingLevelInput: levelInput,
      readingLevelId: null,
      readingLevelCode: null,
      assessmentTypeId: null,
      referenceMonth: parsedMonth.referenceMonth,
    }
  }

  return {
    month,
    status: 'imported',
    message: 'Ready to import.',
    readingLevelInput: levelInput,
    readingLevelId: level.id,
    readingLevelCode: level.code,
    assessmentTypeId: level.assessmentTypeId,
    referenceMonth: parsedMonth.referenceMonth,
  }
}

function toRowResult(
  row: StudentImportGridRow,
  status: StudentImportCellStatus,
  message: string,
  existingStudent: StudentImportExistingStudent | null,
  createdStudent: boolean,
  cells: StudentImportCellResult[]
): StudentImportRowResult {
  return {
    rowId: row.rowId,
    matricula: row.matricula.trim(),
    name: row.name.trim(),
    status,
    message,
    studentId: existingStudent?.id || null,
    createdStudent,
    cells,
  }
}

function summarizeCommitRows(rows: StudentImportRowResult[]): StudentImportSummary {
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

function getClipboardHeaderMapping(row: string[], academicYear: number): HeaderMapping | null {
  const mapping = row.reduce<HeaderMapping>((result, cell, index) => {
    const key = normalizeImportLookupKey(cell)
    if (isMatriculaHeader(key) && result.matricula === undefined) return { ...result, matricula: index }
    if (isNameHeader(key) && result.name === undefined) return { ...result, name: index }

    const month = parseImportMonthKey(cell, academicYear)
    if (month.ok) return { ...result, monthColumns: [...result.monthColumns, { index, monthKey: month.monthKey }] }

    return result
  }, { monthColumns: [] })

  if (mapping.matricula === undefined && mapping.name === undefined && mapping.monthColumns.length === 0) return null
  return mapping
}

function buildRowFromHeaderMapping(row: string[], mapping: HeaderMapping, index: number): StudentImportGridRow {
  return {
    ...createBlankStudentImportRow(index),
    matricula: mapping.matricula === undefined ? '' : row[mapping.matricula] || '',
    name: mapping.name === undefined ? '' : row[mapping.name] || '',
    levelsByMonth: mapping.monthColumns.reduce<Record<string, string>>((levelsByMonth, column) => {
      levelsByMonth[column.monthKey] = row[column.index] || ''
      return levelsByMonth
    }, {}),
  }
}

function buildRowFromFocusedMonth(row: string[], focusedMonth: string, index: number): StudentImportGridRow {
  const [first = '', second = '', third = ''] = row
  const firstLooksLikeMatricula = /[0-9]/.test(first) || first.length <= second.length

  return {
    ...createBlankStudentImportRow(index),
    matricula: firstLooksLikeMatricula ? first : second,
    name: firstLooksLikeMatricula ? second : first,
    levelsByMonth: { [focusedMonth]: third },
  }
}

function mergeMonths(currentMonths: string[], pastedMonths: string[]): string[] {
  return Array.from(new Set([...currentMonths, ...pastedMonths]))
}

function isMatriculaHeader(key: string): boolean {
  return [
    'matricula',
    'enrollmentid',
    'enrollmentnumber',
    'studentnumber',
    'numerodoaluno',
    'numeroaluno',
    'numero',
  ].includes(key)
}

function isNameHeader(key: string): boolean {
  return ['name', 'nome', 'studentname', 'nomealuno', 'nomedoaluno', 'aluno'].includes(key)
}

function buildLevelMatcher(levels: StudentImportLevel[]): Map<string, StudentImportLevel> {
  const matcher = new Map<string, StudentImportLevel>()

  for (const level of levels) {
    addLevelAlias(matcher, level.code, level)
    addLevelAlias(matcher, level.name, level)

    for (const alias of READING_LEVEL_ALIASES[level.code] || []) {
      addLevelAlias(matcher, alias, level)
    }
  }

  return matcher
}

function addLevelAlias(matcher: Map<string, StudentImportLevel>, alias: string, level: StudentImportLevel) {
  const key = normalizeImportLookupKey(alias)
  if (key) matcher.set(key, level)
}

function normalizeMatriculaLookupKey(value: unknown): string {
  return normalizeImportText(value).toLowerCase()
}

function findDuplicateMatriculas(rows: StudentImportGridRow[]): Set<string> {
  const counts = new Map<string, number>()

  for (const row of rows.filter(hasStudentImportRowValue)) {
    const matriculaKey = normalizeMatriculaLookupKey(row.matricula)
    if (matriculaKey) counts.set(matriculaKey, (counts.get(matriculaKey) || 0) + 1)
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([matricula]) => matricula)
  )
}

function resolveImportMonthNumber(value: string): number | null {
  const rawValue = value.trim()
  const monthKey = /^(\d{1,2})\/\d{4}$/.exec(rawValue)
  if (monthKey) return toMonthNumber(monthKey[1])

  const htmlMonth = /^\d{4}-(\d{1,2})$/.exec(rawValue)
  if (htmlMonth) return toMonthNumber(htmlMonth[1])

  return MONTH_ALIASES.get(normalizeImportLookupKey(rawValue)) || null
}

function getExplicitYear(value: string): number | null {
  const monthKey = /^\d{1,2}\/(\d{4})$/.exec(value.trim())
  if (monthKey) return Number(monthKey[1])

  const htmlMonth = /^(\d{4})-\d{1,2}$/.exec(value.trim())
  if (htmlMonth) return Number(htmlMonth[1])

  return null
}

function toMonthNumber(value: string): number | null {
  const month = Number(value)
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null
}

const MONTH_ALIASES = new Map<string, number>([
  ['1', 1], ['01', 1], ['jan', 1], ['january', 1], ['janeiro', 1],
  ['2', 2], ['02', 2], ['feb', 2], ['fev', 2], ['february', 2], ['fevereiro', 2],
  ['3', 3], ['03', 3], ['mar', 3], ['march', 3], ['marco', 3],
  ['4', 4], ['04', 4], ['apr', 4], ['abr', 4], ['april', 4], ['abril', 4],
  ['5', 5], ['05', 5], ['may', 5], ['mai', 5], ['maio', 5],
  ['6', 6], ['06', 6], ['jun', 6], ['june', 6], ['junho', 6],
  ['7', 7], ['07', 7], ['jul', 7], ['july', 7], ['julho', 7],
  ['8', 8], ['08', 8], ['aug', 8], ['ago', 8], ['august', 8], ['agosto', 8],
  ['9', 9], ['09', 9], ['sep', 9], ['set', 9], ['sept', 9], ['september', 9], ['setembro', 9],
  ['10', 10], ['oct', 10], ['out', 10], ['october', 10], ['outubro', 10],
  ['11', 11], ['nov', 11], ['november', 11], ['novembro', 11],
  ['12', 12], ['dec', 12], ['dez', 12], ['december', 12], ['dezembro', 12],
])

const READING_LEVEL_ALIASES: Record<string, string[]> = {
  DNI: ['doesnotidentify', 'naoidentifica', 'naoidentificar', 'naoidentificou'],
  LO: ['lettersonly', 'apenasletras', 'soletras'],
  SO: ['syllablesonly', 'apenassilabas', 'sosilabas'],
  RW: ['readswords', 'lepalavras'],
  RS: ['readssentences', 'lefrases'],
  RTS: ['readstextsyllabically', 'letextosilabando', 'letextosilabico'],
  RTF: ['readstextfluently', 'letextocomfluencia', 'lefluentemente'],
}
