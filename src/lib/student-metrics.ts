import { isAttentionAssessmentLevel } from '@/lib/assessments'
import { getMonthRange } from '@/lib/monthly-updates'

export interface StudentMetricReadingHistoryEntry {
  recordedAt?: Date | string | null
  createdAt?: Date | string | null
  readingLevel: {
    code?: string | null
    order: number
    isAttention?: boolean | null
  }
}

export interface StudentMetricRecord {
  readingHistory?: StudentMetricReadingHistoryEntry[]
  monthlyUpdateStatus?: string
}

export interface StudentMetricCounts {
  needAttentionCount: number
  missingMonthlyUpdatesCount: number
  improvedCount: number
}

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function sortReadingHistory(
  readingHistory: StudentMetricReadingHistoryEntry[] | undefined
): StudentMetricReadingHistoryEntry[] {
  return [...(readingHistory || [])].sort((left, right) => {
    const leftRecordedAt = toTimestamp(left.recordedAt) || 0
    const rightRecordedAt = toTimestamp(right.recordedAt) || 0

    if (leftRecordedAt !== rightRecordedAt) {
      return rightRecordedAt - leftRecordedAt
    }

    return (toTimestamp(right.createdAt) || 0) - (toTimestamp(left.createdAt) || 0)
  })
}

export function countStudentsNeedingAttention(students: StudentMetricRecord[]): number {
  return students.filter((student) => (
    isAttentionAssessmentLevel(student.readingHistory?.[0]?.readingLevel)
  )).length
}

export function countStudentsMissingMonthlyUpdates(students: StudentMetricRecord[]): number {
  return students.filter((student) => student.monthlyUpdateStatus === 'missing').length
}

export function hasImprovedInMonth(student: StudentMetricRecord, month: string): boolean {
  const { start, end } = getMonthRange(month)
  const history = sortReadingHistory(student.readingHistory)

  return history.some((current, index) => {
    const currentRecordedAt = toTimestamp(current.recordedAt)
    if (!currentRecordedAt) return false

    const currentDate = new Date(currentRecordedAt)
    if (currentDate < start || currentDate >= end) return false

    const previous = history[index + 1]
    return !!previous && current.readingLevel.order > previous.readingLevel.order
  })
}

export function countStudentsImprovedInMonth(students: StudentMetricRecord[], month: string): number {
  return students.filter((student) => hasImprovedInMonth(student, month)).length
}

export function getStudentMetricCounts(students: StudentMetricRecord[], month: string): StudentMetricCounts {
  return {
    needAttentionCount: countStudentsNeedingAttention(students),
    missingMonthlyUpdatesCount: countStudentsMissingMonthlyUpdates(students),
    improvedCount: countStudentsImprovedInMonth(students, month),
  }
}
