import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { loginByApi } from './utils'

const TEACHER_EMAIL = 'test-regular@example.com'
const SCHOOL_ID = 'e2e-metrics-school'
const CLASS_ID = 'e2e-metrics-class'
const STUDENTS = {
  attention: {
    id: 'e2e-metrics-attention-student',
    name: 'E2E Attention Student',
    number: 'E2E-METRICS-001',
  },
  missing: {
    id: 'e2e-metrics-missing-student',
    name: 'E2E Missing Update Student',
    number: 'E2E-METRICS-002',
  },
  improved: {
    id: 'e2e-metrics-improved-student',
    name: 'E2E Improved Student',
    number: 'E2E-METRICS-003',
  },
  control: {
    id: 'e2e-metrics-control-student',
    name: 'E2E Control Student',
    number: 'E2E-METRICS-004',
  },
} as const

const STUDENT_IDS = Object.values(STUDENTS).map((student) => student.id)
const ALL_STUDENT_NAMES = Object.values(STUDENTS).map((student) => student.name)

async function expectActionListStudents(
  page: Page,
  expectedNames: string[]
) {
  await expect(page.locator('table')).toBeVisible()

  for (const name of expectedNames) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
  }

  for (const name of ALL_STUDENT_NAMES.filter((studentName) => !expectedNames.includes(studentName))) {
    await expect(page.getByRole('link', { name, exact: true })).toBeHidden()
  }
}

function currentMonthDates() {
  const now = new Date()
  const current = new Date(now.getFullYear(), now.getMonth(), 1, 12)
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)

  return {
    academicYear: now.getFullYear(),
    current,
    previous,
  }
}

async function cleanupMetricFixtures() {
  await prisma.studentAssessment.deleteMany({ where: { studentId: { in: STUDENT_IDS } } })
  await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: STUDENT_IDS } } })
  await prisma.student.deleteMany({ where: { id: { in: STUDENT_IDS } } })
  await prisma.class.deleteMany({ where: { id: CLASS_ID } })
  await prisma.userSchool.deleteMany({ where: { schoolId: SCHOOL_ID } })
  await prisma.school.deleteMany({ where: { id: SCHOOL_ID } })
}

async function seedMetricFixtures() {
  const teacher = await prisma.user.findUnique({ where: { email: TEACHER_EMAIL } })
  if (!teacher) throw new Error(`Missing E2E teacher: ${TEACHER_EMAIL}`)

  const { academicYear, current, previous } = currentMonthDates()
  const readingType = await prisma.assessmentType.upsert({
    where: { code: 'READING' },
    update: { name: 'Reading', displayOrder: 1 },
    create: { code: 'READING', name: 'Reading', displayOrder: 1 },
  })
  const levels = await Promise.all([
    prisma.assessmentLevel.upsert({
      where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'SO' } },
      update: { name: 'Syllables Only', order: 3, isAttention: true },
      create: { assessmentTypeId: readingType.id, code: 'SO', name: 'Syllables Only', order: 3, isAttention: true },
    }),
    prisma.assessmentLevel.upsert({
      where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'RW' } },
      update: { name: 'Reads Words', order: 4 },
      create: { assessmentTypeId: readingType.id, code: 'RW', name: 'Reads Words', order: 4 },
    }),
    prisma.assessmentLevel.upsert({
      where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'RS' } },
      update: { name: 'Reads Sentences', order: 5 },
      create: { assessmentTypeId: readingType.id, code: 'RS', name: 'Reads Sentences', order: 5 },
    }),
    prisma.assessmentLevel.upsert({
      where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'RTF' } },
      update: { name: 'Reads Text Fluently', order: 7 },
      create: { assessmentTypeId: readingType.id, code: 'RTF', name: 'Reads Text Fluently', order: 7 },
    }),
  ])
  const levelByCode = Object.fromEntries(levels.map((level) => [level.code, level]))

  await prisma.school.create({
    data: {
      id: SCHOOL_ID,
      name: 'E2E Metrics School',
      users: {
        create: {
          userId: teacher.id,
          role: 'TEACHER',
        },
      },
      classes: {
        create: {
          id: CLASS_ID,
          grade: '1º Ano',
          section: 'M',
          shift: 'Morning',
          academicYear,
        },
      },
    },
  })

  for (const student of Object.values(STUDENTS)) {
    await prisma.student.create({
      data: {
        id: student.id,
        name: student.name,
        studentNumber: student.number,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID,
        enrollments: {
          create: {
            id: `${student.id}-enrollment`,
            classId: CLASS_ID,
            startedAt: new Date(academicYear, 0, 1),
          },
        },
      },
    })
  }

  await prisma.studentAssessment.create({
    data: {
      id: 'e2e-metrics-attention-history',
      studentId: STUDENTS.attention.id,
      enrollmentId: `${STUDENTS.attention.id}-enrollment`,
      assessmentTypeId: readingType.id,
      assessmentLevelId: levelByCode.SO.id,
      userId: teacher.id,
      recordedAt: current,
    },
  })
  await prisma.studentAssessment.create({
    data: {
      id: 'e2e-metrics-missing-history',
      studentId: STUDENTS.missing.id,
      enrollmentId: `${STUDENTS.missing.id}-enrollment`,
      assessmentTypeId: readingType.id,
      assessmentLevelId: levelByCode.RS.id,
      userId: teacher.id,
      recordedAt: previous,
    },
  })
  await prisma.studentAssessment.create({
    data: {
      id: 'e2e-metrics-improved-previous-history',
      studentId: STUDENTS.improved.id,
      enrollmentId: `${STUDENTS.improved.id}-enrollment`,
      assessmentTypeId: readingType.id,
      assessmentLevelId: levelByCode.RW.id,
      userId: teacher.id,
      recordedAt: previous,
    },
  })
  await prisma.studentAssessment.create({
    data: {
      id: 'e2e-metrics-improved-current-history',
      studentId: STUDENTS.improved.id,
      enrollmentId: `${STUDENTS.improved.id}-enrollment`,
      assessmentTypeId: readingType.id,
      assessmentLevelId: levelByCode.RS.id,
      userId: teacher.id,
      recordedAt: current,
    },
  })
  await prisma.studentAssessment.create({
    data: {
      id: 'e2e-metrics-control-history',
      studentId: STUDENTS.control.id,
      enrollmentId: `${STUDENTS.control.id}-enrollment`,
      assessmentTypeId: readingType.id,
      assessmentLevelId: levelByCode.RTF.id,
      userId: teacher.id,
      recordedAt: current,
    },
  })
}

