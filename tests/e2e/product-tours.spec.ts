import { expect, test } from '@playwright/test'
import { loginByApi } from './utils'

test.describe('Product tours', () => {
  test('auto-starts the dashboard tour once on first page open', async ({ page }) => {
    await loginByApi(page, 'test-admin@example.com', 'playwright123', '', { suppressAutoTours: false })
    await page.goto('/dashboard')

    await expect(page.getByRole('button', { name: /Guided help/i })).toBeVisible()
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

    await expect(page.getByRole('button', { name: /Ajuda guiada/i })).toBeVisible()
    await expect(page.locator('.driver-popover')).toBeVisible()
    await page.locator('.driver-popover-close-btn').click()
    await page.getByRole('button', { name: /Ajuda guiada/i }).click()
    await expect(page.getByText('Explorar por tipo de ajuda')).toBeVisible()
    await expect(page.getByRole('button', { name: /Rotinas do dia a dia/ })).toBeVisible()
    expect(pageErrors.join('\n')).not.toContain('INVALID_MESSAGE')
  })

  test('starts dashboard and teacher invite tours without submitting data', async ({ page }) => {
    await loginByApi(page, 'test-admin@example.com')
    await page.goto('/dashboard')

    await page.getByRole('button', { name: /Guided help/i }).click()
    await expect(page.locator('[data-tour="tour-launcher"]').getByText('6')).toBeVisible()
    await expect(page.getByText('What would you like to learn?')).toBeVisible()
    await expectGuidedHelpMenuAboveMain(page)
    await expect(page.getByText('Suggested now')).toBeVisible()
    await expect(page.getByText('Browse by help type')).toBeVisible()
    await expect(page.getByRole('button', { name: /Start here/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Daily workflows/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sharing and team/ })).toBeVisible()
    await expect(page.getByText('Dashboard overview')).toBeVisible()
    await expect(page.getByText('Invite Teachers')).toBeHidden()
    await expect(page.getByText('New').first()).toBeVisible()
    await expect(page.getByText('Uses example data when empty').first()).toBeVisible()

    await page.getByText('Dashboard overview').click()

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Filter the dashboard')).toBeVisible()

    await page.locator('.driver-popover-close-btn').click()
    await expect(page.locator('.driver-popover')).toBeHidden()

    await page.getByRole('button', { name: /Guided help/i }).click()
    await expect(page.locator('[data-tour="tour-launcher"]').getByText('5')).toBeVisible()
    await page.getByRole('button', { name: /Sharing and team/ }).click()
    await expect(page.getByRole('button', { name: /Back/ })).toBeVisible()
    await expect(page.getByText('Parent report sharing')).toBeVisible()
    await page.getByRole('button', { name: /Back/ }).click()
    await expect(page.getByText('Browse by help type')).toBeVisible()
    await page.getByRole('button', { name: /Sharing and team/ }).click()
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

  test('keeps guided help attention animation until the user interacts with it', async ({ page }) => {
    await loginByApi(page, 'test-admin@example.com')
    await page.goto('/dashboard')

    const launcher = page.locator('[data-tour="tour-launcher"]')
    await expect(launcher).toHaveAttribute('data-guided-help-attention', 'true')

    await page.getByRole('button', { name: /Guided help/i }).click()

    await expect(launcher).not.toHaveAttribute('data-guided-help-attention', 'true')
    await expect.poll(() => page.evaluate(() => (
      window.localStorage.getItem('alfabetiza:guided-help:attention-dismissed')
    ))).toBe('true')

    await page.reload()
    await expect(launcher).not.toHaveAttribute('data-guided-help-attention', 'true')
  })

  test('closes guided help when users click outside or open an app modal', async ({ page }) => {
    await loginByApi(page, 'test-admin@example.com')
    await page.goto('/dashboard')

    await page.getByRole('button', { name: /Guided help/i }).click()
    await expect(page.locator('[data-tour="guided-help-menu"]')).toBeVisible()

    await page.locator('[data-tour="dashboard-filters"]').click()
    await expect(page.locator('[data-tour="guided-help-menu"]')).toBeHidden()

    await page.goto('/dashboard/students')
    await page.getByRole('button', { name: /Guided help/i }).click()
    await expect(page.locator('[data-tour="guided-help-menu"]')).toBeVisible()

    await page.getByRole('button', { name: /Add Student/i }).click()
    await expect(page.locator('[data-tour="guided-help-menu"]')).toBeHidden()
    await expect(page.locator('[data-app-modal="true"]')).toBeVisible()
    await expectAppModalHasNoSpacing(page)
    await expectSidebarCoveredByModal(page)
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
    await page.getByRole('button', { name: /Guided help/i }).click()
    await page.getByRole('button', { name: /Daily workflows/ }).click()
    await expect(page.getByText('Student assessment flow')).toBeVisible()
    await expect(page.getByText('Monthly follow-up workflow')).toBeVisible()
    await expect(page.getByText('Dashboard overview')).toBeHidden()
    await page.getByText('Student assessment flow').click()

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Example')).toBeVisible()

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
    await page.getByRole('button', { name: /Guided help/i }).click()
    await page.getByRole('button', { name: /Start here/ }).click()
    await page.getByText('Student profile guide').click()

    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.getByText('Open a student profile')).toBeVisible()
    await expect(page.getByText('Example')).toBeVisible()

    await page.locator('.driver-popover-next-btn').click()

    await expect(page).toHaveURL(/\/dashboard\/students\/tour-demo-student/)
    await expect(page.locator('[data-tour="student-profile-summary"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Aluno Exemplo' })).toBeVisible()
  })
})

async function expectGuidedHelpMenuAboveMain(page: import('@playwright/test').Page) {
  const menu = page.locator('[data-tour="guided-help-menu"]')
  await expect(menu).toBeVisible()

  const isMenuOnTop = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const pointX = rect.right - 8
    const pointY = rect.top + rect.height / 2
    return element.contains(document.elementFromPoint(pointX, pointY))
  })

  expect(isMenuOnTop).toBe(true)
}

async function expectSidebarCoveredByModal(page: import('@playwright/test').Page) {
  const isSidebarCovered = await page.locator('aside').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const pointX = rect.left + rect.width / 2
    const pointY = rect.top + rect.height / 2
    return !element.contains(document.elementFromPoint(pointX, pointY))
  })

  expect(isSidebarCovered).toBe(true)
}

async function expectAppModalHasNoSpacing(page: import('@playwright/test').Page) {
  const spacing = await page.locator('[data-app-modal="true"]').evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      marginBlockEnd: style.marginBlockEnd,
      marginBlockStart: style.marginBlockStart,
      marginBottom: style.marginBottom,
      marginTop: style.marginTop,
    }
  })

  expect(spacing).toEqual({
    marginBlockEnd: '0px',
    marginBlockStart: '0px',
    marginBottom: '0px',
    marginTop: '0px',
  })
}
