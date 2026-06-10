import { describe, expect, it } from 'vitest'

import {
  buildStudentImportCommitResult,
  buildStudentImportDraftKey,
  compactImportedRows,
  createBlankStudentImportRows,
  growRowsAfterEdit,
  matchStudentImportLevel,
  parseImportMonth,
  parseStudentImportClipboard,
  type StudentImportGridRow,
  type StudentImportLevel,
} from '@/lib/student-imports'

const levels: StudentImportLevel[] = [
  { id: 'level-dni', code: 'DNI', name: 'Does Not Identify', assessmentTypeId: 'reading-type' },
  { id: 'level-rw', code: 'RW', name: 'Reads Words', assessmentTypeId: 'reading-type' },
  { id: 'level-rs', code: 'RS', name: 'Reads Sentences', assessmentTypeId: 'reading-type' },
]

describe('student imports', () => {
  it('builds a draft key scoped by user, class, and assessment type', () => {
    expect(buildStudentImportDraftKey('user-1', 'class-1')).toBe('student-import:v2:user-1:class-1:READING')
  })

  it('parses English and Portuguese month labels with the selected academic year', () => {
    expect(parseImportMonth('FEB', 2026, '01/2026', new Date(2026, 4, 26))).toMatchObject({
      ok: true,
      monthKey: '02/2026',
      recordedAt: '2026-02-01',
    })

    expect(parseImportMonth('Março', 2026, '01/2026', new Date(2026, 4, 26))).toMatchObject({
      ok: true,
      monthKey: '03/2026',
      recordedAt: '2026-03-01',
    })
  })

  it('rejects future reading months', () => {
    expect(parseImportMonth('JUN', 2026, '04/2026', new Date(2026, 4, 26))).toMatchObject({
      ok: false,
      message: 'Reading month cannot be in the future.',
    })
  })

  it('matches reading levels by code or localized name', () => {
    expect(matchStudentImportLevel(levels, 'RW')?.id).toBe('level-rw')
    expect(matchStudentImportLevel(levels, 'Lê Frases')?.id).toBe('level-rs')
    expect(matchStudentImportLevel(levels, 'Unknown')).toBeNull()
  })

  it('parses pasted rows with bilingual headers and month columns', () => {
    const parsed = parseStudentImportClipboard({
      text: [
        'Matrícula\tNome\tFEV\tMarço',
        'MAT-1\tAna\tRW\tLê Frases',
      ].join('\n'),
      months: ['01/2026'],
      focusedMonth: '01/2026',
      academicYear: 2026,
    })

    expect(parsed.months).toEqual(['01/2026', '02/2026', '03/2026'])
    expect(parsed.rows[0]).toMatchObject({
      matricula: 'MAT-1',
      name: 'Ana',
      levelsByMonth: {
        '02/2026': 'RW',
        '03/2026': 'Lê Frases',
      },
    })
  })

  it('parses pasted rows without headers into the focused month', () => {
    const parsed = parseStudentImportClipboard({
      text: 'MAT-1\tAna\tRW',
      months: ['02/2026'],
      focusedMonth: '02/2026',
      academicYear: 2026,
    })

    expect(parsed.rows[0]).toMatchObject({
      matricula: 'MAT-1',
      name: 'Ana',
      levelsByMonth: { '02/2026': 'RW' },
    })
  })

  it('auto-grows rows near the end of the grid', () => {
    const rows = createBlankStudentImportRows(10)

    expect(growRowsAfterEdit(rows, 2)).toHaveLength(10)
    expect(growRowsAfterEdit(rows, 8)).toHaveLength(15)
  })

  it('validates multi-month grid rows and reuses existing students', () => {
    const rows: StudentImportGridRow[] = [
      { rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW', '03/2026': 'Lê Frases' } },
      { rowId: 'row-2', matricula: 'MAT-2', name: '', levelsByMonth: { '02/2026': 'RW' } },
      { rowId: 'row-3', matricula: 'MAT-3', name: 'Caio', levelsByMonth: { '02/2026': 'Unknown' } },
    ]

    const result = buildStudentImportCommitResult({
      rows,
      months: ['02/2026', '03/2026'],
      classRecord: { id: 'class-1', schoolId: 'school-1', academicYear: 2026, grade: '2' },
      levels,
      existingStudents: [{ id: 'student-1', name: 'Ana', studentNumber: 'MAT-1', schoolId: 'school-1' }],
      now: new Date(2026, 4, 26),
    })

    expect(result.summary).toMatchObject({
      totalRows: 3,
      importedRows: 1,
      importedCells: 2,
      reusedStudents: 1,
      incompleteRows: 1,
      invalidRows: 1,
    })
    expect(result.rows[0].cells).toHaveLength(2)
    expect(result.rows[1].message).toContain('Student name is required')
    expect(result.rows[2].status).toBe('invalid')
  })

  it('requires class grade before creating initial assessments for new students', () => {
    const result = buildStudentImportCommitResult({
      rows: [
        { rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } },
      ],
      months: ['02/2026'],
      classRecord: { id: 'class-1', schoolId: 'school-1', academicYear: 2026, grade: '' },
      levels,
      existingStudents: [],
      now: new Date(2026, 4, 26),
    })

    expect(result.summary).toMatchObject({ importedRows: 0, incompleteRows: 1 })
    expect(result.rows[0].message).toContain('Class grade is required')
  })

  it('validates duplicated matrícula values inside the grid', () => {
    const result = buildStudentImportCommitResult({
      rows: [
        { rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW' } },
        { rowId: 'row-2', matricula: 'mat-1', name: 'Bia', levelsByMonth: { '02/2026': 'RW' } },
      ],
      months: ['02/2026'],
      classRecord: { id: 'class-1', schoolId: 'school-1', academicYear: 2026, grade: '2' },
      levels,
      existingStudents: [],
      now: new Date(2026, 4, 26),
    })

    expect(result.summary).toMatchObject({ importedRows: 0, invalidRows: 2 })
    expect(result.rows[0].message).toContain('Duplicate matrícula')
    expect(result.rows[1].message).toContain('Duplicate matrícula')
  })

  it('clears imported cells from drafts and keeps unresolved work', () => {
    const rows: StudentImportGridRow[] = [
      { rowId: 'row-1', matricula: 'MAT-1', name: 'Ana', levelsByMonth: { '02/2026': 'RW', '03/2026': 'RS' } },
      { rowId: 'row-2', matricula: 'MAT-2', name: '', levelsByMonth: { '02/2026': 'RW' } },
    ]

    const nextRows = compactImportedRows(rows, [
      {
        rowId: 'row-1',
        matricula: 'MAT-1',
        name: 'Ana',
        status: 'imported',
        message: 'Imported.',
        studentId: 'student-1',
        createdStudent: true,
        cells: [
          { month: '02/2026', status: 'imported', message: '', readingLevelInput: 'RW', readingLevelId: 'level-rw', readingLevelCode: 'RW', assessmentTypeId: 'reading-type', recordedAt: '2026-02-01' },
          { month: '03/2026', status: 'imported', message: '', readingLevelInput: 'RS', readingLevelId: 'level-rs', readingLevelCode: 'RS', assessmentTypeId: 'reading-type', recordedAt: '2026-03-01' },
        ],
      },
    ])

    expect(nextRows.some((row) => row.rowId === 'row-1')).toBe(false)
    expect(nextRows.some((row) => row.rowId === 'row-2')).toBe(true)
    expect(nextRows.length).toBeGreaterThanOrEqual(10)
  })
})
