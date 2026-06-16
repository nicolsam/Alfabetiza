import { Page, expect } from '@playwright/test';

const PRODUCT_TOUR_IDS = [
  'dashboard-overview',
  'student-assessment',
  'student-import',
  'invite-teachers',
  'parent-report-sharing',
  'student-profile',
  'monthly-follow-up',
]

type LoginByApiOptions = {
  suppressAutoTours?: boolean
}

export async function login(page: Page, email: string, password = 'playwright123') {
  await page.addInitScript((tourIds) => {
    for (const tourId of tourIds) {
      localStorage.setItem(`alfabetiza:tours:auto-started:${tourId}`, 'true')
    }
  }, PRODUCT_TOUR_IDS)

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');
  
  // fill() is generally better, we only use slower methods if it fails
  await emailInput.fill(email);
  await passwordInput.fill(password);
  
  // Ensure inputs have the values
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);
  
  await page.getByRole('button', { name: /Login|Entrar/i }).click();
  
  // Wait for navigation to complete
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function loginByApi(
  page: Page,
  email: string,
  password = 'playwright123',
  selectedSchoolId = '',
  options: LoginByApiOptions = {}
) {
  const response = await page.request.post('/api/auth', {
    data: {
      action: 'login',
      email,
      password,
    },
  })

  expect(response.ok()).toBe(true)
  const { token, teacher } = await response.json()

  await page.addInitScript((authState) => {
    localStorage.setItem('token', authState.token)
    localStorage.setItem('teacher', JSON.stringify(authState.teacher))
    if (authState.selectedSchoolId) {
      localStorage.setItem('selectedSchool', authState.selectedSchoolId)
    }
    if (authState.suppressAutoTours) {
      for (const tourId of authState.productTourIds) {
        localStorage.setItem(`alfabetiza:tours:auto-started:${tourId}`, 'true')
      }
    }
  }, {
    token,
    teacher,
    selectedSchoolId,
    suppressAutoTours: options.suppressAutoTours ?? true,
    productTourIds: PRODUCT_TOUR_IDS,
  })
}
