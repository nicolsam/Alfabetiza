import { describe, expect, it } from 'vitest'
import {
  findMissingTourAnchor,
  getAvailableTours,
  getTourStorageKey,
  isTourCompleted,
  markTourCompleted,
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

    expect(getTourStorageKey(tourId)).toBe('aleno:tours:completed:dashboard-overview')
    expect(isTourCompleted(tourId, storage)).toBe(false)

    markTourCompleted(tourId, storage)

    expect(isTourCompleted(tourId, storage)).toBe(true)
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
})

function tourIdsFor(user: StoredUser): ProductTourId[] {
  return getAvailableTours(user).map((tour) => tour.id)
}
