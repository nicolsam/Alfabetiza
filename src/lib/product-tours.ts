import type { DriveStep } from 'driver.js'
import {
  canManageSchoolScopedRecords,
  canManageTeachers,
  type StoredUser,
} from '@/lib/client-auth'

export const TOUR_COMPLETED_STORAGE_PREFIX = 'alfabetiza:tours:completed'
export const TOUR_AUTO_STARTED_STORAGE_PREFIX = 'alfabetiza:tours:auto-started'
export const TOUR_DEMO_STORAGE_KEY = 'alfabetiza:tours:demo-active'
export const TOUR_DEMO_MODE_EVENT = 'alfabetiza:tour-demo-mode-change'
export const TOUR_DEMO_STUDENT_ID = 'tour-demo-student'

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
  startAnchors?: string[]
  supportsDemoData?: boolean
  requires: 'authenticated' | 'student-profile' | 'manage-students' | 'manage-teachers'
}

export type TourStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type TourStartReadiness = 'ready' | 'demoAvailable' | 'unavailable'
export type TourTargetElement = {
  checkVisibility?: () => boolean
  getBoundingClientRect: () => Pick<DOMRect, 'width' | 'height'>
}

export type TourStep = DriveStep & {
  element: string
  optional?: boolean
}

export const PRODUCT_TOURS: ProductTour[] = [
  {
    id: 'dashboard-overview',
    route: '/dashboard',
    requiredAnchor: 'dashboard-filters',
    startAnchors: [
      'dashboard-filters',
      'dashboard-monthly-updated-card',
      'dashboard-improved-card',
      'dashboard-need-attention-card',
      'dashboard-missing-updates-card',
      'dashboard-reading-distribution',
    ],
    supportsDemoData: true,
    requires: 'authenticated',
  },
  {
    id: 'student-assessment',
    route: '/dashboard/students',
    requiredAnchor: 'students-update-level-button',
    supportsDemoData: true,
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
    supportsDemoData: true,
    requires: 'student-profile',
  },
  {
    id: 'student-profile',
    route: '/dashboard/students',
    requiredAnchor: 'students-first-profile-link',
    supportsDemoData: true,
    requires: 'student-profile',
  },
  {
    id: 'monthly-follow-up',
    route: '/dashboard',
    requiredAnchor: 'dashboard-missing-updates-card',
    supportsDemoData: true,
    requires: 'authenticated',
  },
]

export function getTourStorageKey(tourId: ProductTourId): string {
  return `${TOUR_COMPLETED_STORAGE_PREFIX}:${tourId}`
}

export function getTourAutoStartedStorageKey(tourId: ProductTourId): string {
  return `${TOUR_AUTO_STARTED_STORAGE_PREFIX}:${tourId}`
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

export function isTourAutoStarted(tourId: ProductTourId, storage?: TourStorage | null): boolean {
  return storage?.getItem(getTourAutoStartedStorageKey(tourId)) === 'true'
}

export function markTourAutoStarted(tourId: ProductTourId, storage?: TourStorage | null): void {
  storage?.setItem(getTourAutoStartedStorageKey(tourId), 'true')
}

export function getActiveTourDemo(storage?: TourStorage | null): ProductTourId | null {
  const value = storage?.getItem(TOUR_DEMO_STORAGE_KEY)
  return isProductTourId(value) ? value : null
}

export function setActiveTourDemo(tourId: ProductTourId, storage?: TourStorage | null): void {
  storage?.setItem(TOUR_DEMO_STORAGE_KEY, tourId)
}

export function clearActiveTourDemo(storage?: TourStorage | null): void {
  storage?.removeItem(TOUR_DEMO_STORAGE_KEY)
}

export function isTourDemoActive(tourId: ProductTourId, storage?: TourStorage | null): boolean {
  return getActiveTourDemo(storage) === tourId
}

export function getAvailableTours(user: StoredUser | null): ProductTour[] {
  if (!user) return []

  return PRODUCT_TOURS.filter((tour) => {
    if (tour.requires === 'manage-students') return canManageSchoolScopedRecords(user)
    if (tour.requires === 'manage-teachers') return canManageTeachers(user)
    return true
  })
}

export function getAutoStartTourIdForPath(pathname: string, user: StoredUser | null): ProductTourId | null {
  if (!user) return null
  if (pathname === '/dashboard') return 'dashboard-overview'
  if (pathname === '/dashboard/teachers' && canManageTeachers(user)) return 'invite-teachers'
  if (pathname === '/dashboard/students' && canManageSchoolScopedRecords(user)) return 'student-assessment'
  if (pathname === '/dashboard/students/missing-updates') return 'monthly-follow-up'
  if (/^\/dashboard\/students\/[^/]+$/.test(pathname)) return 'student-profile'
  return null
}

export function getProductTour(tourId: ProductTourId): ProductTour {
  return PRODUCT_TOURS.find((tour) => tour.id === tourId)!
}

export function getTourAnchorSelector(anchor: string): string {
  return `[data-tour="${anchor}"]`
}

export function getTourStartAnchorNames(tour: ProductTour): string[] {
  return tour.startAnchors || [tour.requiredAnchor]
}

export function getTourStartReadiness(
  tour: ProductTour,
  hasVisibleElement: (selector: string) => boolean = defaultHasVisibleElement,
): TourStartReadiness {
  const anchors = getTourStartAnchorNames(tour)
  const hasMissingAnchor = anchors.some((anchor) => !hasVisibleElement(getTourAnchorSelector(anchor)))

  if (!hasMissingAnchor) return 'ready'
  return tour.supportsDemoData ? 'demoAvailable' : 'unavailable'
}

export function findMissingTourAnchor(
  steps: TourStep[],
  hasVisibleElement: (selector: string) => boolean = defaultHasVisibleElement,
): string | null {
  const missingStep = steps.find((step) => !step.optional && !hasVisibleElement(step.element))
  return missingStep?.element || null
}

export function filterAvailableTourSteps(
  steps: TourStep[],
  hasVisibleElement: (selector: string) => boolean = defaultHasVisibleElement,
): TourStep[] {
  return steps.filter((step) => !step.optional || hasVisibleElement(step.element))
}

export function isVisibleTourElement(element: TourTargetElement | null | undefined): boolean {
  if (!element) return false
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility()) return false

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function getDriverProgressText(locale: string): string {
  return locale === 'pt-BR' ? '{{current}} de {{total}}' : '{{current}} of {{total}}'
}

function isProductTourId(value: unknown): value is ProductTourId {
  return typeof value === 'string' && PRODUCT_TOUR_IDS.includes(value as ProductTourId)
}

function defaultHasVisibleElement(selector: string): boolean {
  if (typeof document === 'undefined') return false
  return isVisibleTourElement(document.querySelector(selector))
}
