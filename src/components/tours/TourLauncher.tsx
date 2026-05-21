'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { driver, type DriveStep, type Driver } from 'driver.js'
import { HelpCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  getAvailableTours,
  getTourAnchorSelector,
  isTourCompleted,
  markTourCompleted,
  type ProductTour,
  type ProductTourId,
  type TourStep,
} from '@/lib/product-tours'
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
  beforeNext?: (driverObj: Driver) => void
  beforePrev?: (driverObj: Driver) => void
}

const ROUTE_READY_TIMEOUT_MS = 6000

export default function TourLauncher({ user }: TourLauncherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('tours')
  const [open, setOpen] = useState(false)
  const availableTours = useMemo(() => getAvailableTours(user), [user])

  if (!user || availableTours.length === 0) return null

  const startTour = async (tour: ProductTour) => {
    setOpen(false)
    const firstAnchorReady = await prepareTourStart(tour, pathname, router.push)
    if (!firstAnchorReady) {
      toast.error(t('missingTarget'))
      return
    }

    const steps = buildTourSteps(tour.id, t, router.push)
    const driverObj = driver({
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      popoverClass: 'aleno-driver-popover',
      showButtons: ['next', 'previous', 'close'],
      showProgress: true,
      nextBtnText: t('buttons.next'),
      prevBtnText: t('buttons.previous'),
      doneBtnText: t('buttons.done'),
      progressText: t('progressText'),
      steps,
      onDestroyed: (_element, _step, options) => {
        if (!options.driver.hasNextStep()) markTourCompleted(tour.id, window.localStorage)
      },
    })

    driverObj.drive()
  }

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
): Promise<boolean> {
  if (pathname !== tour.route) {
    push(tour.route)
  }

  return waitForTourAnchor(tour.requiredAnchor)
}

function buildTourSteps(
  tourId: ProductTourId,
  t: TourTranslator,
  push: (href: string) => void,
): TourStep[] {
  const continueTour = (action: (driverObj: Driver) => Promise<void>) => (
    asyncMoveNext(t('missingTarget'), action)
  )
  const stepMap: Record<ProductTourId, TourStepConfig[]> = {
    'dashboard-overview': [
      { anchor: 'dashboard-filters', key: 'filters', side: 'bottom', align: 'start' },
      { anchor: 'dashboard-monthly-section', key: 'monthly', side: 'top', align: 'start' },
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
        beforeNext: continueTour(async (driverObj) => {
          clickTourAnchor('students-update-level-button')
          await waitForTourAnchor('assessment-modal')
          driverObj.moveNext()
        }),
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
        beforeNext: continueTour(async (driverObj) => {
          clickTourAnchor('teachers-open-invite')
          await waitForTourAnchor('teacher-invite-modal')
          driverObj.moveNext()
        }),
      },
      { anchor: 'teacher-invite-school', key: 'schoolField', side: 'right', align: 'start' },
      { anchor: 'teacher-invite-name', key: 'nameField', side: 'right', align: 'start' },
      { anchor: 'teacher-invite-email', key: 'emailField', side: 'right', align: 'start' },
      { anchor: 'teacher-invite-actions', key: 'actions', side: 'top', align: 'end' },
      { anchor: 'teachers-pending-invites', key: 'pendingInvites', side: 'top', align: 'start' },
    ],
    'parent-report-sharing': [
      {
        anchor: 'students-first-profile-link',
        key: 'openProfile',
        side: 'right',
        align: 'start',
        beforeNext: continueTour(async (driverObj) => {
          clickTourAnchor('students-first-profile-link')
          await waitForTourAnchor('student-report-share')
          driverObj.moveNext()
        }),
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
        beforeNext: continueTour(async (driverObj) => {
          clickTourAnchor('students-first-profile-link')
          await waitForTourAnchor('student-profile-summary')
          driverObj.moveNext()
        }),
      },
      { anchor: 'student-profile-summary', key: 'summary', side: 'bottom', align: 'start' },
      { anchor: 'student-current-level', key: 'currentLevel', side: 'left', align: 'start' },
      { anchor: 'student-report-share', key: 'reportEntry', side: 'top', align: 'start' },
      { anchor: 'student-progress-charts', key: 'charts', side: 'top', align: 'start' },
      { anchor: 'student-reading-history', key: 'history', side: 'top', align: 'start' },
      { anchor: 'student-commentary-entry', key: 'commentary', side: 'top', align: 'start' },
    ],
    'monthly-follow-up': [
      { anchor: 'dashboard-monthly-section', key: 'monthly', side: 'top', align: 'start' },
      {
        anchor: 'dashboard-missing-updates-card',
        key: 'missingCard',
        side: 'top',
        align: 'start',
        beforeNext: continueTour(async (driverObj) => {
          push('/dashboard/students/missing-updates?from=dashboard')
          await waitForTourAnchor('action-list-filters')
          driverObj.moveNext()
        }),
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
        beforeNext: continueTour(async (driverObj) => {
          push('/dashboard')
          await waitForTourAnchor('dashboard-need-attention-card')
          driverObj.moveNext()
        }),
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
): TourStep {
  const driverStep: TourStep = {
    element: getTourAnchorSelector(step.anchor),
    popover: {
      title: t(`${tourId}.steps.${step.key}.title`),
      description: t(`${tourId}.steps.${step.key}.description`),
      side: step.side,
      align: step.align,
    },
  }

  if (step.beforeNext) {
    driverStep.popover = {
      ...driverStep.popover,
      onNextClick: (_element, _driverStep: DriveStep, options) => step.beforeNext?.(options.driver),
    }
  }

  if (step.beforePrev) {
    driverStep.popover = {
      ...driverStep.popover,
      onPrevClick: (_element, _driverStep: DriveStep, options) => step.beforePrev?.(options.driver),
    }
  }

  return driverStep
}

function asyncMoveNext(failureMessage: string, action: (driverObj: Driver) => Promise<void>) {
  return (driverObj: Driver) => {
    void action(driverObj).catch(() => {
      toast.error(failureMessage)
      driverObj.destroy()
    })
  }
}

function clickTourAnchor(anchor: string): void {
  const element = document.querySelector<HTMLElement>(getTourAnchorSelector(anchor))
  element?.click()
}

async function waitForTourAnchor(anchor: string): Promise<boolean> {
  return waitForSelector(getTourAnchorSelector(anchor))
}

async function waitForSelector(selector: string): Promise<boolean> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < ROUTE_READY_TIMEOUT_MS) {
    const element = document.querySelector(selector)
    if (element) {
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
