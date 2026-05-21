'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { driver, type Driver } from 'driver.js'
import { HelpCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  getAutoStartTourIdForPath,
  getAvailableTours,
  getDriverProgressText,
  getProductTour,
  getTourAnchorSelector,
  getTourStartAnchorNames,
  getTourStartReadiness,
  isTourAutoStarted,
  isTourCompleted,
  markTourAutoStarted,
  markTourCompleted,
  type ProductTourId,
  type ProductTour,
  type TourStep,
} from '@/lib/product-tours'
import { activateTourDemo, deactivateTourDemo } from '@/lib/product-tour-demo-data'
import type { StoredUser } from '@/lib/client-auth'

type TourLauncherProps = {
  user: StoredUser | null
}

type TourTranslator = (key: string) => string

type TourStepConfig = {
  anchor: string
  key: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  optional?: boolean
  beforeNext?: (context: TourActionContext) => Promise<void>
}

type ManagedTourStep = TourStep & {
  beforeNext?: (context: TourActionContext) => Promise<void>
}

type TourActionContext = {
  driverObj: Driver
  moveToNextVisibleStep: () => Promise<void>
  markOpenedModal: (closeAnchor: string) => void
  clearOpenedModal: () => void
}

const ROUTE_READY_TIMEOUT_MS = 6000
const OPTIONAL_STEP_TIMEOUT_MS = 250
const AUTO_START_DELAY_MS = 900

