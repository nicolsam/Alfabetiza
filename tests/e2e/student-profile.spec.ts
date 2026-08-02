import { expect, test } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { loginByApi } from './utils'

const TEACHER_EMAIL = 'test-regular@example.com'
const SCHOOL_ID = 'e2e-profile-school'
const CLASS_ID = 'e2e-profile-class'
const STUDENT_ID = 'e2e-profile-student'
const ENROLLMENT_ID = 'e2e-profile-enrollment'

async function cleanupFixtures() {
  await prisma.studentCommentary.deleteMany({ where: { studentId: STUDENT_ID } })
  await prisma.studentAssessment.deleteMany({ where: { studentId: STUDENT_ID } })
  await prisma.studentEnrollment.deleteMany({ where: { studentId: STUDENT_ID } })
  await prisma.student.deleteMany({ where: { id: STUDENT_ID } })
  await prisma.class.deleteMany({ where: { id: CLASS_ID } })
  await prisma.userSchool.deleteMany({ where: { schoolId: SCHOOL_ID } })
  await prisma.school.deleteMany({ where: { id: SCHOOL_ID } })
}

async function seedFixtures() {
  const teacher = await prisma.user.findUnique({ where: { email: TEACHER_EMAIL } })
  if (!teacher) throw new Error(`Missing E2E teacher: ${TEACHER_EMAIL}`)

  const readingType = await prisma.assessmentType.upsert({
    where: { code: 'READING' },
    update: { name: 'Reading', displayOrder: 1 },
    create: { code: 'READING', name: 'Reading', displayOrder: 1 },
  })

  const level1 = await prisma.assessmentLevel.upsert({
    where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'LO' } },
    update: { name: 'Letters Only', order: 2, isAttention: true },
    create: { assessmentTypeId: readingType.id, code: 'LO', name: 'Letters Only', order: 2, isAttention: true },
  })

  await prisma.assessmentLevel.upsert({
    where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'RW' } },
    update: { name: 'Reads Words', order: 4 },
    create: { assessmentTypeId: readingType.id, code: 'RW', name: 'Reads Words', order: 4 },
  })

  await prisma.school.create({
    data: {
      id: SCHOOL_ID,
      name: 'E2E Profile School',
      users: { create: { userId: teacher.id, role: 'TEACHER' } },
      classes: {
        create: {
          id: CLASS_ID,
          grade: '1º Ano',
          section: 'P',
          shift: 'Morning',
          academicYear: 2026,
        },
      },
    },
  })

  await prisma.student.create({
    data: {
      id: STUDENT_ID,
      name: 'E2E Profile Student',
      studentNumber: 'E2E-PROFILE-001',
      schoolId: SCHOOL_ID,
      classId: CLASS_ID,
      enrollments: {
        create: {
          id: ENROLLMENT_ID,
          classId: CLASS_ID,
          startedAt: new Date('2026-01-01T12:00:00.000Z'),
        },
      },
    },
  })

  await prisma.studentAssessment.create({
    data: {
      id: 'e2e-profile-history',
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      assessmentTypeId: readingType.id,
      assessmentLevelId: level1.id,
      userId: teacher.id,
      referenceMonth: new Date(2026, 4, 1),
    },
  })
}

test.describe('student profile page', () => {
  test.beforeEach(async () => {
    await cleanupFixtures()
    await seedFixtures()
  })

  test.afterEach(async () => {
    await cleanupFixtures()
  })

  test('interacts with timeline, updates levels, and manages commentaries', async ({ page }) => {
    await loginByApi(page, TEACHER_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto(`/dashboard/students/${STUDENT_ID}`)

    // 1. Verify basic page layout
    await expect(page.getByRole('heading', { name: 'E2E Profile Student' })).toBeVisible()
    await expect(page.getByText(/1º Ano P \((Manhã|Morning)\) - 2026/)).toBeVisible()

    // 2. Post an inline commentary using rich text editor
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('This is a test inline commentary')
    await page.keyboard.press('Enter')
    await page.keyboard.type('With multiple lines')
    await page.getByRole('button', { name: /Comentar|Add Commentary/ }).click()

    // Verify it appears in timeline
    await expect(page.locator('p').filter({ hasText: 'This is a test inline commentary' })).toBeVisible()
    await expect(page.locator('p').filter({ hasText: 'With multiple lines' })).toBeVisible()

    // 3. Update Reading Level using Modal
    await page.getByRole('button', { name: /Atualizar Nível|Update Level/ }).click()
    await expect(page.getByRole('heading', { name: /Atualizar Nível|Update Level/ })).toBeVisible()
    
    // Select new level
    await page.locator('form').getByRole('combobox').selectOption({ index: 2 })
    await page.locator('input[type="month"]').fill('2026-05')

    // Add note in Rich Text inside modal
    await page.locator('.ProseMirror').last().click()
    await page.keyboard.type('Test assessment note')
    
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: /Salvar|Save/ }).click()

    // Verify it appears in timeline
    await expect(page.locator('div').filter({ hasText: 'Test assessment note' }).first()).toBeVisible()
    
    // 4. Edit an existing timeline item (the commentary we just made)
  })
})
