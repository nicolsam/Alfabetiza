import { test, expect } from '@playwright/test';
import { login } from './utils';
import { prisma } from '../../src/lib/db';
import bcrypt from 'bcryptjs';

test.describe('Alfabetiza E2E Workflow', () => {
  test.beforeEach(async ({ context }) => {
    // Force Portuguese locale
    await context.addCookies([{
      name: 'NEXT_LOCALE',
      value: 'pt-BR',
      url: 'http://localhost:3000',
    }]);
  });

  test('should go through the full workflow: register, school, class, student, and filtering', async ({ page }) => {
    const userEmail = `teacher_${Date.now()}@example.com`;
    const hashedPassword = await bcrypt.hash('password123', 10);
    await prisma.user.create({
      data: {
        name: 'Test Teacher',
        email: userEmail,
        password: hashedPassword,
        isGlobalAdmin: true,
      },
    });

    let schoolName = '';
    let sectionName = '';

    try {
      // 1. Login
      await login(page, userEmail, 'password123');

      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('main h1')).toContainText(/Painel|Dashboard/);

    // 2. Create School
    schoolName = `Test School ${Date.now()}`;
    await page.getByRole('link', { name: /Escolas|Schools/ }).click();
    const addSchoolButton = page.getByRole('button', { name: /Adicionar Escola|Add School/ });
    await expect(addSchoolButton).toHaveAttribute('data-slot', 'button');
    await expect(addSchoolButton.locator('svg')).toBeVisible();
    await addSchoolButton.click();
    await page.fill('input[placeholder*="escola"]', schoolName);
    // Click the submit button inside the modal
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('[data-app-modal="true"]')).toBeHidden();
    await expect(page.locator('main').locator(`text=${schoolName}`).first()).toBeVisible();

    // 3. Create Class
    sectionName = 'X' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    await page.getByRole('link', { name: /Turmas|Classes/ }).click();
    const addClassButton = page.getByRole('button', { name: /Adicionar Turma|Add Class/ });
    await expect(addClassButton).toHaveAttribute('data-slot', 'button');
    await expect(addClassButton.locator('svg')).toBeVisible();
    await addClassButton.click();
    await page.locator('select').filter({ hasText: /Selecionar escola|Select school/ }).selectOption({ label: schoolName });
    await page.locator('select').filter({ hasText: /Selecionar ano|Select grade/ }).selectOption('1º Ano');
    await page.fill('input[placeholder*="Turma"], input[placeholder*="Section"]', sectionName);
    await page.locator('select').filter({ hasText: /Selecionar turno|Select shift/ }).selectOption('Morning');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('[data-app-modal="true"]')).toBeHidden();
    await expect(page.locator('table').locator('text=1º Ano').first()).toBeVisible();

    // 4. Create Student
    await page.getByRole('link', { name: /Alunos|Students/ }).click();
    const addStudentButton = page.getByRole('button', { name: /Adicionar Aluno|Add Student/ });
    await expect(addStudentButton).toHaveAttribute('data-slot', 'button');
    await expect(addStudentButton.locator('svg')).toBeVisible();
    await addStudentButton.click();
    await page.getByRole('combobox').filter({ hasText: /Selecionar uma turma|Select a class/ }).click();
    await page.getByRole('option', { name: new RegExp('1º Ano ' + sectionName) }).click();
    await page.fill('input[placeholder*="Nome"], input[placeholder*="Name"]', 'John Doe');
    await page.fill('input[placeholder*="Matrícula"], input[placeholder*="Enrollment"]', 'STUD001');
    // Click Next to go to Step 2 (Contacts)
    await page.getByRole('button', { name: /^(Avançar|Next)$/ }).click();
    // Click Next to go to Step 3 (Review)
    await page.getByRole('button', { name: /^(Avançar|Next)$/ }).click();
    // Click Save to create the student
    await page.getByRole('button', { name: /Salvar|Save/ }).click();
    await expect(page.locator('[data-app-modal="true"]')).toBeHidden();
    await expect(page.locator('main').locator('text=John Doe').first()).toBeVisible();

    // 5. Verify Filters
    await page.getByTestId('students-grade-filter').click();
    await page.getByRole('option', { name: '1º Ano', exact: true }).click();
    await expect(page.locator('main').locator('text=John Doe').first()).toBeVisible();

    // Wait for the modal or filter overlay to close before continuing interactions
    await page.waitForLoadState('networkidle');

    await page.getByTestId('students-section-filter').click();
    await page.getByRole('option', { name: sectionName, exact: true }).click();
    await expect(page.locator('main').locator('text=John Doe').first()).toBeVisible();

    // Wait for networkidle/hydration
    await page.waitForLoadState('networkidle');

    await page.getByTestId('students-shift-filter').click();
    await page.getByRole('option', { name: /Manhã|Morning/ }).click();
    await expect(page.locator('main').locator('text=John Doe').first()).toBeVisible();
    } finally {
      // Clean up database entities created by the test
      const testUser = await prisma.user.findUnique({
        where: { email: userEmail },
      });
      const school = await prisma.school.findFirst({
        where: { name: schoolName },
        include: {
          classes: {
            include: {
              enrollments: true,
            },
          },
        },
      });

      if (school) {
        const schoolIds = [school.id];
        const classIds = school.classes.map((c) => c.id);
        const studentIds = school.classes.flatMap((c) => c.enrollments.map((e) => e.studentId));

        await prisma.studentCommentary.deleteMany({ where: { studentId: { in: studentIds } } });
        await prisma.studentAssessment.deleteMany({ where: { studentId: { in: studentIds } } });
        await prisma.studentContact.deleteMany({ where: { studentId: { in: studentIds } } });
        await prisma.studentParentReportLink.deleteMany({ where: { studentId: { in: studentIds } } });
        await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: studentIds } } });
        await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
        await prisma.class.deleteMany({ where: { id: { in: classIds } } });
        await prisma.userSchool.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      }

      if (testUser) {
        await prisma.userSchool.deleteMany({ where: { userId: testUser.id } });
        await prisma.userSession.deleteMany({ where: { userId: testUser.id } });
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    }
  });
});
