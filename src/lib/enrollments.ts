export const DEFAULT_ACADEMIC_YEAR = 2026
export const MIN_ACADEMIC_YEAR = 2000
export const MAX_ACADEMIC_YEAR = 2100

export interface EnrollmentWithClassYear {
  id: string
  startedAt: Date | string
  endedAt: Date | string | null
  deletedAt?: Date | string | null
  class: {
    academicYear: number
  }
}

export function parseAcademicYear(value: unknown): number | null {
  const year = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(year)) return null
  if (year < MIN_ACADEMIC_YEAR || year > MAX_ACADEMIC_YEAR) return null

  return year
}

export function getAcademicYearFromDate(date: Date | string): number {
  return new Date(date).getFullYear()
}

export function getAcademicYearStartDate(academicYear: number): Date {
  return new Date(academicYear, 0, 1)
}

export function getEnrollmentForDate<T extends EnrollmentWithClassYear>(
  enrollments: T[],
  date: Date | string
): T | null {
  const assessmentDate = new Date(date)
  const academicYear = getAcademicYearFromDate(assessmentDate)

  return (
    enrollments.find((enrollment) => {
      if (enrollment.deletedAt) return false
      if (enrollment.class.academicYear !== academicYear) return false

      const startedAt = new Date(enrollment.startedAt)
      const endedAt = enrollment.endedAt ? new Date(enrollment.endedAt) : null

      return startedAt <= assessmentDate && (!endedAt || endedAt >= assessmentDate)
    }) || null
  )
}

export function getEnrollmentForMonth<T extends EnrollmentWithClassYear>(
  enrollments: T[],
  referenceMonth: Date
): T | null {
  const monthStart = new Date(Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth() + 1, 1))

  return enrollments.find((enrollment) => {
    if (enrollment.deletedAt || enrollment.class.academicYear !== monthStart.getUTCFullYear()) return false

    const startedAt = new Date(enrollment.startedAt)
    const endedAt = enrollment.endedAt ? new Date(enrollment.endedAt) : null
    return startedAt < monthEnd && (!endedAt || endedAt >= monthStart)
  }) || null
}

export function getCurrentEnrollment<T extends EnrollmentWithClassYear>(enrollments: T[]): T | null {
  const activeEnrollments = enrollments
    .filter((enrollment) => !enrollment.deletedAt && !enrollment.endedAt)
    .sort((a, b) => b.class.academicYear - a.class.academicYear)

  return activeEnrollments[0] || null
}
