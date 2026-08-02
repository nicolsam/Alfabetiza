import { expect, test } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { loginByApi } from './utils'

const TEACHER_EMAIL = 'test-regular@example.com'
const SCHOOL_ID = 'e2e-parent-report-school'
const CLASS_ID = 'e2e-parent-report-class'
const STUDENT_ID = 'e2e-parent-report-student'
const ENROLLMENT_ID = 'e2e-parent-report-enrollment'
const CREATED_STUDENT_NUMBER = 'E2E-REPORT-CREATED-001'

async function cleanupFixtures() {
  const createdStudents = await prisma.student.findMany({
    where: { studentNumber: CREATED_STUDENT_NUMBER },
    select: { id: true },
  })
  const createdStudentIds = createdStudents.map((student) => student.id)

  if (createdStudentIds.length > 0) {
    await prisma.studentContact.deleteMany({ where: { studentId: { in: createdStudentIds } } })
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } })
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } })
  }

  await prisma.studentParentReportLink.deleteMany({ where: { studentId: STUDENT_ID } })
  await prisma.studentContact.deleteMany({ where: { studentId: STUDENT_ID } })
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

  const level = await prisma.assessmentLevel.upsert({
    where: { assessmentTypeId_code: { assessmentTypeId: readingType.id, code: 'RW' } },
    update: { name: 'Reads Words', order: 4 },
    create: { assessmentTypeId: readingType.id, code: 'RW', name: 'Reads Words', order: 4 },
  })

  await prisma.school.create({
    data: {
      id: SCHOOL_ID,
      name: 'E2E Parent Report School',
      users: { create: { userId: teacher.id, role: 'COORDINATOR' } },
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
      name: 'E2E Parent Report Student',
      studentNumber: 'E2E-REPORT-001',
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
      id: 'e2e-parent-report-history',
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      assessmentTypeId: readingType.id,
      assessmentLevelId: level.id,
      userId: teacher.id,
      referenceMonth: new Date(2026, 4, 1),
      notes: 'E2E report note',
    },
  })
}

test.describe('parent report sharing', () => {
  test.beforeEach(async () => {
    await cleanupFixtures()
    await seedFixtures()
  })

  test.afterEach(async () => {
    await cleanupFixtures()
  })

  test('stores a contact, creates a WhatsApp report link, and opens the public report', async ({ page }) => {
    await loginByApi(page, TEACHER_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto(`/dashboard/students/${STUDENT_ID}`)

    await expect(page.getByRole('heading', { name: 'E2E Parent Report Student' })).toBeVisible()
    await page.getByRole('button', { name: /Adicionar contato|Add contact/i }).click()
    await page.getByPlaceholder(/Nome do contato|Contact name/).fill('Maria Parent')
    await page.getByText(/Parentesco|Relationship/).click()
    await page.getByRole('option', { name: /Mãe|Mother/ }).click()
    const detailWhatsappInput = page.getByPlaceholder('(85) 99999-0000')
    await detailWhatsappInput.fill('85999990000')
    await expect(detailWhatsappInput).toHaveValue('(85) 99999-0000')
    await page.getByRole('button', { name: /Salvar|Save/ }).click()
    await expect(page.locator('p').filter({ hasText: 'Maria Parent' })).toBeVisible()

    await page.getByRole('button', { name: /Gerar link do relatório|Generate report link/ }).click()
    const reportLink = await page.locator('text=/reports\\/students\\//').last().textContent()
    expect(reportLink).toContain('/reports/students/')

    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: /Enviar no WhatsApp|Share on WhatsApp/ }).click()
    const popup = await popupPromise
    expect(popup.url()).toContain('phone=5585999990000')
    expect(decodeURIComponent(popup.url())).toContain(reportLink || '')
    await popup.close()

    const reportPath = new URL(reportLink || '').pathname
    await page.goto(reportPath)
    await expect(page.getByRole('heading', { name: 'E2E Parent Report Student' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Gráfico de Progresso|Progress Chart/ }).first()).toBeVisible()
    await expect(page.getByText('E2E report note', { exact: true }).last()).toBeVisible()
  })

  test('creates a student with parent contacts from the multi-step modal', async ({ page }) => {
    await loginByApi(page, TEACHER_EMAIL, 'playwright123', SCHOOL_ID)
    await page.goto('/dashboard/students')

    await page.getByRole('button', { name: /Adicionar Aluno|Add Student/ }).click()
    await page.getByRole('combobox').filter({ hasText: /Selecionar uma turma|Select a class/ }).click()
    await page.getByRole('option', { name: /1º Ano P/ }).click()
    await page.getByPlaceholder(/Nome|Name/).fill('E2E Created With Contact')
    await page.getByPlaceholder(/Matrícula|Enrollment ID|Número do Aluno|Student Number/).fill(CREATED_STUDENT_NUMBER)
    await page.getByRole('button', { name: /^(Avançar|Next)$/ }).click()

    await page.getByPlaceholder(/Nome do contato|Contact name/).fill('Created Parent')
    await page.getByText(/Parentesco|Relationship/).click()
    await page.getByRole('option', { name: /Mãe|Mother/ }).click()
    const registrationWhatsappInput = page.getByPlaceholder('(85) 99999-0000')
    await registrationWhatsappInput.fill('85988887777')
    await expect(registrationWhatsappInput).toHaveValue('(85) 98888-7777')
    await page.getByRole('button', { name: /Adicionar contato|Add contact/ }).click()
    await page.getByRole('button', { name: /^(Avançar|Next)$/ }).click()
    await page.getByRole('button', { name: /Salvar|Save/ }).click()

    await expect(page.getByRole('link', { name: 'E2E Created With Contact' })).toBeVisible()

    const createdStudent = await prisma.student.findUnique({
      where: { studentNumber_schoolId: { studentNumber: CREATED_STUDENT_NUMBER, schoolId: SCHOOL_ID } },
      include: { contacts: true },
    })
    expect(createdStudent?.contacts).toMatchObject([
      {
        name: 'Created Parent',
        relationship: 'MOTHER',
        whatsappPhone: '5585988887777',
        isPrimary: true,
      },
    ])
  })
})
