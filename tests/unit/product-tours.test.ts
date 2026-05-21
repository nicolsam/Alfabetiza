import { describe, expect, it } from 'vitest'
import {
  filterAvailableTourSteps,
  findMissingTourAnchor,
  clearActiveTourDemo,
  getActiveTourDemo,
  getAutoStartTourIdForPath,
  getAvailableTours,
  getDriverProgressText,
  getTourAutoStartedStorageKey,
  getTourStartReadiness,
  getTourStorageKey,
  isTourAutoStarted,
  isTourCompleted,
  isTourDemoActive,
  isVisibleTourElement,
  markTourAutoStarted,
  markTourCompleted,
  setActiveTourDemo,
  type ProductTourId,
  type TourStorage,
  type TourStep,
} from '@/lib/product-tours'
import type { StoredUser } from '@/lib/client-auth'

class FakeTourStorage implements TourStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const teacher: StoredUser = {
  id: 'teacher-1',
  name: 'Teacher',
  email: 'teacher@example.com',
  schools: [{ schoolId: 'school-1', role: 'TEACHER' }],
}

const coordinator: StoredUser = {
  id: 'coordinator-1',
  name: 'Coordinator',
  email: 'coordinator@example.com',
  schools: [{ schoolId: 'school-1', role: 'COORDINATOR' }],
}

const admin: StoredUser = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@example.com',
  isGlobalAdmin: true,
  schools: [],
}

describe('product tours', () => {
  it('limits available tours by user permissions', () => {
    expect(tourIdsFor(teacher)).toEqual([
      'dashboard-overview',
      'parent-report-sharing',
      'student-profile',
      'monthly-follow-up',
    ])

    expect(tourIdsFor(coordinator)).toEqual([
      'dashboard-overview',
      'student-assessment',
      'invite-teachers',
      'parent-report-sharing',
      'student-profile',
      'monthly-follow-up',
    ])

    expect(tourIdsFor(admin)).toEqual([
      'dashboard-overview',
      'student-assessment',
      'invite-teachers',
      'parent-report-sharing',
      'student-profile',
      'monthly-follow-up',
    ])
  })

  it('stores completed tours in client storage', () => {
    const storage = new FakeTourStorage()
    const tourId: ProductTourId = 'dashboard-overview'

    expect(getTourStorageKey(tourId)).toBe('alfabetiza:tours:completed:dashboard-overview')
    expect(isTourCompleted(tourId, storage)).toBe(false)

    markTourCompleted(tourId, storage)

    expect(isTourCompleted(tourId, storage)).toBe(true)
  })

  it('stores auto-started tours separately from completed tours', () => {
    const storage = new FakeTourStorage()
    const tourId: ProductTourId = 'student-assessment'

    expect(getTourAutoStartedStorageKey(tourId)).toBe('alfabetiza:tours:auto-started:student-assessment')
    expect(isTourAutoStarted(tourId, storage)).toBe(false)

    markTourAutoStarted(tourId, storage)

    expect(isTourAutoStarted(tourId, storage)).toBe(true)
    expect(isTourCompleted(tourId, storage)).toBe(false)
  })

  it('stores active demo tours separately from completion state', () => {
    const storage = new FakeTourStorage()
    const tourId: ProductTourId = 'student-assessment'

    expect(getActiveTourDemo(storage)).toBeNull()

    setActiveTourDemo(tourId, storage)

    expect(getActiveTourDemo(storage)).toBe(tourId)
    expect(isTourDemoActive(tourId, storage)).toBe(true)
    expect(isTourCompleted(tourId, storage)).toBe(false)

    clearActiveTourDemo(storage)

    expect(getActiveTourDemo(storage)).toBeNull()
  })

  it('ignores invalid active demo tour ids', () => {
    const storage = new FakeTourStorage()
    storage.setItem('alfabetiza:tours:demo-active', 'old-app-tour')

    expect(getActiveTourDemo(storage)).toBeNull()
  })

  it('maps routes to first-open tours by permission', () => {
    expect(getAutoStartTourIdForPath('/dashboard', teacher)).toBe('dashboard-overview')
    expect(getAutoStartTourIdForPath('/dashboard/students', teacher)).toBeNull()
    expect(getAutoStartTourIdForPath('/dashboard/students', coordinator)).toBe('student-assessment')
    expect(getAutoStartTourIdForPath('/dashboard/teachers', coordinator)).toBe('invite-teachers')
    expect(getAutoStartTourIdForPath('/dashboard/students/student-1', teacher)).toBe('student-profile')
    expect(getAutoStartTourIdForPath('/dashboard/students/missing-updates', teacher)).toBe('monthly-follow-up')
  })

  it('finds the first missing tour anchor before a tour starts', () => {
    const steps: TourStep[] = [
      { element: '[data-tour="present"]' },
      { element: '[data-tour="missing"]' },
      { element: '[data-tour="later"]' },
    ]

    const missingAnchor = findMissingTourAnchor(steps, (selector) => selector !== '[data-tour="missing"]')

    expect(missingAnchor).toBe('[data-tour="missing"]')
  })

  it('classifies tour start readiness and prefers sample data only for supported tours', () => {
    expect(getTourStartReadiness(
      {
        id: 'student-assessment',
        route: '/dashboard/students',
        requiredAnchor: 'students-update-level-button',
        supportsDemoData: true,
        requires: 'manage-students',
      },
      () => false,
    )).toBe('demoAvailable')

    expect(getTourStartReadiness(
      {
        id: 'invite-teachers',
        route: '/dashboard/teachers',
        requiredAnchor: 'teachers-invite-card',
        requires: 'manage-teachers',
      },
      () => false,
    )).toBe('unavailable')

    expect(getTourStartReadiness(
      {
        id: 'dashboard-overview',
        route: '/dashboard',
        requiredAnchor: 'dashboard-filters',
        startAnchors: ['dashboard-filters', 'dashboard-reading-distribution'],
        supportsDemoData: true,
        requires: 'authenticated',
      },
      () => true,
    )).toBe('ready')
  })

  it('filters optional unavailable steps but keeps available required steps', () => {
    const steps: TourStep[] = [
      { element: '[data-tour="present"]' },
      { element: '[data-tour="optional-missing"]', optional: true },
      { element: '[data-tour="optional-present"]', optional: true },
    ]

    const filteredSteps = filterAvailableTourSteps(steps, (selector) => selector !== '[data-tour="optional-missing"]')

    expect(filteredSteps.map((step) => step.element)).toEqual([
      '[data-tour="present"]',
      '[data-tour="optional-present"]',
    ])
  })

  it('checks that tour targets are visible and measurable', () => {
    expect(isVisibleTourElement(null)).toBe(false)
    expect(isVisibleTourElement(fakeElement(0, 20))).toBe(false)
    expect(isVisibleTourElement(fakeElement(20, 0))).toBe(false)
    expect(isVisibleTourElement(fakeElement(20, 20))).toBe(true)
    expect(isVisibleTourElement({ ...fakeElement(20, 20), checkVisibility: () => false })).toBe(false)
  })

  it('builds Driver progress text without next-intl formatting', () => {
    expect(getDriverProgressText('en')).toBe('{{current}} of {{total}}')
    expect(getDriverProgressText('pt-BR')).toBe('{{current}} de {{total}}')
  })
})

function tourIdsFor(user: StoredUser): ProductTourId[] {
  return getAvailableTours(user).map((tour) => tour.id)
}

function fakeElement(width: number, height: number) {
  return {
    getBoundingClientRect: () => ({ width, height }),
  }
}
