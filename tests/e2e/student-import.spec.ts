import { expect, test } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { loginByApi } from './utils'

const ADMIN_EMAIL = 'test-admin@example.com'
const SCHOOL_ID = 'e2e-import-school'
const CLASS_ID = 'e2e-import-class'
const IMPORTED_STUDENT_NUMBER = 'E2E-IMPORT-001'
const PASTED_STUDENT_NUMBER = 'E2E-IMPORT-002'

async function cleanupFixtures() {
  const importedStudentFilter = {
    OR: [
      { schoolId: SCHOOL_ID },
      { studentNumber: { in: [IMPORTED_STUDENT_NUMBER, PASTED_STUDENT_NUMBER] } },
    ],
  }

  await prisma.studentAssessment.deleteMany({
    where: { student: importedStudentFilter },
  })
  await prisma.studentEnrollment.deleteMany({
    where: { student: importedStudentFilter },
  })
  await prisma.student.deleteMany({ where: importedStudentFilter })
  await prisma.class.deleteMany({ where: { id: CLASS_ID } })
  await prisma.school.deleteMany({ where: { id: SCHOOL_ID } })
}

async function seedFixtures() {
  const readingType = await prisma.assessmentType.upsert({
    where: { code: 'READING' },
    update: { name: 'Reading', displayOrder: 1, isActive: true, monthlyTrackingEnabled: true },
    create: { code: 'READING', name: 'Reading', displayOrder: 1, isActive: true, monthlyTrackingEnabled: true },
  })

  await prisma.assessmentLevel.upsert({
    where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'RW' } },
    update: { name: 'Reads Words', order: 4, isActive: true },
    create: { assessmentTypeId: readingType.id, code: 'RW', name: 'Reads Words', order: 4, isActive: true },
  })

  await prisma.assessmentLevel.upsert({
    where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'RS' } },
    update: { name: 'Reads Sentences', order: 5, isActive: true },
    create: { assessmentTypeId: readingType.id, code: 'RS', name: 'Reads Sentences', order: 5, isActive: true },
  })

  await prisma.school.create({
    data: {
      id: SCHOOL_ID,
      name: 'E2E Import School',
      classes: {
        create: {
          id: CLASS_ID,
          grade: '1º Ano',
          section: 'I',
          shift: 'Morning',
          academicYear: 2026,
        },
      },
    },
  })
}

