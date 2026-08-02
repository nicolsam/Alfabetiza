export type MonthStatus = 'current' | 'past'

export interface MonthRange {
  month: string
  start: Date
  end: Date
}

export interface MonthInfo {
  month: string
  monthStatus: MonthStatus
  range: MonthRange
}

export interface AssessmentDate {
  referenceMonth: Date | string
}

/** Matches MM/YYYY — the Brazilian standard month format. */
const MONTH_KEY_PATTERN = /^(0[1-9]|1[0-2])\/\d{4}$/

export const MONTH_OPTIONS = [
  { value: '01', label: '01' },
  { value: '02', label: '02' },
  { value: '03', label: '03' },
  { value: '04', label: '04' },
  { value: '05', label: '05' },
  { value: '06', label: '06' },
  { value: '07', label: '07' },
  { value: '08', label: '08' },
  { value: '09', label: '09' },
  { value: '10', label: '10' },
  { value: '11', label: '11' },
  { value: '12', label: '12' },
]

export function getAvailableMonthOptions(year: number, now = new Date()) {
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  if (year > currentYear) {
    return []
  }

  if (year < currentYear) {
    return MONTH_OPTIONS
  }

  return MONTH_OPTIONS.filter((month) => Number(month.value) <= currentMonth)
}

/**
 * Build a month key from a Date in MM/YYYY format.
 *
 * @example getMonthKey(new Date(2026, 3, 27)) // "04/2026"
 */
export function getMonthKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}/${year}`
}

/**
 * Convert a MM/YYYY key into an HTML `<input type="month">` value (YYYY-MM)
 * so the native picker works correctly.
 */
export function toInputMonth(monthKey: string): string {
  const [month, year] = monthKey.split('/')
  return `${year}-${month}`
}

/**
 * Convert an HTML month input value (YYYY-MM) back to MM/YYYY.
 */
export function fromInputMonth(inputValue: string): string {
  const [year, month] = inputValue.split('-')
  return `${month}/${year}`
}

/** Parse MM/YYYY into the first local calendar day used to persist a month. */
export function parseReferenceMonth(value: string): Date | null {
  if (!MONTH_KEY_PATTERN.test(value)) return null

  const [month, year] = value.split('/').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

export function formatReferenceMonth(value: Date | string): string {
  const date = new Date(value)
  return getMonthKey(new Date(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function formatLocalizedMonth(value: Date | string, locale: string): string {
  const date = typeof value === 'string' && MONTH_KEY_PATTERN.test(value)
    ? parseReferenceMonth(value)!
    : new Date(value)
  return new Intl.DateTimeFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/**
 * Accept a month string and resolve it to a valid MM/YYYY key.
 *
 * - Valid MM/YYYY → returned as-is (unless it's in the future, see below).
 * - Invalid / null → defaults to the current month.
 * - Future months are clamped to the current month for safety.
 */
export function resolveMonthKey(month: string | null | undefined, now = new Date()): string {
  const currentKey = getMonthKey(now)

  if (!month || !MONTH_KEY_PATTERN.test(month)) {
    return currentKey
  }

  // Clamp future months to the current month
  const [monthPart, yearPart] = month.split('/').map(Number)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  if (yearPart > currentYear || (yearPart === currentYear && monthPart > currentMonth)) {
    return currentKey
  }

  return month
}

/**
 * Build an inclusive start / exclusive end Date range for a MM/YYYY key.
 */
export function getMonthRange(month: string): MonthRange {
  const [monthValue, yearValue] = month.split('/').map(Number)
  const monthIndex = monthValue - 1

  return {
    month,
    start: new Date(yearValue, monthIndex, 1),
    end: new Date(yearValue, monthIndex + 1, 1),
  }
}

export function getYearFromMonthKey(month: string): number {
  return Number(month.split('/')[1])
}

export function getMonthPartFromMonthKey(month: string): string {
  return month.split('/')[0] || getMonthKey().split('/')[0]
}

export function buildMonthKey(month: string, year: string | number): string {
  return resolveMonthKey(`${month}/${year}`)
}

export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const [, yearValue, monthValue, dayValue] = match
  const date = new Date(Number(yearValue), Number(monthValue) - 1, Number(dayValue))

  if (
    date.getFullYear() !== Number(yearValue) ||
    date.getMonth() !== Number(monthValue) - 1 ||
    date.getDate() !== Number(dayValue)
  ) {
    return null
  }

  return date
}

/**
 * Determine whether a month key represents the current month or a past month.
 */
export function getMonthStatus(month: string, now = new Date()): MonthStatus {
  const currentKey = getMonthKey(now)
  return month === currentKey ? 'current' : 'past'
}

/**
 * Return a fully resolved month info object from a raw query param.
 */
export function resolveMonthInfo(raw: string | null | undefined, now = new Date()): MonthInfo {
  const month = resolveMonthKey(raw, now)
  return {
    month,
    monthStatus: getMonthStatus(month, now),
    range: getMonthRange(month),
  }
}

export function isDateInMonth(date: Date | string | undefined, range: MonthRange): boolean {
  if (!date) return false

  const assessmentDate = new Date(date)
  return assessmentDate >= range.start && assessmentDate < range.end
}

export function hasMonthlyAssessmentUpdate(
  assessments: AssessmentDate[] | undefined,
  range: MonthRange
): boolean {
  return !!assessments?.some((record) => (
    typeof record.referenceMonth === 'string' && MONTH_KEY_PATTERN.test(record.referenceMonth)
      ? record.referenceMonth === range.month
      : formatReferenceMonth(record.referenceMonth) === range.month
  ))
}

export function getLatestAssessmentMonth(assessments: AssessmentDate[] | undefined): string | null {
  const latestMonth = assessments?.[0]?.referenceMonth
  if (!latestMonth) return null
  return typeof latestMonth === 'string' && MONTH_KEY_PATTERN.test(latestMonth)
    ? latestMonth
    : formatReferenceMonth(latestMonth)
}

export type ReadingAssessmentDate = AssessmentDate

export function hasMonthlyReadingUpdate(
  readingHistory: AssessmentDate[] | undefined,
  range: MonthRange
): boolean {
  return hasMonthlyAssessmentUpdate(readingHistory, range)
}
