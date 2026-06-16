'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  buildMonthKey,
  getAvailableMonthOptions,
  getMonthPartFromMonthKey,
  getYearFromMonthKey,
} from '@/lib/monthly-updates'
import {
  buildStudentImportDraftKey,
  compactImportedRows,
  createBlankStudentImportRows,
  ensureGridHasBlankRows,
  hasStudentImportRowLevel,
  hasStudentImportRowValue,
  matchStudentImportLevel,
  parseStudentImportClipboard,
  type StudentImportCommitResult,
  type StudentImportGridRow,
  type StudentImportSummary,
} from '@/lib/student-imports'
import { FileSpreadsheet, Maximize2, Minimize2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState, type ClipboardEvent } from 'react'

type ClassRecord = {
  id: string
  grade: string
  section: string
  shift: string
  academicYear: number
  schoolId: string
}

type ReadingLevel = {
  id: string
  code: string
  name: string
  order: number
  color?: string | null
  backgroundColor?: string | null
  textColor?: string | null
}

type CompilationLevelCell = {
  levelInput: string
  level: ReadingLevel | null
}

type CompilationRow = {
  rowId: string
  rowIndex: number
  matricula: string
  name: string
  levelsByMonth: Record<string, CompilationLevelCell | undefined>
}

type SavedDraft = {
  months: string[]
  rows: StudentImportGridRow[]
}

export type StudentImportResultSummary = StudentImportSummary

type Props = {
  classes: ClassRecord[]
  levels: ReadingLevel[]
  userId?: string
  formatClassName: (classRecord?: ClassRecord) => string
  initialMonth: string
  onCancel: () => void
  onImported: (summary: StudentImportResultSummary) => Promise<void> | void
}

