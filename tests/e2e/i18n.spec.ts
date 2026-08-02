import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('i18n Localization', () => {
  test('should translate sidebar navigation when switching language to Portuguese', async ({ page }) => {
    await login(page, 'test-admin@example.com');

    // Click the PT language switcher button
    const ptButton = page.locator('button', { hasText: /^PT$/ });
    await ptButton.click();

    // Wait for the translation to apply (sidebar links)
    await expect(page.locator('nav').getByRole('link', { name: 'Alunos' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Escolas' })).toBeVisible();
    await expect(page.locator('nav')).toContainText('Visão geral');
    await expect(page.locator('nav')).toContainText('Acompanhamento');
    await expect(page.locator('nav')).toContainText('Gestão');
    await expect(page.locator('nav')).toContainText('Sistema');
  });

  test('should translate sidebar navigation when switching language to English', async ({ page }) => {
    await login(page, 'test-admin@example.com');

    // Click the EN language switcher button
    const enButton = page.locator('button', { hasText: /^EN$/ });
    await enButton.click();

    // Wait for the translation to apply (sidebar links)
    await expect(page.locator('nav').getByRole('link', { name: 'Students' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Schools' })).toBeVisible();
    await expect(page.locator('nav')).toContainText('Overview');
    await expect(page.locator('nav')).toContainText('Learning');
    await expect(page.locator('nav')).toContainText('Management');
    await expect(page.locator('nav')).toContainText('System');
  });
});
