import { describe, expect, it } from 'vitest'
import {
  GUIDED_HELP_ATTENTION_STORAGE_KEY,
  filterAvailableTourSteps,
  findMissingTourAnchor,
  clearActiveTourDemo,
  getActiveTourDemo,
  getAutoStartTourIdForPath,
  getAvailableTours,
  getDriverProgressText,
  getGuidedHelpCategories,
  getGuidedHelpCategoryGuideCount,
  getGuidedHelpSections,
  getGuidedHelpToursForCategory,
  getSuggestedTourForPath,
  getTourAutoStartedStorageKey,
  getTourSeenVersion,
  getTourSeenVersionStorageKey,
  getTourStartReadiness,
  getTourStorageKey,
  getTourUpdateState,
  isTourAutoStarted,
  isTourCompleted,
  isTourDemoActive,
  isVisibleTourElement,
  markTourAutoStarted,
  markTourCompleted,
  markTourVersionSeen,
  setActiveTourDemo,
  TOUR_SEEN_VERSION_STORAGE_PREFIX,
  type ProductTour,
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
      'student-profile',
      'monthly-follow-up',
      'parent-report-sharing',
    ])

    expect(tourIdsFor(coordinator)).toEqual([
      'dashboard-overview',
      'student-profile',
      'student-assessment',
      'monthly-follow-up',
      'parent-report-sharing',
      'invite-teachers',
    ])

    expect(tourIdsFor(admin)).toEqual([
      'dashboard-overview',
      'student-profile',
      'student-assessment',
      'monthly-follow-up',
      'parent-report-sharing',
      'invite-teachers',
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

  it('uses a stable storage key for the guided help attention cue', () => {
    expect(GUIDED_HELP_ATTENTION_STORAGE_KEY).toBe('alfabetiza:guided-help:attention-dismissed')
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

  it('tracks new and updated guide versions in client storage', () => {
    const storage = new FakeTourStorage()
    const tour = {
      id: 'dashboard-overview',
      version: 2,
      route: '/dashboard',
      requiredAnchor: 'dashboard-filters',
      category: 'start-here',
      order: 10,
      requires: 'authenticated',
    } satisfies ProductTour

    expect(TOUR_SEEN_VERSION_STORAGE_PREFIX).toBe('alfabetiza:tours:seen-version')
    expect(getTourSeenVersionStorageKey(tour.id)).toBe('alfabetiza:tours:seen-version:dashboard-overview')
    expect(getTourSeenVersion(tour.id, storage)).toBeNull()
    expect(getTourUpdateState(tour, storage)).toBe('new')

    markTourVersionSeen(tour, storage)

    expect(getTourSeenVersion(tour.id, storage)).toBe(2)
    expect(getTourUpdateState(tour, storage)).toBeNull()

    expect(getTourUpdateState({ ...tour, version: 3 }, storage)).toBe('updated')
  })

  it('does not mark already completed legacy guides as new without a seen version', () => {
    const storage = new FakeTourStorage()
    const tour = {
      id: 'monthly-follow-up',
      version: 1,
      route: '/dashboard',
      requiredAnchor: 'dashboard-missing-updates-card',
      category: 'daily-workflows',
      order: 20,
      requires: 'authenticated',
    } satisfies ProductTour

    markTourCompleted(tour.id, storage)

    expect(getTourUpdateState(tour, storage)).toBeNull()
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

  it('selects the suggested guide for the current route', () => {
    const availableTours = getAvailableTours(coordinator)

    expect(getSuggestedTourForPath('/dashboard', coordinator, availableTours)?.id).toBe('dashboard-overview')
    expect(getSuggestedTourForPath('/dashboard/students', coordinator, availableTours)?.id).toBe('student-assessment')
    expect(getSuggestedTourForPath('/dashboard/students', teacher, getAvailableTours(teacher))).toBeNull()
    expect(getSuggestedTourForPath('/dashboard/teachers', coordinator, availableTours)?.id).toBe('invite-teachers')
  })

  it('groups guides and removes the suggested guide from its normal section', () => {
    const availableTours = getAvailableTours(coordinator)
    const suggestedTour = getSuggestedTourForPath('/dashboard/students', coordinator, availableTours)
    const sections = getGuidedHelpSections(availableTours, suggestedTour)

    expect(sections.map((section) => section.id)).toEqual([
      'suggested-now',
      'start-here',
      'daily-workflows',
      'sharing-and-team',
    ])
    expect(sections[0].tours.map((tour) => tour.id)).toEqual(['student-assessment'])
    expect(sections[1].tours.map((tour) => tour.id)).toEqual([
      'dashboard-overview',
      'student-profile',
    ])
    expect(sections[2].tours.map((tour) => tour.id)).toEqual(['monthly-follow-up'])
    expect(sections[3].tours.map((tour) => tour.id)).toEqual([
      'parent-report-sharing',
      'invite-teachers',
    ])
  })

  it('groups guides without a suggested section when no guide is recommended', () => {
    const sections = getGuidedHelpSections(getAvailableTours(teacher), null)

    expect(sections.map((section) => section.id)).toEqual([
      'start-here',
      'daily-workflows',
      'sharing-and-team',
    ])
    expect(sections.flatMap((section) => section.tours.map((tour) => tour.id))).toEqual([
      'dashboard-overview',
      'student-profile',
      'monthly-follow-up',
      'parent-report-sharing',
    ])
  })

  it('returns available help categories with guide counts by permission', () => {
    expect(getGuidedHelpCategories(getAvailableTours(teacher))).toEqual([
      { id: 'start-here', count: 2 },
      { id: 'daily-workflows', count: 1 },
      { id: 'sharing-and-team', count: 1 },
    ])

    expect(getGuidedHelpCategories(getAvailableTours(coordinator))).toEqual([
      { id: 'start-here', count: 2 },
      { id: 'daily-workflows', count: 2 },
      { id: 'sharing-and-team', count: 2 },
    ])
  })

  it('returns guides for one help category without removing the suggested guide', () => {
    const availableTours = getAvailableTours(coordinator)

    expect(getGuidedHelpToursForCategory(availableTours, 'daily-workflows').map((tour) => tour.id)).toEqual([
      'student-assessment',
      'monthly-follow-up',
    ])
    expect(getGuidedHelpCategoryGuideCount(availableTours, 'sharing-and-team')).toBe(2)
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
        version: 1,
        route: '/dashboard/students',
        requiredAnchor: 'students-update-level-button',
        supportsDemoData: true,
        category: 'daily-workflows',
        order: 10,
        requires: 'manage-students',
      },
      () => false,
    )).toBe('demoAvailable')

    expect(getTourStartReadiness(
      {
        id: 'invite-teachers',
        version: 1,
        route: '/dashboard/teachers',
        requiredAnchor: 'teachers-invite-card',
        category: 'sharing-and-team',
        order: 20,
        requires: 'manage-teachers',
      },
      () => false,
    )).toBe('unavailable')

    expect(getTourStartReadiness(
      {
        id: 'dashboard-overview',
        version: 1,
        route: '/dashboard',
        requiredAnchor: 'dashboard-filters',
        startAnchors: ['dashboard-filters', 'dashboard-reading-distribution'],
        supportsDemoData: true,
        category: 'start-here',
        order: 10,
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
