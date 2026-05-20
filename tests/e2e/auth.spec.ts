import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Authentication Flow', () => {
  test('should show refreshed login content and password controls', async ({ page }) => {
    let releaseAuthRequest!: () => void;
    let markAuthRequestStarted!: () => void;
    const authRequestStarted = new Promise<void>((resolve) => {
      markAuthRequestStarted = resolve;
    });
    const authRequestReleased = new Promise<void>((resolve) => {
      releaseAuthRequest = resolve;
    });

    await page.route('**/api/auth', async (route) => {
      markAuthRequestStarted();
      await authRequestReleased;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      });
    });

    await page.goto('/login');
    await expect(page.getByText(/Track students' reading levels|Acompanhe o nível de leitura/)).toBeVisible();
    await expect(page.getByText(/Platform for school literacy tracking|Plataforma para acompanhamento/)).toBeVisible();

    const passwordInput = page.getByPlaceholder(/Password|Senha/);
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /Show password|Mostrar senha/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /Hide password|Ocultar senha/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByPlaceholder(/Email|E-mail/).fill('test-regular@example.com');
    await passwordInput.fill('wrong-password');
    await page.getByRole('button', { name: /Login|Entrar/i }).click();

    await authRequestStarted;
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
    await expect(submitButton.locator('svg.animate-spin')).toBeVisible();

    releaseAuthRequest();
    await expect(page.getByText(/Invalid credentials|Credenciais inválidas/i)).toBeVisible();
  });

  test('should login successfully and redirect to dashboard', async ({ page }) => {
    await login(page, 'test-regular@example.com');
    
    // Check if user's name appears in the sidebar
    await expect(page.locator('text=E2E Regular Teacher')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    await login(page, 'test-regular@example.com');

    // The logout text changes based on locale, so we look for either
    const logoutBtn = page.locator('button', { hasText: /Logout|Sair/i });
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should be back at login
    await expect(page).toHaveURL(/\/login/);
  });
});
