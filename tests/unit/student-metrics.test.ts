import { describe, expect, it } from 'vitest'
import {
  countStudentsImprovedInMonth,
  countStudentsMissingMonthlyUpdates,
  countStudentsNeedingAttention,
  getStudentMetricCounts,
  type StudentMetricRecord,
} from '@/lib/student-metrics'

function student(
  code: string,
  order: number,
  options: Partial<StudentMetricRecord> = {}
): StudentMetricRecord {
  return {
    monthlyUpdateStatus: 'updated',
    readingHistory: [{
      id: `${code}-history`,
      referenceMonth: '04/2026',
      createdAt: '2026-04-10T12:00:00.000Z',
      readingLevel: { code, order },
    }],
    ...options,
  } as StudentMetricRecord
}

function assessedStudent(
  history: NonNullable<StudentMetricRecord['readingHistory']>,
  options: Partial<StudentMetricRecord> = {}
): StudentMetricRecord {
  return {
    monthlyUpdateStatus: 'updated',
    readingHistory: history,
    ...options,
  }
}

describe('student metric counts', () => {
  it('counts DNI, LO, and SO students as needing attention', () => {
    expect(countStudentsNeedingAttention([
      student('DNI', 1),
      student('LO', 2),
      student('SO', 3),
    ])).toBe(3)
  })

  it('excludes RW, RS, RTS, and RTF students from needing attention', () => {
    expect(countStudentsNeedingAttention([
      student('RW', 4),
      student('RS', 5),
      student('RTS', 6),
      student('RTF', 7),
    ])).toBe(0)
  })

  it('counts only students missing monthly updates', () => {
    expect(countStudentsMissingMonthlyUpdates([
      student('RW', 4, { monthlyUpdateStatus: 'missing' }),
      student('RS', 5, { monthlyUpdateStatus: 'updated' }),
      student('RTS', 6),
    ])).toBe(1)
  })

  it('counts students improved in the selected month', () => {
    const improved = assessedStudent([
      {
        referenceMonth: '04/2026',
        createdAt: '2026-04-10T12:00:00.000Z',
        readingLevel: { code: 'RS', order: 5 },
      },
      {
        referenceMonth: '03/2026',
        createdAt: '2026-03-10T12:00:00.000Z',
        readingLevel: { code: 'RW', order: 4 },
      },
    ])

    expect(countStudentsImprovedInMonth([improved], '04/2026')).toBe(1)
  })

  it('excludes non-improvement and out-of-month assessment cases', () => {
    const sameLevel = assessedStudent([
      {
        referenceMonth: '04/2026',
        createdAt: '2026-04-10T12:00:00.000Z',
        readingLevel: { code: 'RW', order: 4 },
      },
      {
        referenceMonth: '03/2026',
        createdAt: '2026-03-10T12:00:00.000Z',
        readingLevel: { code: 'RW', order: 4 },
      },
    ])
    const lowerLevel = assessedStudent([
      {
        referenceMonth: '04/2026',
        createdAt: '2026-04-10T12:00:00.000Z',
        readingLevel: { code: 'RW', order: 4 },
      },
      {
        referenceMonth: '03/2026',
        createdAt: '2026-03-10T12:00:00.000Z',
        readingLevel: { code: 'RS', order: 5 },
      },
    ])
    const noPrevious = assessedStudent([
      {
        referenceMonth: '04/2026',
        createdAt: '2026-04-10T12:00:00.000Z',
        readingLevel: { code: 'RS', order: 5 },
      },
    ])
    const noSelectedMonthAssessment = assessedStudent([
      {
        referenceMonth: '03/2026',
        createdAt: '2026-03-10T12:00:00.000Z',
        readingLevel: { code: 'RS', order: 5 },
      },
      {
        referenceMonth: '02/2026',
        createdAt: '2026-02-10T12:00:00.000Z',
        readingLevel: { code: 'RW', order: 4 },
      },
    ])

    expect(countStudentsImprovedInMonth([
      sameLevel,
      lowerLevel,
      noPrevious,
      noSelectedMonthAssessment,
    ], '04/2026')).toBe(0)
  })

  it('returns all student metric counts together', () => {
    const counts = getStudentMetricCounts([
      student('SO', 3, { monthlyUpdateStatus: 'missing' }),
      assessedStudent([
        {
          referenceMonth: '04/2026',
          createdAt: '2026-04-10T12:00:00.000Z',
          readingLevel: { code: 'RS', order: 5 },
        },
        {
          referenceMonth: '03/2026',
          createdAt: '2026-03-10T12:00:00.000Z',
          readingLevel: { code: 'RW', order: 4 },
        },
      ]),
    ], '04/2026')

    expect(counts).toEqual({
      needAttentionCount: 1,
      missingMonthlyUpdatesCount: 1,
      improvedCount: 1,
    })
  })
})
