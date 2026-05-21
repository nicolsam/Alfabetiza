import type { DriveStep } from 'driver.js'
import {
  canManageSchoolScopedRecords,
  canManageTeachers,
  type StoredUser,
} from '@/lib/client-auth'

export const TOUR_STORAGE_PREFIX = 'aleno:tours:completed'

export const PRODUCT_TOUR_IDS = [
  'dashboard-overview',
  'student-assessment',
  'invite-teachers',
  'parent-report-sharing',
  'student-profile',
  'monthly-follow-up',
] as const

export type ProductTourId = (typeof PRODUCT_TOUR_IDS)[number]

export type ProductTour = {
  id: ProductTourId
  route: string
  requiredAnchor: string
  requires: 'authenticated' | 'student-profile' | 'manage-students' | 'manage-teachers'
}

export type TourStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type TourStep = DriveStep & {
  element: string
}

export const PRODUCT_TOURS: ProductTour[] = [
  {
    id: 'dashboard-overview',
    route: '/dashboard',
    requiredAnchor: 'dashboard-filters',
    requires: 'authenticated',
  },
  {
    id: 'student-assessment',
    route: '/dashboard/students',
    requiredAnchor: 'students-update-level-button',
    requires: 'manage-students',
  },
  {
    id: 'invite-teachers',
    route: '/dashboard/teachers',
    requiredAnchor: 'teachers-invite-card',
    requires: 'manage-teachers',
  },
  {
    id: 'parent-report-sharing',
    route: '/dashboard/students',
    requiredAnchor: 'students-first-profile-link',
    requires: 'student-profile',
  },
  {
    id: 'student-profile',
    route: '/dashboard/students',
    requiredAnchor: 'students-first-profile-link',
    requires: 'student-profile',
  },
  {
    id: 'monthly-follow-up',
    route: '/dashboard',
    requiredAnchor: 'dashboard-monthly-section',
    requires: 'authenticated',
  },
]

export function getTourStorageKey(tourId: ProductTourId): string {
  return `${TOUR_STORAGE_PREFIX}:${tourId}`
}

export function isTourCompleted(tourId: ProductTourId, storage?: TourStorage | null): boolean {
  return storage?.getItem(getTourStorageKey(tourId)) === 'true'
}

export function markTourCompleted(tourId: ProductTourId, storage?: TourStorage | null): void {
  storage?.setItem(getTourStorageKey(tourId), 'true')
}

export function clearTourCompleted(tourId: ProductTourId, storage?: TourStorage | null): void {
  storage?.removeItem(getTourStorageKey(tourId))
}

export function getAvailableTours(user: StoredUser | null): ProductTour[] {
  if (!user) return []

  return PRODUCT_TOURS.filter((tour) => {
    if (tour.requires === 'manage-students') return canManageSchoolScopedRecords(user)
    if (tour.requires === 'manage-teachers') return canManageTeachers(user)
    return true
  })
}

export function getTourAnchorSelector(anchor: string): string {
  return `[data-tour="${anchor}"]`
}

export function findMissingTourAnchor(
  steps: TourStep[],
  hasElement: (selector: string) => boolean = defaultHasElement,
): string | null {
  const missingStep = steps.find((step) => !hasElement(step.element))
  return missingStep?.element || null
}

function defaultHasElement(selector: string): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector(selector))
}