export default function StudentImportModal({
  classes,
  levels,
  userId,
  formatClassName,
  initialMonth,
  onCancel,
  onImported,
}: Props) {
  const t = useTranslations('students')
  const tClasses = useTranslations('classes')
  const tCommon = useTranslations('common')
  const tLevels = useTranslations('levels')
  const locale = useLocale()
  const getLevelLabel = (level: ReadingLevel) => tLevels(level.code)
  const getLevelShortLabel = (level: ReadingLevel) => tLevels(`short.${level.code}`)

  const initialClassId = classes[0]?.id || ''
  const initialClass = classes.find((classRecord) => classRecord.id === initialClassId)
  const initialDefaultMonth = initialClass ? resolveDefaultImportMonth(initialClass, initialMonth) : ''
  const initialDraft = readSavedDraft(userId, initialClassId)

  const [selectedClassId, setSelectedClassId] = useState(initialClassId)
  const [months, setMonths] = useState(() => initialDraft?.months.length ? initialDraft.months : [initialDefaultMonth].filter(Boolean))
  const [rows, setRows] = useState(() => ensureGridHasBlankRows(initialDraft?.rows || createBlankStudentImportRows()))
  const [focusedMonth, setFocusedMonth] = useState(() => months[0] || initialDefaultMonth)
  const [error, setError] = useState('')
  const [result, setResult] = useState<StudentImportCommitResult | null>(null)
  const [committing, setCommitting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const selectedClass = classes.find((classRecord) => classRecord.id === selectedClassId)
  const availableMonths = selectedClass ? getAvailableMonthOptions(selectedClass.academicYear) : []
  const activeMonth = focusedMonth || months[0] || initialDefaultMonth
  const importMonths = useMemo(() => getFilledMonthKeys(rows, months), [rows, months])
  const compilationRows = useMemo(
    () => buildCompilationRows(rows, importMonths, levels),
    [rows, importMonths, levels]
  )
  const filledRows = rows.filter(hasStudentImportRowValue).length
  const filledCells = countCompilationCells(compilationRows, importMonths)
  const canImport = Boolean(selectedClassId && importMonths.length > 0 && filledCells > 0 && !committing)

  const saveDraft = (nextRows: StudentImportGridRow[], nextMonths: string[], classId = selectedClassId) => {
    writeSavedDraft(userId, classId, { rows: nextRows, months: nextMonths })
  }

  const setDraft = (nextRows: StudentImportGridRow[], nextMonths = months, nextFocusedMonth?: string) => {
    const safeRows = nextRows
    setRows(safeRows)
    setMonths(nextMonths)
    if (nextFocusedMonth) {
      setFocusedMonth(nextFocusedMonth)
    } else {
      setFocusedMonth((currentMonth) => nextMonths.includes(currentMonth) ? currentMonth : nextMonths[0] || '')
    }
    setResult(null)
    setError('')
    saveDraft(safeRows, nextMonths)
  }

  const handleClassChange = (classId: string) => {
    const classRecord = classes.find((candidate) => candidate.id === classId)
    const defaultMonth = classRecord ? resolveDefaultImportMonth(classRecord, initialMonth) : ''
    const savedDraft = readSavedDraft(userId, classId)
    const nextMonths = savedDraft?.months.length ? savedDraft.months : [defaultMonth].filter(Boolean)
    const nextRows = ensureGridHasBlankRows(savedDraft?.rows || createBlankStudentImportRows())

    setSelectedClassId(classId)
    setRows(nextRows)
    setMonths(nextMonths)
    setFocusedMonth(nextMonths[0] || defaultMonth)
    setResult(null)
    setError('')
  }

  const handleActiveMonthChange = (month: string) => {
    const nextMonths = months.includes(month) ? months : [...months, month]
    setDraft(rows, nextMonths, month)
  }

  const editCompilationCell = (rowIndex: number, month: string) => {
    const nextMonths = months.includes(month) ? months : [...months, month]
    const levelInput = rows[rowIndex]?.levelsByMonth[month]?.trim()
    setDraft(rows, nextMonths, month)
    window.requestAnimationFrame(() => {
      const escapedLevelInput = levelInput && typeof CSS !== 'undefined' ? CSS.escape(levelInput) : ''
      const preferredTarget = escapedLevelInput
        ? document.querySelector<HTMLElement>(`[data-testid="student-import-level-${rowIndex}-${escapedLevelInput}"]`)
        : null
      const target = preferredTarget || document.querySelector<HTMLElement>(
        `[data-testid="student-import-level-cell-${rowIndex}"] button, [data-testid="student-import-level-cell-${rowIndex}"] [role="combobox"]`
      )
      target?.scrollIntoView({ block: 'center', inline: 'nearest' })
      target?.focus()
    })
  }

  const updateRowField = (rowIndex: number, field: 'matricula' | 'name', value: string) => {
    const nextRows = rows.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row)
    setDraft(nextRows)
  }

  const updateRowLevel = (rowIndex: number, month: string, value: string) => {
    const nextRows = rows.map((row, index) => index === rowIndex ? {
      ...row,
      levelsByMonth: { ...row.levelsByMonth, [month]: value },
    } : row)
    setFocusedMonth(month)
    setDraft(nextRows)
  }

  const removeRow = (rowIndex: number) => {
    setDraft(rows.filter((_, index) => index !== rowIndex))
  }

  const addRow = () => {
    setDraft([...rows, createBlankStudentImportRows(1, rows.length)[0]])
  }

  const handlePaste = (event: ClipboardEvent, rowIndex: number, month: string) => {
    if (!selectedClass) return

    const text = event.clipboardData.getData('text/plain')
    const parsed = parseStudentImportClipboard({
      text,
      months,
      focusedMonth: month,
      academicYear: selectedClass.academicYear,
    })
    if (parsed.rows.length === 0) return

    event.preventDefault()
    const nextRows = [
      ...rows.slice(0, rowIndex),
      ...parsed.rows,
      ...rows.slice(rowIndex + parsed.rows.length),
    ]
    setDraft(nextRows, parsed.months, month)
  }

  const commitImport = async () => {
    const token = localStorage.getItem('token')
    if (!token || !selectedClassId || importMonths.length === 0) {
      setError(t('importMissingFields'))
      return
    }

    const duplicateMatricula = findDuplicateMatricula(rows)
    if (duplicateMatricula) {
      setError(t('importDuplicateMatricula', { matricula: duplicateMatricula }))
      return
    }

    setCommitting(true)
    setError('')

    const response = await fetch('/api/students/import/commit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedClassId,
        months: importMonths,
        rows: rows.filter(hasStudentImportRowValue),
      }),
    })
    const data = await response.json()

    setCommitting(false)
    if (!response.ok) {
      setError(data.error || t('importCommitError'))
      return
    }

    const importResult = data as StudentImportCommitResult
    const nextRows = compactImportedRows(rows, importResult.rows)
    setResult(importResult)
    setRows(nextRows)
    saveDraft(nextRows, importMonths)
    await onImported(importResult.summary)
  }

  return (
    <div className={`!mt-0 fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 ${expanded ? 'p-1 sm:p-2' : 'p-4'}`} data-app-modal="true">
      <div className={`max-h-[96vh] w-full overflow-y-auto rounded-lg bg-white shadow-xl ${expanded ? 'max-w-none p-3 sm:p-4' : 'max-w-7xl p-6'}`} data-testid="student-import-modal-panel" data-tour="student-import-modal">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onCancel}
          aria-label={tCommon('cancel')}
          className="sticky top-0 z-30 -mb-10 ml-auto flex bg-white shadow-sm"
          data-testid="student-import-close"
          data-tour="student-import-close"
        >
          <X className="size-4" />
        </Button>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 pr-12">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{t('importStudents')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('importGridDescription')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setExpanded((currentValue) => !currentValue)}
              aria-label={expanded ? t('importCollapseModal') : t('importExpandModal')}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <FileSpreadsheet className="size-8 text-blue-600" aria-hidden="true" />
          </div>
        </div>

        {error && <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-1" data-tour="student-import-class-field">
            <Label>{tClasses('selectClass')}</Label>
            <Select value={selectedClassId} onValueChange={handleClassChange}>
              <SelectTrigger className="w-full" data-testid="student-import-class">
                <SelectValue placeholder={tClasses('selectClass')} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((classRecord) => (
                  <SelectItem key={classRecord.id} value={classRecord.id}>
                    {formatClassName(classRecord)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {t('importGridAutosave')}
          </div>
        </div>

        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" data-tour="student-import-paste-help">
          <p className="font-medium text-gray-900">{t('importGridPasteTitle')}</p>
          <p className="mt-1">{t('importGridPasteDescription')}</p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4" data-tour="student-import-status-summary">
          <SummaryPill label={t('importFilledRows')} value={filledRows} tone="neutral" />
          <SummaryPill label={t('importFilledCells')} value={filledCells} tone="success" />
          <SummaryPill label={t('importCreatedStudents')} value={result?.summary.createdStudents || 0} tone="success" />
          <SummaryPill label={t('importIssueRows')} value={(result?.summary.invalidRows || 0) + (result?.summary.incompleteRows || 0)} tone="warning" />
        </div>

        <div className="mt-5 max-h-[48vh] overflow-auto rounded-md border border-gray-200" data-tour="student-import-grid">
          {rows.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center p-6 text-center text-sm text-gray-500">
              {t('importEmptyRows')}
            </div>
          ) : (
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[34%]" />
              <col className="w-[26%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                <th className="p-3 text-left text-gray-700">{t('studentNumber')}</th>
                <th className="p-3 text-left text-gray-700">{t('name')}</th>
                <th className="p-2 text-left text-gray-700" data-testid="student-import-active-month-header" data-tour="student-import-month-field">
                  <Select value={activeMonth} onValueChange={handleActiveMonthChange} disabled={!selectedClass}>
                    <SelectTrigger className="w-full border-gray-300 bg-white" data-testid="student-import-month">
                      <SelectValue placeholder={t('readingMonth')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMonths.map((month) => {
                        const monthKey = buildMonthKey(month.value, selectedClass?.academicYear || getYearFromMonthKey(initialMonth))
                        return (
                          <SelectItem key={month.value} value={monthKey}>
                            {formatMonthLabel(monthKey, locale)}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </th>
                <th className="p-3 text-left text-gray-700" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.rowId} className={hasStudentImportRowLevel(row) ? 'border-t bg-white' : 'border-t bg-gray-50/60'}>
                  <td className="p-2">
                    <Input
                      value={row.matricula}
                      onPaste={(event) => handlePaste(event, rowIndex, activeMonth)}
                      onChange={(event) => updateRowField(rowIndex, 'matricula', event.target.value)}
                      data-testid={`student-import-matricula-${rowIndex}`}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.name}
                      onPaste={(event) => handlePaste(event, rowIndex, activeMonth)}
                      onChange={(event) => updateRowField(rowIndex, 'name', event.target.value)}
                      data-testid={`student-import-name-${rowIndex}`}
                    />
                  </td>
                  <td className="p-2">
                    <ReadingLevelCell
                      levels={levels}
                      value={row.levelsByMonth[activeMonth] || ''}
                      rowIndex={rowIndex}
                      getLevelLabel={getLevelLabel}
                      getLevelShortLabel={getLevelShortLabel}
                      onFocus={() => setFocusedMonth(activeMonth)}
                      onPaste={(event) => handlePaste(event, rowIndex, activeMonth)}
                      onChange={(value) => updateRowLevel(rowIndex, activeMonth, value)}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(rowIndex)} aria-label={tCommon('delete')}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        <Button type="button" variant="ghost" className="mt-2 justify-start px-2 text-gray-600" onClick={addRow}>
          <Plus className="size-4" />
          {t('importAddStudent')}
        </Button>

        <CompilationTable
          rows={compilationRows}
          months={importMonths}
          locale={locale}
          emptyLabel={t('importCompilationEmpty')}
          getLevelLabel={getLevelLabel}
          getLevelShortLabel={getLevelShortLabel}
          onEdit={editCompilationCell}
          labels={{
            title: t('importCompilationTitle'),
            studentNumber: t('studentNumber'),
            name: t('name'),
            edit: t('importEditCell'),
          }}
        />

        {result && (
          <div className="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700">
            {t('importGridResult', {
              students: result.summary.importedRows,
              cells: result.summary.importedCells,
              issues: result.summary.invalidRows + result.summary.incompleteRows,
            })}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2" data-tour="student-import-actions">
          <Button type="button" variant="outline" onClick={onCancel} data-tour="student-import-cancel">
            {tCommon('cancel')}
          </Button>
          <Button type="button" onClick={commitImport} disabled={!canImport} data-testid="student-import-confirm">
            {committing ? t('importImporting') : t('importConfirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReadingLevelCell({
  levels,
  value,
  rowIndex,
  getLevelLabel,
  getLevelShortLabel,
  onFocus,
  onPaste,
  onChange,
}: {
  levels: ReadingLevel[]
  value: string
  rowIndex: number
  getLevelLabel: (level: ReadingLevel) => string
  getLevelShortLabel: (level: ReadingLevel) => string
  onFocus: () => void
  onPaste: (event: ClipboardEvent) => void
  onChange: (value: string) => void
}) {
  const selectedLevel = findReadingLevel(levels, value)
  const selectedLevelCode = selectedLevel?.code || ''

  return (
    <div data-testid={`student-import-level-cell-${rowIndex}`} data-tour={rowIndex === 0 ? 'student-import-level-picker' : undefined} onFocus={onFocus} onPaste={onPaste}>
      <div className="hidden flex-wrap gap-1 md:flex">
        {levels.map((level) => {
          const selected = selectedLevelCode === level.code
          return (
            <button
              key={level.id}
              type="button"
              title={getLevelLabel(level)}
              data-testid={`student-import-level-${rowIndex}-${level.code}`}
              onClick={() => onChange(selected ? '' : level.code)}
              className={`h-8 rounded border px-2 text-xs font-medium transition ${selected ? 'ring-2 ring-offset-1' : 'hover:opacity-80'}`}
              style={{
                borderColor: level.color || '#D1D5DB',
                backgroundColor: selected ? (level.backgroundColor || '#F3F4F6') : '#FFFFFF',
                color: level.textColor || '#374151',
              }}
            >
              {getLevelShortLabel(level)}
            </button>
          )
        })}
      </div>
      <div className="md:hidden">
        <Select value={selectedLevelCode || '__blank__'} onValueChange={(nextValue) => onChange(nextValue === '__blank__' ? '' : nextValue)}>
          <SelectTrigger
            className="w-full"
            style={{
              backgroundColor: selectedLevel?.backgroundColor || undefined,
              color: selectedLevel?.textColor || undefined,
              borderColor: selectedLevel?.color || undefined,
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__blank__">-</SelectItem>
            {levels.map((level) => (
              <SelectItem key={level.id} value={level.code}>
                {getLevelShortLabel(level)} - {getLevelLabel(level)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function CompilationTable({
  rows,
  months,
  locale,
  emptyLabel,
  labels,
  getLevelLabel,
  getLevelShortLabel,
  onEdit,
}: {
  rows: CompilationRow[]
  months: string[]
  locale: string
  emptyLabel: string
  labels: {
    title: string
    studentNumber: string
    name: string
    edit: string
  }
  getLevelLabel: (level: ReadingLevel) => string
  getLevelShortLabel: (level: ReadingLevel) => string
  onEdit: (rowIndex: number, month: string) => void
}) {
  return (
    <section className="mt-5" data-tour="student-import-summary">
      <h3 className="text-sm font-semibold text-gray-900">{labels.title}</h3>
      <div className="mt-2 overflow-auto rounded-md border border-gray-200">
        {rows.length === 0 || months.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center p-6 text-center text-sm text-gray-500">
            {emptyLabel}
          </div>
        ) : (
          <table
            className="w-full table-fixed text-sm"
            style={{ minWidth: `${Math.max(760, 420 + months.length * 240)}px` }}
          >
            <colgroup>
              <col style={{ width: '180px' }} />
              <col style={{ width: '240px' }} />
              {months.map((month) => (
                <col key={month} style={{ width: '240px' }} />
              ))}
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left text-gray-700">{labels.studentNumber}</th>
                <th className="p-3 text-left text-gray-700">{labels.name}</th>
                {months.map((month) => (
                  <th key={month} className="p-3 text-left text-gray-700">{formatMonthLabel(month, locale)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowId} className="border-t bg-white">
                  <td className="p-3 text-gray-700">{row.matricula || '-'}</td>
                  <td className="p-3 text-gray-700">{row.name || '-'}</td>
                  {months.map((month) => (
                    <td key={month} className="group min-w-0 p-2 align-middle">
                      <div className="flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1 transition group-hover:border-blue-200 group-hover:bg-blue-50 group-focus-within:border-blue-300 group-focus-within:bg-blue-50">
                        <CompilationLevelValue cell={row.levelsByMonth[month]} getLevelLabel={getLevelLabel} getLevelShortLabel={getLevelShortLabel} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
                          onClick={() => onEdit(row.rowIndex, month)}
                          aria-label={`${labels.edit} ${row.name || row.matricula || formatMonthLabel(month, locale)} ${formatMonthLabel(month, locale)}`}
                          data-testid={`student-import-edit-summary-${row.rowIndex}-${month}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function CompilationLevelValue({
  cell,
  getLevelLabel,
  getLevelShortLabel,
}: {
  cell: CompilationLevelCell | undefined
  getLevelLabel: (level: ReadingLevel) => string
  getLevelShortLabel: (level: ReadingLevel) => string
}) {
  if (!cell) return <span className="min-w-0 flex-1 text-gray-400">-</span>

  if (!cell.level) {
    return (
      <span className="min-w-0 flex-1 truncate text-gray-700" title={cell.levelInput}>
        {cell.levelInput}
      </span>
    )
  }

  return (
    <span
      className="min-w-0 flex-1 rounded border px-2 py-1 text-xs font-medium leading-snug"
      title={`${getLevelShortLabel(cell.level)} - ${getLevelLabel(cell.level)}`}
      style={{
        borderColor: cell.level.color || '#D1D5DB',
        backgroundColor: cell.level.backgroundColor || '#F3F4F6',
        color: cell.level.textColor || '#374151',
      }}
    >
      <span className="block min-w-0 truncate whitespace-nowrap">
        {getLevelShortLabel(cell.level)} - {getLevelLabel(cell.level)}
      </span>
    </span>
  )
}

function getFilledMonthKeys(rows: StudentImportGridRow[], knownMonths: string[]): string[] {
  const monthKeys = new Set(knownMonths.filter(Boolean))

  for (const row of rows) {
    for (const [month, level] of Object.entries(row.levelsByMonth)) {
      if (level.trim()) monthKeys.add(month)
    }
  }

  return Array.from(monthKeys).filter((month) => rows.some((row) => row.levelsByMonth[month]?.trim()))
    .sort(compareMonthKeys)
}

function buildCompilationRows(
  rows: StudentImportGridRow[],
  months: string[],
  levels: ReadingLevel[]
): CompilationRow[] {
  return rows.flatMap((row, rowIndex) => {
    const hasLevel = months.some((month) => row.levelsByMonth[month]?.trim())
    if (!hasLevel) return []

    return [{
      rowId: row.rowId,
      rowIndex,
      matricula: row.matricula.trim(),
      name: row.name.trim(),
      levelsByMonth: months.reduce<Record<string, CompilationLevelCell | undefined>>((levelsByMonth, month) => {
        const levelInput = row.levelsByMonth[month]?.trim()
        if (!levelInput) {
          levelsByMonth[month] = undefined
          return levelsByMonth
        }

        levelsByMonth[month] = {
          levelInput,
          level: findReadingLevel(levels, levelInput),
        }
        return levelsByMonth
      }, {}),
    }]
  })
}

function countCompilationCells(rows: CompilationRow[], months: string[]): number {
  return rows.reduce((total, row) => (
    total + months.filter((month) => row.levelsByMonth[month]?.levelInput).length
  ), 0)
}

function findReadingLevel(levels: ReadingLevel[], value: string): ReadingLevel | null {
  const matchedLevel = matchStudentImportLevel(
    levels.map((level) => ({ ...level, assessmentTypeId: '' })),
    value
  )
  if (!matchedLevel) return null
  return levels.find((level) => level.id === matchedLevel.id) || null
}

function compareMonthKeys(firstMonth: string, secondMonth: string): number {
  const [firstMonthValue, firstYearValue] = firstMonth.split('/').map(Number)
  const [secondMonthValue, secondYearValue] = secondMonth.split('/').map(Number)

  return firstYearValue - secondYearValue || firstMonthValue - secondMonthValue
}

function formatMonthLabel(monthKey: string, locale: string): string {
  const [monthValue, yearValue] = monthKey.split('/').map(Number)
  if (!monthValue || !yearValue) return monthKey

  const label = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(yearValue, monthValue - 1, 1))

  return label.charAt(0).toUpperCase() + label.slice(1)
}

function findDuplicateMatricula(rows: StudentImportGridRow[]): string | null {
  const seenMatriculas = new Map<string, string>()

  for (const row of rows.filter(hasStudentImportRowValue)) {
    const matricula = row.matricula.trim()
    const key = matricula.toLowerCase()
    if (!key) continue

    const existingMatricula = seenMatriculas.get(key)
    if (existingMatricula) return existingMatricula
    seenMatriculas.set(key, matricula)
  }

  return null
}

function resolveDefaultImportMonth(classRecord: ClassRecord, preferredMonth: string): string {
  const availableMonths = getAvailableMonthOptions(classRecord.academicYear)
  if (availableMonths.length === 0) return ''

  const preferredYear = getYearFromMonthKey(preferredMonth)
  const preferredMonthPart = getMonthPartFromMonthKey(preferredMonth)
  const hasPreferredMonth = availableMonths.some((month) => month.value === preferredMonthPart)

  if (preferredYear === classRecord.academicYear && hasPreferredMonth) return preferredMonth

  return buildMonthKey(availableMonths[availableMonths.length - 1].value, classRecord.academicYear)
}

function readSavedDraft(userId: string | undefined, classId: string): SavedDraft | null {
  if (typeof window === 'undefined' || !classId) return null

  try {
    const rawDraft = localStorage.getItem(buildStudentImportDraftKey(userId, classId))
    if (!rawDraft) return null

    const draft = JSON.parse(rawDraft) as Partial<SavedDraft>
    if (!Array.isArray(draft.months) || !Array.isArray(draft.rows)) return null
    return {
      months: draft.months.filter((month): month is string => typeof month === 'string'),
      rows: draft.rows.filter(isSavedRow),
    }
  } catch {
    return null
  }
}

function writeSavedDraft(userId: string | undefined, classId: string, draft: SavedDraft) {
  if (typeof window === 'undefined' || !classId) return
  localStorage.setItem(buildStudentImportDraftKey(userId, classId), JSON.stringify(draft))
}

function isSavedRow(value: unknown): value is StudentImportGridRow {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as StudentImportGridRow).rowId === 'string' &&
    typeof (value as StudentImportGridRow).matricula === 'string' &&
    typeof (value as StudentImportGridRow).name === 'string' &&
    (value as StudentImportGridRow).levelsByMonth &&
    typeof (value as StudentImportGridRow).levelsByMonth === 'object'
  )
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'success' | 'warning' | 'error' }) {
  const toneClass = {
    neutral: 'border-gray-200 bg-gray-50 text-gray-700',
    success: 'border-green-200 bg-green-50 text-green-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    error: 'border-red-200 bg-red-50 text-red-700',
  }[tone]

  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
