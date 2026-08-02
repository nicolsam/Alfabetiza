import { describe, expect, it } from 'vitest'
import {
  getAcademicYearFromDate,
  getAcademicYearStartDate,
  getCurrentEnrollment,
  getEnrollmentForDate,
  getEnrollmentForMonth,
  parseAcademicYear,
} from '@/lib/enrollments'

const enrollments = [
  {
    id: 'enrollment-2023',
    startedAt: new Date(2023, 0, 1),
    endedAt: new Date(2023, 11, 31),
    deletedAt: null,
    class: { academicYear: 2023 },
  },
  {
    id: 'enrollment-2024',
    startedAt: new Date(2024, 0, 1),
    endedAt: null,
    deletedAt: null,
    class: { academicYear: 2024 },
  },
]

describe('enrollment helpers', () => {
  it('parses valid academic years', () => {
    expect(parseAcademicYear('2026')).toBe(2026)
    expect(parseAcademicYear(2026)).toBe(2026)
    expect(parseAcademicYear('abc')).toBeNull()
    expect(parseAcademicYear(1999)).toBeNull()
    expect(parseAcademicYear(2101)).toBeNull()
  })

  it('gets academic year and start dates', () => {
    expect(getAcademicYearFromDate(new Date(2026, 3, 10))).toBe(2026)
    expect(getAcademicYearStartDate(2026)).toEqual(new Date(2026, 0, 1))
  })

  it('finds the enrollment matching an assessment date', () => {
    expect(getEnrollmentForDate(enrollments, new Date(2023, 3, 10))?.id).toBe('enrollment-2023')
    expect(getEnrollmentForDate(enrollments, new Date(2024, 3, 10))?.id).toBe('enrollment-2024')
    expect(getEnrollmentForDate(enrollments, new Date(2025, 3, 10))).toBeNull()
  })

  it('finds an enrollment that overlaps any part of the reference month', () => {
    const midMonthEnrollment = [{
      id: 'mid-month',
      startedAt: new Date(2026, 3, 15),
      endedAt: null,
      deletedAt: null,
      class: { academicYear: 2026 },
    }]

    expect(getEnrollmentForMonth(midMonthEnrollment, new Date(2026, 3, 1))?.id).toBe('mid-month')
    expect(getEnrollmentForMonth(midMonthEnrollment, new Date(2026, 2, 1))).toBeNull()
  })

  it('chooses the newest active enrollment as current', () => {
    expect(getCurrentEnrollment(enrollments)?.id).toBe('enrollment-2024')
  })
})
