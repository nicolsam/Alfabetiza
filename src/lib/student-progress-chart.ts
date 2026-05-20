export type StudentProgressHistoryEntry = {
  id: string
  recordedAt: string | Date
  notes: string | null
  readingLevel: {
    code: string
    order: number
  }
}

export type StudentProgressChartPoint = {
  id: string
  date: string
  level: number
  levelName: string
  code: string
  notes: string | null
}

const LEVEL_CODES_BY_ORDER: Record<number, string> = {
  1: 'DNI',
  2: 'LO',
  3: 'SO',
  4: 'RW',
  5: 'RS',
  6: 'RTS',
  7: 'RTF',
}

export function buildAssessmentLevelAxisLabels(
  levels: { code: string; order: number }[],
  translateLevel: (code: string) => string
): Record<number, string> {
  return Object.fromEntries(levels.map((level) => [level.order, translateLevel(level.code)]))
}

export function buildReadingLevelAxisLabels(translateLevel: (code: string) => string): Record<number, string> {
  const levels = Object.entries(LEVEL_CODES_BY_ORDER).map(([order, code]) => ({ order: Number(order), code }))
  return buildAssessmentLevelAxisLabels(levels, translateLevel)
}

export function buildStudentAssessmentProgressChartData(
  history: StudentProgressHistoryEntry[],
  locale: string,
  translateLevel: (code: string) => string
): StudentProgressChartPoint[] {
  const dateLocale = locale === 'pt-BR' ? 'pt-BR' : 'en-US'

  return [...history].reverse().map((entry) => ({
    id: entry.id,
    date: new Date(entry.recordedAt).toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: 'short',
    }),
    level: entry.readingLevel.order,
    levelName: translateLevel(entry.readingLevel.code),
    code: entry.readingLevel.code,
    notes: entry.notes,
  }))
}

export function buildStudentProgressChartData(
  history: StudentProgressHistoryEntry[],
  locale: string,
  translateLevel: (code: string) => string
): StudentProgressChartPoint[] {
  return buildStudentAssessmentProgressChartData(history, locale, translateLevel)
}