test.describe('dashboard and students metric boxes', () => {
  test.beforeAll(async () => {
    await cleanupMetricFixtures()
    await seedMetricFixtures()
  })

  test.afterAll(async () => {
    await cleanupMetricFixtures()
  })

  test('dashboard metric boxes show counts and navigate to action lists', async ({ page }) => {
    await loginByApi(page, TEACHER_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard')

    await expect(page.getByTestId('dashboard-need-attention-count')).toHaveText('1')
    await expect(page.getByTestId('dashboard-missing-updates-count')).toHaveText('1')
    await expect(page.getByTestId('dashboard-improved-count')).toHaveText('1')

    await page.getByTestId('dashboard-need-attention-card').click()
    await expect(page).toHaveURL(/\/dashboard\/students\/need-attention/)
    await expectActionListStudents(page, [STUDENTS.attention.name])

    await page.goto('/dashboard')
    await page.getByTestId('dashboard-missing-updates-card').click()
    await expect(page).toHaveURL(/\/dashboard\/students\/missing-updates/)
    await expectActionListStudents(page, [STUDENTS.missing.name])

    await page.goto('/dashboard')
    await page.getByTestId('dashboard-improved-card').click()
    await expect(page).toHaveURL(/\/dashboard\/students\/improved/)
    await expectActionListStudents(page, [STUDENTS.improved.name])
  })

  test('students metric boxes show counts and navigate to action lists', async ({ page }) => {
    await loginByApi(page, TEACHER_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await expect(page.getByTestId('students-need-attention-count')).toHaveText('1')
    await expect(page.getByTestId('students-missing-updates-count')).toHaveText('1')
    await expect(page.getByTestId('students-improved-count')).toHaveText('1')

    await page.getByTestId('students-need-attention-card').click()
    await expect(page).toHaveURL(/\/dashboard\/students\/need-attention/)
    await expectActionListStudents(page, [STUDENTS.attention.name])

    await page.goto('/dashboard/students')
    await page.getByTestId('students-missing-updates-card').click()
    await expect(page).toHaveURL(/\/dashboard\/students\/missing-updates/)
    await expectActionListStudents(page, [STUDENTS.missing.name])

    await page.goto('/dashboard/students')
    await page.getByTestId('students-improved-card').click()
    await expect(page).toHaveURL(/\/dashboard\/students\/improved/)
    await expectActionListStudents(page, [STUDENTS.improved.name])
  })
})
