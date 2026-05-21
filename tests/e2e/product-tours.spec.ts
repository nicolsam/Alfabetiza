import { expect, test } from '@playwright/test'
import { loginByApi } from './utils'

test.describe('Product tours', () => {
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

    await page.locator('.driver-popover-next-btn').click()
    await expect(page.locator('.driver-popover-title')).toHaveText('Open the invite form')
    await page.locator('.driver-popover-next-btn').click()

    await expect(page.getByText('Teacher details')).toBeVisible()
    await expect(page.getByText('Choose the school')).toBeVisible()
  })
})
