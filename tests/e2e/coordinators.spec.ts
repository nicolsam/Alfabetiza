import { test, expect } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/lib/db'
import { loginByApi } from './utils'

const ADMIN_EMAIL = 'test-admin@example.com'
const PASSWORD = 'playwright123'

const SCHOOL = {
  id: 'e2e-coordinators-school',
  name: 'E2E Coordinators School',
  address: 'Coordinator Street',
}
const OTHER_SCHOOL = {
  id: 'e2e-coordinators-other-school',
  name: 'E2E Other Coordinators School',
  address: 'Other Coordinator Street',
}
const TEACHER = {
  id: 'e2e-coordinators-teacher',
  name: 'E2E Split Teacher',
  email: 'e2e-split-teacher@example.com',
}
const COORDINATOR = {
  id: 'e2e-coordinators-coordinator',
  name: 'E2E Same School Coordinator',
  email: 'e2e-same-coordinator@example.com',
}
const OTHER_COORDINATOR = {
  id: 'e2e-coordinators-other-coordinator',
  name: 'E2E Other School Coordinator',
  email: 'e2e-other-coordinator@example.com',
}
const COORDINATOR_INVITE = {
  id: 'e2e-coordinators-invite',
  name: 'E2E Pending Coordinator',
  email: 'e2e-pending-coordinator@example.com',
}
const OTHER_COORDINATOR_INVITE = {
  id: 'e2e-coordinators-other-invite',
  name: 'E2E Other Pending Coordinator',
  email: 'e2e-other-pending-coordinator@example.com',
}

async function cleanupCoordinatorFixtures() {
  const schoolIds = [SCHOOL.id, OTHER_SCHOOL.id]
  const userIds = [TEACHER.id, COORDINATOR.id, OTHER_COORDINATOR.id]
  const inviteIds = [COORDINATOR_INVITE.id, OTHER_COORDINATOR_INVITE.id]

  await prisma.userInvite.deleteMany({ where: { id: { in: inviteIds } } })
  await prisma.userSchool.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { schoolId: { in: schoolIds } }] } })
  await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } })
}

async function seedCoordinatorFixtures() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (!admin) throw new Error(`Missing E2E admin: ${ADMIN_EMAIL}`)

  const password = await bcrypt.hash(PASSWORD, 10)

  await prisma.school.createMany({ data: [SCHOOL, OTHER_SCHOOL] })
  await prisma.user.createMany({
    data: [
      { ...TEACHER, password },
      { ...COORDINATOR, password, gender: 'FEMALE' },
      { ...OTHER_COORDINATOR, password },
    ],
  })
  await prisma.userSchool.createMany({
    data: [
      { userId: TEACHER.id, schoolId: SCHOOL.id, role: 'TEACHER' },
      { userId: COORDINATOR.id, schoolId: SCHOOL.id, role: 'COORDINATOR' },
      { userId: OTHER_COORDINATOR.id, schoolId: OTHER_SCHOOL.id, role: 'COORDINATOR' },
    ],
  })
  await prisma.userInvite.createMany({
    data: [
      {
        ...COORDINATOR_INVITE,
        role: 'COORDINATOR',
        schoolId: SCHOOL.id,
        token: 'e2e-coordinators-token',
        tokenHash: 'e2e-coordinators-token-hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
      {
        ...OTHER_COORDINATOR_INVITE,
        role: 'COORDINATOR',
        schoolId: OTHER_SCHOOL.id,
        token: 'e2e-coordinators-other-token',
        tokenHash: 'e2e-coordinators-other-token-hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
    ],
  })
}

async function loginFreshByApi(page: Parameters<typeof loginByApi>[0], email: string) {
  await prisma.userSession.deleteMany({ where: { user: { email } } })
  await loginByApi(page, email)
}

test.describe('coordinator management split', () => {
  test.beforeAll(async () => {
    await cleanupCoordinatorFixtures()
    await seedCoordinatorFixtures()
  })

  test.afterAll(async () => {
    await cleanupCoordinatorFixtures()
  })

  test('keeps coordinators out of the teachers page for admins', async ({ page }) => {
    await loginFreshByApi(page, ADMIN_EMAIL)
    await page.goto('/dashboard/teachers')

    await expect(page.getByText(TEACHER.name)).toBeVisible()
    await expect(page.getByText(COORDINATOR.name)).toBeHidden()
  })

  test('lets admins manage coordinators from the coordinators page', async ({ page }) => {
    await loginFreshByApi(page, ADMIN_EMAIL)
    await page.goto('/dashboard/coordinators')

    await expect(page.getByText(COORDINATOR.name)).toBeVisible()
    await expect(page.getByText(COORDINATOR_INVITE.name)).toBeVisible()
    await expect(page.getByTestId('coordinator-invite-button')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Actions|Ações/ })).toBeVisible()
  })

  test('shows coordinators a read-only same-school coordinator view', async ({ page }) => {
    await loginFreshByApi(page, COORDINATOR.email)
    await page.goto('/dashboard/coordinators')

    await expect(page.getByRole('cell', { name: COORDINATOR.name })).toBeVisible()
    await expect(page.getByText(COORDINATOR_INVITE.name)).toBeVisible()
    await expect(page.getByText(OTHER_COORDINATOR.name)).toBeHidden()
    await expect(page.getByText(OTHER_COORDINATOR_INVITE.name)).toBeHidden()
    await expect(page.getByTestId('coordinator-invite-button')).toBeHidden()
    await expect(page.getByRole('columnheader', { name: /Actions|Ações/ })).toBeHidden()
  })

  test('uses coordinator gender in Portuguese role labels', async ({ page }) => {
    await loginFreshByApi(page, ADMIN_EMAIL)
    await page.goto('/dashboard/coordinators')
    await page.locator('button', { hasText: /^PT$/ }).click()

    await expect(page.getByRole('row', { name: new RegExp(COORDINATOR.name) })).toContainText('Coordenadora Pedagógica')
  })

  test('shows clear Portuguese validation messages in the coordinator invite modal', async ({ page }) => {
    await loginFreshByApi(page, ADMIN_EMAIL)
    await page.goto('/dashboard/coordinators')
    await page.locator('button', { hasText: /^PT$/ }).click()
    await page.getByTestId('coordinator-invite-button').click()
    const inviteForm = page.locator('form')

    await page.getByRole('button', { name: 'Criar convite' }).click()
    await expect(inviteForm.getByText('Selecione uma escola antes de criar o convite do coordenador.')).toBeVisible()
    await expect(inviteForm.getByText('Informe o nome completo do coordenador.')).toBeVisible()
    await expect(inviteForm.getByText('Informe o e-mail do coordenador.')).toBeVisible()

    await page.getByText('Selecionar escola').click()
    await page.getByRole('option', { name: SCHOOL.name }).click()
    await page.locator('form input').nth(0).fill('Coordenadora Valida')
    await page.locator('form input').nth(1).fill('email-invalido')
    await page.getByRole('button', { name: 'Criar convite' }).click()

    await expect(inviteForm.getByText('Informe um e-mail válido para o coordenador, como coordenador@escola.com.')).toBeVisible()
  })
})
