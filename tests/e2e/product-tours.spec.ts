import { expect, test } from '@playwright/test'
import { loginByApi } from './utils'

test.describe('Product tours', () => {
  test('auto-starts the dashboard tour once on first page open', async ({ page }) => {
    await loginByApi(page, 'test-admin@example.com', 'playwright123', '', { suppressAutoTours: false })
    await page.goto('/dashboard')

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Filter the dashboard')).toBeVisible()

    await page.locator('.driver-popover-close-btn').click()
    await expect(page.locator('.driver-popover')).toBeHidden()

    await page.reload()
    await page.waitForTimeout(1300)

    await expect(page.locator('.driver-popover')).toBeHidden()
  })

  test('auto-starts Portuguese dashboard tour without intl placeholder errors', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'pt-BR', domain: 'localhost', path: '/' }])
    await loginByApi(page, 'test-admin@example.com', 'playwright123', '', { suppressAutoTours: false })
    await page.goto('/dashboard')

    await expect(page.locator('.driver-popover')).toBeVisible()
    expect(pageErrors.join('\n')).not.toContain('INVALID_MESSAGE')
  })

  test('starts dashboard and teacher invite tours without submitting data', async ({ page }) => {
    await loginByApi(page, 'test-admin@example.com')
    await page.goto('/dashboard')

    await page.getByRole('button', { name: /Tours/i }).click()
    await expect(page.getByText('Dashboard overview')).toBeVisible()
    await expect(page.getByText('Invite Teachers')).toBeVisible()

    await page.getByText('Dashboard overview').click()

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Filter the dashboard')).toBeVisible()

    await page.locator('.driver-popover-close-btn').click()
    await expect(page.locator('.driver-popover')).toBeHidden()

    await page.getByRole('button', { name: /Tours/i }).click()
    await page.getByText('Invite Teachers').click()

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Teacher invitations')).toBeVisible()

    await page.locator('[data-tour="teachers-open-invite"]').click({ timeout: 1000 }).catch(() => undefined)
    await expect(page.getByText('Teacher details')).toBeHidden()

    await page.locator('.driver-popover-next-btn').click()
    await expect(page.locator('.driver-popover-title')).toHaveText('Open the invite form')
    await page.locator('.driver-popover-next-btn').click()

    await expect(page.getByText('Teacher details')).toBeVisible()
    await expect(page.getByText('Choose the school')).toBeVisible()

    await page.locator('.driver-popover-close-btn').click()
    await expect(page.getByText('Teacher details')).toBeHidden()
  })

  test('starts the student assessment tour with sample data on an empty students page', async ({ page }) => {
    const updateRequests: string[] = []

    await page.route(/\/api\/students(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ students: [] }),
      })
    })
    await page.route('**/api/students/update', async (route) => {
      updateRequests.push(route.request().method())
      await route.abort()
    })

    await loginByApi(page, 'test-admin@example.com')
    await page.goto('/dashboard/students')
    await page.getByRole('button', { name: /Tours/i }).click()
    await page.getByText('Student assessment flow').click()

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Example')).toBeVisible()
    await expect(page.getByText('This tour needs existing data on the page before it can start.')).toBeHidden()

    await page.locator('.driver-popover-next-btn').click()
    await page.locator('.driver-popover-next-btn').click()
    await page.locator('.driver-popover-next-btn').click()

    await expect(page.locator('[data-tour="assessment-modal"]')).toBeVisible()
    await page.locator('.driver-popover-close-btn').click()
    await expect(page.locator('[data-tour="assessment-modal"]')).toBeHidden()
    expect(updateRequests).toEqual([])
  })

  test('opens the student profile tour with an example student when no students exist', async ({ page }) => {
    await page.route(/\/api\/students(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ students: [] }),
      })
    })

    await loginByApi(page, 'test-admin@example.com')
    await page.goto('/dashboard/students')
    await page.getByRole('button', { name: /Tours/i }).click()
    await page.getByText('Student profile walkthrough').click()

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Open a student profile')).toBeVisible()
    await expect(page.getByText('Example')).toBeVisible()

    await page.locator('.driver-popover-next-btn').click()

    await expect(page).toHaveURL(/\/dashboard\/students\/tour-demo-student/)
    await expect(page.locator('[data-tour="student-profile-summary"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Aluno Exemplo' })).toBeVisible()
  })
})