export default function TourLauncher({ user }: TourLauncherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('tours')
  const [open, setOpen] = useState(false)
  const activeDriverRef = useRef<Driver | null>(null)
  const didCompleteTourRef = useRef(false)
  const openedModalCloseAnchorRef = useRef<string | null>(null)
  const availableTours = useMemo(() => getAvailableTours(user), [user])

  const startTour = useCallback(async (tour: ProductTour, options: { autoStart?: boolean; pathname?: string } = {}) => {
    if (activeDriverRef.current?.isActive()) return
    setOpen(false)
    deactivateTourDemo(window.sessionStorage)

    const startReadiness = await prepareTourStart(tour, options.pathname || pathname, router.push)
    if (startReadiness === 'unavailable') {
      deactivateTourDemo(window.sessionStorage)
      toast.info(t('unavailable'))
      return
    }

    const steps = buildTourSteps(tour.id, t, router.push)
    didCompleteTourRef.current = false
    openedModalCloseAnchorRef.current = null

    const driverObj = driver({
      animate: true,
      allowClose: true,
      disableActiveInteraction: true,
      overlayOpacity: 0.55,
      popoverClass: 'alfabetiza-driver-popover',
      showButtons: ['next', 'previous', 'close'],
      showProgress: true,
      nextBtnText: t('buttons.next'),
      prevBtnText: t('buttons.previous'),
      doneBtnText: t('buttons.done'),
      progressText: getDriverProgressText(locale),
      steps,
      onCloseClick: (_element, _step, options) => {
        closeTourOpenedModal(openedModalCloseAnchorRef.current)
        openedModalCloseAnchorRef.current = null
        options.driver.destroy()
      },
      onNextClick: (_element, _step, driverOptions) => {
        void moveTourForward(
          driverOptions.driver,
          steps,
          t('unavailable'),
          openedModalCloseAnchorRef,
          didCompleteTourRef,
        )
      },
      onDestroyed: () => {
        if (didCompleteTourRef.current) markTourCompleted(tour.id, window.localStorage)
        closeTourOpenedModal(openedModalCloseAnchorRef.current)
        deactivateTourDemo(window.sessionStorage)
        openedModalCloseAnchorRef.current = null
        activeDriverRef.current = null
      },
    })

    activeDriverRef.current = driverObj
    if (options.autoStart) markTourAutoStarted(tour.id, window.localStorage)
    driverObj.drive()
  }, [locale, pathname, router.push, t])

  useEffect(() => {
    if (!user || activeDriverRef.current?.isActive()) return

    const timeout = window.setTimeout(() => {
      const autoStartTourId = getAutoStartTourIdForPath(pathname, user)
      if (!autoStartTourId || isTourAutoStarted(autoStartTourId, window.localStorage)) return
      const tour = getProductTour(autoStartTourId)
      if (!availableTours.some((availableTour) => availableTour.id === tour.id)) return
      void startTour(tour, { autoStart: true, pathname })
    }, AUTO_START_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [availableTours, pathname, startTour, user])

  if (!user || availableTours.length === 0) return null

  return (
    <div className="relative" data-tour="tour-launcher">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start border-gray-600 bg-gray-900/40 text-gray-100 hover:bg-gray-700 hover:text-white"
        onClick={() => setOpen((current) => !current)}
      >
        <HelpCircle className="size-4" />
        {t('launcher')}
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-md border border-gray-700 bg-gray-950 shadow-xl">
          <div className="border-b border-gray-800 px-3 py-2">
            <p className="text-sm font-semibold text-white">{t('menuTitle')}</p>
            <p className="text-xs text-gray-400">{t('menuDescription')}</p>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {availableTours.map((tour) => (
              <button
                key={tour.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-gray-800"
                onClick={() => void startTour(tour)}
              >
                <span>
                  <span className="block text-sm font-medium text-white">{t(`${tour.id}.title`)}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-gray-400">{t(`${tour.id}.summary`)}</span>
                  {tour.supportsDemoData && (
                    <span className="mt-1 block text-xs font-medium text-blue-300">{t('sampleHint')}</span>
                  )}
                </span>
                {isTourCompleted(tour.id, window.localStorage) && (
                  <span className="mt-0.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                    {t('completed')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

async function prepareTourStart(
  tour: ProductTour,
  pathname: string,
  push: (href: string) => void,
): Promise<'ready' | 'demoAvailable' | 'unavailable'> {
  if (pathname !== tour.route) {
    push(tour.route)
  }

  const startAnchors = getTourStartAnchorNames(tour)
  const realAnchorsReady = await waitForTourAnchors(startAnchors, 1800)
  if (realAnchorsReady) return 'ready'

  const readiness = getTourStartReadiness(tour)
  if (readiness !== 'demoAvailable') return 'unavailable'

  activateTourDemo(tour.id, window.sessionStorage)
  const demoAnchorsReady = await waitForTourAnchors(startAnchors)
  return demoAnchorsReady ? 'demoAvailable' : 'unavailable'
}

function buildTourSteps(
  tourId: ProductTourId,
  t: TourTranslator,
  push: (href: string) => void,
): ManagedTourStep[] {
  const stepMap: Record<ProductTourId, TourStepConfig[]> = {
    'dashboard-overview': [
      { anchor: 'dashboard-filters', key: 'filters', side: 'bottom', align: 'start' },
      { anchor: 'dashboard-monthly-updated-card', key: 'monthly', side: 'top', align: 'start' },
      { anchor: 'dashboard-improved-card', key: 'improved', side: 'top', align: 'start' },
      { anchor: 'dashboard-need-attention-card', key: 'attention', side: 'top', align: 'start' },
      { anchor: 'dashboard-missing-updates-card', key: 'missingUpdates', side: 'top', align: 'start' },
      { anchor: 'dashboard-reading-distribution', key: 'distribution', side: 'top', align: 'start' },
    ],
    'student-assessment': [
      { anchor: 'students-filters', key: 'filters', side: 'bottom', align: 'start' },
      { anchor: 'students-metrics', key: 'metrics', side: 'top', align: 'start' },
      {
        anchor: 'students-update-level-button',
        key: 'updateButton',
        side: 'left',
        align: 'start',
        beforeNext: async ({ driverObj, moveToNextVisibleStep, markOpenedModal }) => {
          clickTourAnchor('students-update-level-button')
          await waitForRequiredTourAnchor('assessment-modal')
          markOpenedModal('assessment-cancel')
          driverObj.refresh()
          await moveToNextVisibleStep()
        },
      },
      { anchor: 'assessment-level-field', key: 'levelField', side: 'right', align: 'start' },
      { anchor: 'assessment-date-field', key: 'dateField', side: 'right', align: 'start' },
      { anchor: 'assessment-actions', key: 'actions', side: 'top', align: 'end' },
    ],
    'invite-teachers': [
      { anchor: 'teachers-invite-card', key: 'inviteCard', side: 'bottom', align: 'start' },
      {
        anchor: 'teachers-open-invite',
        key: 'openInvite',
        side: 'left',
        align: 'start',
        beforeNext: async ({ driverObj, moveToNextVisibleStep, markOpenedModal }) => {
          clickTourAnchor('teachers-open-invite')
          await waitForRequiredTourAnchor('teacher-invite-modal')
          markOpenedModal('teacher-invite-cancel')
          driverObj.refresh()
          await moveToNextVisibleStep()
        },
      },
      { anchor: 'teacher-invite-school', key: 'schoolField', side: 'right', align: 'start' },
      { anchor: 'teacher-invite-name', key: 'nameField', side: 'right', align: 'start' },
      { anchor: 'teacher-invite-email', key: 'emailField', side: 'right', align: 'start' },
      {
        anchor: 'teacher-invite-actions',
        key: 'actions',
        side: 'top',
        align: 'end',
        beforeNext: async ({ driverObj, moveToNextVisibleStep, clearOpenedModal }) => {
          clickTourAnchor('teacher-invite-cancel')
          await waitForRequiredTourAnchor('teachers-pending-invites')
          clearOpenedModal()
          driverObj.refresh()
          await moveToNextVisibleStep()
        },
      },
      { anchor: 'teachers-pending-invites', key: 'pendingInvites', side: 'top', align: 'start' },
    ],
    'parent-report-sharing': [
      {
        anchor: 'students-first-profile-link',
        key: 'openProfile',
        side: 'right',
        align: 'start',
        beforeNext: async ({ driverObj, moveToNextVisibleStep }) => {
          clickTourAnchor('students-first-profile-link')
          await waitForRequiredTourAnchor('student-report-share')
          driverObj.refresh()
          await moveToNextVisibleStep()
        },
      },
      { anchor: 'student-parent-contacts', key: 'contacts', side: 'top', align: 'start' },
      { anchor: 'student-report-share', key: 'reportCard', side: 'top', align: 'start' },
      { anchor: 'student-report-actions', key: 'reportActions', side: 'top', align: 'start' },
      { anchor: 'student-reading-history', key: 'history', side: 'top', align: 'start' },
    ],
    'student-profile': [
      {
        anchor: 'students-first-profile-link',
        key: 'openProfile',
        side: 'right',
        align: 'start',
        beforeNext: async ({ driverObj, moveToNextVisibleStep }) => {
          clickTourAnchor('students-first-profile-link')
          await waitForRequiredTourAnchor('student-profile-summary')
          driverObj.refresh()
          await moveToNextVisibleStep()
        },
      },
      { anchor: 'student-profile-summary', key: 'summary', side: 'bottom', align: 'start' },
      { anchor: 'student-current-level', key: 'currentLevel', side: 'left', align: 'start' },
      { anchor: 'student-report-share', key: 'reportEntry', side: 'top', align: 'start' },
      { anchor: 'student-progress-charts', key: 'charts', side: 'top', align: 'start', optional: true },
      { anchor: 'student-reading-history', key: 'history', side: 'top', align: 'start' },
      { anchor: 'student-commentary-entry', key: 'commentary', side: 'top', align: 'start' },
    ],
    'monthly-follow-up': [
      { anchor: 'dashboard-missing-updates-card', key: 'monthly', side: 'top', align: 'start' },
      {
        anchor: 'dashboard-missing-updates-card',
        key: 'missingCard',
        side: 'top',
        align: 'start',
        beforeNext: async ({ driverObj, moveToNextVisibleStep }) => {
          push('/dashboard/students/missing-updates?from=dashboard')
          await waitForRequiredTourAnchor('action-list-filters')
          driverObj.refresh()
          await moveToNextVisibleStep()
        },
      },
      {
        anchor: 'action-list-filters',
        key: 'actionFilters',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'action-list-table',
        key: 'actionTable',
        side: 'top',
        align: 'start',
        beforeNext: async ({ driverObj, moveToNextVisibleStep }) => {
          push('/dashboard')
          await waitForRequiredTourAnchor('dashboard-need-attention-card')
          driverObj.refresh()
          await moveToNextVisibleStep()
        },
      },
      { anchor: 'dashboard-need-attention-card', key: 'attentionCard', side: 'top', align: 'start' },
      { anchor: 'dashboard-improved-card', key: 'improvedCard', side: 'top', align: 'start' },
    ],
  }

  return stepMap[tourId].map((step) => buildDriverStep(tourId, step, t))
}

function buildDriverStep(
  tourId: ProductTourId,
  step: TourStepConfig,
  t: TourTranslator,
): ManagedTourStep {
  return {
    element: getTourAnchorSelector(step.anchor),
    optional: step.optional,
    beforeNext: step.beforeNext,
    popover: {
      title: t(`${tourId}.steps.${step.key}.title`),
      description: t(`${tourId}.steps.${step.key}.description`),
      side: step.side,
      align: step.align,
    },
  }
}

async function moveTourForward(
  driverObj: Driver,
  steps: ManagedTourStep[],
  failureMessage: string,
  openedModalCloseAnchorRef: MutableRefObject<string | null>,
  didCompleteTourRef: MutableRefObject<boolean>,
): Promise<void> {
  const activeIndex = driverObj.getActiveIndex()
  const currentIndex = typeof activeIndex === 'number' ? activeIndex : 0
  const currentStep = steps[currentIndex]

  const moveToNextVisibleStep = async () => {
    await moveToVisibleStep(driverObj, steps, currentIndex + 1, failureMessage, didCompleteTourRef)
  }

  try {
    if (currentStep?.beforeNext) {
      await currentStep.beforeNext({
        driverObj,
        moveToNextVisibleStep,
        markOpenedModal: (closeAnchor) => {
          openedModalCloseAnchorRef.current = closeAnchor
        },
        clearOpenedModal: () => {
          openedModalCloseAnchorRef.current = null
        },
      })
      return
    }

    await moveToNextVisibleStep()
  } catch {
    toast.error(failureMessage)
    driverObj.destroy()
  }
}

async function moveToVisibleStep(
  driverObj: Driver,
  steps: ManagedTourStep[],
  startIndex: number,
  failureMessage: string,
  didCompleteTourRef: MutableRefObject<boolean>,
): Promise<void> {
  for (let index = startIndex; index < steps.length; index += 1) {
    const step = steps[index]
    const timeoutMs = step.optional ? OPTIONAL_STEP_TIMEOUT_MS : ROUTE_READY_TIMEOUT_MS
    const ready = await waitForSelector(step.element, timeoutMs)
    if (ready) {
      driverObj.moveTo(index)
      driverObj.refresh()
      return
    }
    if (step.optional) continue

    toast.error(failureMessage)
    driverObj.destroy()
    return
  }

  didCompleteTourRef.current = true
  driverObj.destroy()
}

function clickTourAnchor(anchor: string): void {
  const element = document.querySelector<HTMLElement>(getTourAnchorSelector(anchor))
  element?.click()
}

async function waitForTourAnchor(anchor: string): Promise<boolean> {
  return waitForSelector(getTourAnchorSelector(anchor))
}

async function waitForTourAnchors(anchors: string[], timeoutMs = ROUTE_READY_TIMEOUT_MS): Promise<boolean> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const allReady = anchors.every((anchor) => isVisibleElement(document.querySelector<HTMLElement>(getTourAnchorSelector(anchor))))
    if (allReady) return true
    await delay(100)
  }

  return false
}

async function waitForRequiredTourAnchor(anchor: string): Promise<void> {
  const ready = await waitForTourAnchor(anchor)
  if (!ready) throw new Error(`Missing tour anchor: ${anchor}`)
}

async function waitForSelector(selector: string, timeoutMs = ROUTE_READY_TIMEOUT_MS): Promise<boolean> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const element = document.querySelector<HTMLElement>(selector)
    if (isVisibleElement(element)) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      return true
    }
    await delay(100)
  }

  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isVisibleElement(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility()) return false

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function closeTourOpenedModal(closeAnchor: string | null): void {
  const fallbackAnchors = ['assessment-cancel', 'teacher-invite-cancel']
  const closeAnchors = closeAnchor ? [closeAnchor, ...fallbackAnchors.filter((anchor) => anchor !== closeAnchor)] : fallbackAnchors
  window.setTimeout(() => {
    for (const anchor of closeAnchors) {
      const closeButton = document.querySelector<HTMLElement>(getTourAnchorSelector(anchor))
      if (closeButton) {
        closeButton.click()
        return
      }
    }
  }, 50)
}