test.describe('student import grid', () => {
  test.beforeEach(async () => {
    await cleanupFixtures()
    await seedFixtures()
  })

  test.afterEach(async () => {
    await cleanupFixtures()
  })

  test('types one student into the grid and imports a reading level', async ({ page }) => {
    await loginByApi(page, ADMIN_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await page.getByTestId('student-import-open').click()
    await page.getByTestId('student-import-class').click()
    await page.getByRole('option', { name: /1º Ano I/ }).click()

    await page.getByTestId('student-import-matricula-0').fill(IMPORTED_STUDENT_NUMBER)
    await page.getByTestId('student-import-name-0').fill('E2E Imported Student')
    await page.getByTestId('student-import-level-0-RW').first().click()

    await page.getByTestId('student-import-confirm').click()
    await expect(page.getByRole('link', { name: 'E2E Imported Student' }).first()).toBeVisible()

    const importedStudent = await prisma.student.findUnique({
      where: { studentNumber_schoolId: { studentNumber: IMPORTED_STUDENT_NUMBER, schoolId: SCHOOL_ID } },
    })
    if (!importedStudent) throw new Error('Imported student was not created in the selected school.')

    await expect.poll(async () => prisma.studentAssessment.count({
      where: { studentId: importedStudent.id },
    })).toBe(1)
  })

  test('lets coordinators delete empty rows and add a new student row', async ({ page }) => {
    await loginByApi(page, ADMIN_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await page.getByTestId('student-import-open').click()
    await page.getByTestId('student-import-class').click()
    await page.getByRole('option', { name: /1º Ano I/ }).click()

    const modal = page.locator('[data-app-modal="true"]')
    const deleteButtons = modal.getByRole('button', { name: 'Delete' })
    while (await deleteButtons.count()) {
      await deleteButtons.first().click()
    }

    await expect(modal.getByText('No students in this draft yet.')).toBeVisible()
    await modal.getByRole('button', { name: 'Add student' }).click()
    await expect(page.getByTestId('student-import-matricula-0')).toBeVisible()
    await page.getByTestId('student-import-level-0-RW').click()
    await expect(deleteButtons).toHaveCount(1)
  })

  test('keeps a close button fixed inside the import modal', async ({ page }) => {
    await loginByApi(page, ADMIN_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await page.getByTestId('student-import-open').click()

    const panel = page.getByTestId('student-import-modal-panel')
    const closeButton = page.getByTestId('student-import-close')

    await expect(closeButton).toBeVisible()
    await expect(closeButton).toHaveCSS('position', 'sticky')
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(closeButton).toBeVisible()

    await closeButton.click()
    await expect(page.locator('[data-app-modal="true"]')).toHaveCount(0)
  })

  test('blocks duplicate matrícula values before import', async ({ page }) => {
    await loginByApi(page, ADMIN_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await page.getByTestId('student-import-open').click()
    await page.getByTestId('student-import-class').click()
    await page.getByRole('option', { name: /1º Ano I/ }).click()

    await page.getByTestId('student-import-matricula-0').fill('DUP-IMPORT')
    await page.getByTestId('student-import-name-0').fill('Duplicate One')
    await page.getByTestId('student-import-level-0-RW').click()
    await page.getByTestId('student-import-matricula-1').fill('dup-import')
    await page.getByTestId('student-import-name-1').fill('Duplicate Two')
    await page.getByTestId('student-import-level-1-RS').click()

    await page.getByTestId('student-import-confirm').click()

    await expect(page.getByText('Matrícula DUP-IMPORT appears more than once in this list.')).toBeVisible()
    await expect.poll(async () => prisma.student.count({
      where: { studentNumber: { in: ['DUP-IMPORT', 'dup-import'] }, schoolId: SCHOOL_ID },
    })).toBe(0)
  })

  test('shows localized reading level labels in the Portuguese import modal', async ({ page }) => {
    await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'pt-BR', domain: 'localhost', path: '/' }])
    await loginByApi(page, ADMIN_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await page.getByTestId('student-import-open').click()
    await page.getByTestId('student-import-class').click()
    await page.getByRole('option', { name: /1º Ano I/ }).click()

    await page.getByTestId('student-import-matricula-0').fill('PT-IMPORT-001')
    await page.getByTestId('student-import-name-0').fill('Aluno em Português')
    await expect(page.getByTestId('student-import-level-0-RW')).toHaveText('LP')
    await expect(page.getByTestId('student-import-level-0-RW')).toHaveAttribute('title', 'Lê Palavras')
    await page.getByTestId('student-import-level-0-RW').click()

    const modal = page.locator('[data-app-modal="true"]')
    await expect(modal.getByText('LP - Lê Palavras')).toHaveCount(2)
    await expect(modal.getByText('RW')).toHaveCount(0)
    await expect(modal.getByText('RW - Reads Words')).toHaveCount(0)
  })

  test('pastes spreadsheet rows with month headers and restores drafts after reload', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permission automation is only available for Chromium here.')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' })
    await loginByApi(page, ADMIN_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await page.getByTestId('student-import-open').click()
    await page.getByTestId('student-import-class').click()
    await page.getByRole('option', { name: /1º Ano I/ }).click()
    await page.getByTestId('student-import-matricula-0').fill('DRAFT-ONLY')
    await page.reload()

    await page.getByTestId('student-import-open').click()
    await page.getByTestId('student-import-class').click()
    await page.getByRole('option', { name: /1º Ano I/ }).click()
    await expect(page.getByTestId('student-import-matricula-0')).toHaveValue('DRAFT-ONLY')

    const pasteText = [
      'Matrícula\tNome\tFEV\tMAR',
      `${PASTED_STUDENT_NUMBER}\tE2E Pasted Student\tRW\tRS`,
    ].join('\n')
    await page.evaluate((text) => navigator.clipboard.writeText(text), pasteText)
    await page.getByTestId('student-import-matricula-0').click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')

    await expect(page.getByTestId('student-import-matricula-0')).toHaveValue(PASTED_STUDENT_NUMBER)
    await expect(page.getByTestId('student-import-name-0')).toHaveValue('E2E Pasted Student')
    await expect(page.getByRole('columnheader', { name: 'February 2026' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'March 2026' })).toBeVisible()
    await expect(page.getByText('RW - Reads Words')).toBeVisible()
    await expect(page.getByText('RS - Reads Sentences')).toBeVisible()

    await page.getByTestId('student-import-edit-summary-0-03/2026').click()
    await expect(page.getByTestId('student-import-active-month-header')).toContainText('March 2026')
    await expect(page.getByTestId('student-import-level-0-RS')).toBeFocused()

    await page.getByTestId('student-import-confirm').click()
    await expect(page.getByRole('link', { name: 'E2E Pasted Student' }).first()).toBeVisible()

    const pastedStudent = await prisma.student.findUnique({
      where: { studentNumber_schoolId: { studentNumber: PASTED_STUDENT_NUMBER, schoolId: SCHOOL_ID } },
    })
    if (!pastedStudent) throw new Error('Pasted student was not created in the selected school.')

    await expect.poll(async () => prisma.studentAssessment.count({
      where: { studentId: pastedStudent.id },
    })).toBe(2)
  })
})
