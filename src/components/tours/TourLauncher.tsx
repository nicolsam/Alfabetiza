'use client'

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { driver, type Driver } from 'driver.js'
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  ClipboardCheck,
  HelpCircle,
  MessageCircle,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  GUIDED_HELP_ATTENTION_STORAGE_KEY,
  getAutoStartTourIdForPath,
  getAvailableTours,
  getDriverProgressText,
  getGuidedHelpCategories,
  getProductTour,
  getSuggestedTourForPath,
  getTourAnchorSelector,
  getTourStartAnchorNames,
  getTourStartReadiness,
  getGuidedHelpToursForCategory,
  isTourAutoStarted,
  isTourCompleted,
  markTourAutoStarted,
  markTourCompleted,
  type ProductTourCategory,
  type ProductTourCategorySummary,
  type ProductTourId,
  type ProductTour,
  type ProductTourSection,
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
const SECTION_ICONS: Record<ProductTourSection['id'], LucideIcon> = {
  'suggested-now': Sparkles,
  'start-here': BookOpenCheck,
  'daily-workflows': ClipboardCheck,
  'sharing-and-team': MessageCircle,
}
const GUIDE_ICONS: Record<ProductTourId, LucideIcon> = {
  'dashboard-overview': BarChart3,
  'student-assessment': ClipboardCheck,
  'invite-teachers': UsersRound,
  'parent-report-sharing': MessageCircle,
  'student-profile': UserRound,
  'monthly-follow-up': BookOpenCheck,
}

export default function TourLauncher({ user }: TourLauncherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('tours')
  const [open, setOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<ProductTourCategory | null>(null)
  const [showAttentionCue, setShowAttentionCue] = useState(false)
  const [systemModalOpen, setSystemModalOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const activeDriverRef = useRef<Driver | null>(null)
  const didCompleteTourRef = useRef(false)
  const openedModalCloseAnchorRef = useRef<string | null>(null)
  const availableTours = useMemo(() => getAvailableTours(user), [user])
  const suggestedTour = useMemo(
    () => getSuggestedTourForPath(pathname, user, availableTours),
    [availableTours, pathname, user],
  )
  const helpCategories = useMemo(() => getGuidedHelpCategories(availableTours), [availableTours])
  const selectedCategoryTours = useMemo(() => (
    selectedCategory ? getGuidedHelpToursForCategory(availableTours, selectedCategory) : []
  ), [availableTours, selectedCategory])

  const dismissAttentionCue = useCallback(() => {
    window.localStorage.setItem(GUIDED_HELP_ATTENTION_STORAGE_KEY, 'true')
    setShowAttentionCue(false)
  }, [])

  const closeMenu = useCallback(() => {
    setOpen(false)
    setSelectedCategory(null)
  }, [])

  const startTour = useCallback(async (tour: ProductTour, options: { autoStart?: boolean; pathname?: string } = {}) => {
    if (activeDriverRef.current?.isActive()) return
    closeMenu()
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
  }, [closeMenu, locale, pathname, router.push, t])

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

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      closeMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [closeMenu, open])

  useEffect(() => {
    const updateModalState = () => {
      const hasSystemModal = hasVisibleSystemModal()
      setSystemModalOpen(hasSystemModal)
      if (hasSystemModal) closeMenu()
    }

    updateModalState()
    const observer = new MutationObserver(updateModalState)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'class', 'data-app-modal', 'data-state', 'hidden', 'style'],
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [closeMenu])

  useEffect(() => {
    if (!user) return
    queueMicrotask(() => {
      setShowAttentionCue(window.localStorage.getItem(GUIDED_HELP_ATTENTION_STORAGE_KEY) !== 'true')
    })
  }, [user])

  if (!user || availableTours.length === 0) return null

  return (
    <div
      ref={rootRef}
      className={`relative z-[70] ${showAttentionCue ? 'guided-help-attention' : ''}`}
      data-guided-help-attention={showAttentionCue ? 'true' : undefined}
      data-tour="tour-launcher"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start border-gray-600 bg-gray-900/40 text-gray-100 hover:bg-gray-700 hover:text-white"
        onClick={() => {
          dismissAttentionCue()
          if (systemModalOpen) {
            closeMenu()
            return
          }
          setOpen((current) => {
            setSelectedCategory(null)
            return !current
          })
        }}
        onFocus={dismissAttentionCue}
      >
        <HelpCircle className="size-4" />
        {t('launcher')}
      </Button>

      {open && (
        <div
          className="absolute bottom-full left-0 z-[80] mb-2 w-80 overflow-hidden rounded-md border border-gray-700 bg-gray-950 shadow-xl"
          data-tour="guided-help-menu"
        >
          <div className="border-b border-gray-800 px-3 py-3">
            <p className="text-sm font-semibold text-white">{t('menuTitle')}</p>
            <p className="text-xs text-gray-400">{t('menuDescription')}</p>
          </div>
          <div className="guided-help-scroll max-h-[28rem] overflow-y-auto py-2 pr-1">
            {selectedCategory ? (
              <GuidedHelpCategoryView
                category={selectedCategory}
                tours={selectedCategoryTours}
                suggestedTourId={suggestedTour?.id || null}
                isCompleted={(tourId) => isTourCompleted(tourId, window.localStorage)}
                onBack={() => setSelectedCategory(null)}
                onStart={startTour}
                t={t}
              />
            ) : (
              <GuidedHelpLandingView
                categories={helpCategories}
                suggestedTour={suggestedTour}
                isCompleted={(tourId) => isTourCompleted(tourId, window.localStorage)}
                onSelectCategory={setSelectedCategory}
                onStart={startTour}
                t={t}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function GuidedHelpLandingView({
  categories,
  suggestedTour,
  isCompleted,
  onSelectCategory,
  onStart,
  t,
}: {
  categories: ProductTourCategorySummary[]
  suggestedTour: ProductTour | null
  isCompleted: (tourId: ProductTourId) => boolean
  onSelectCategory: (category: ProductTourCategory) => void
  onStart: (tour: ProductTour) => Promise<void>
  t: TourTranslator
}) {
  return (
    <>
      {suggestedTour && (
        <GuidedHelpSection
          section={{ id: 'suggested-now', tours: [suggestedTour] }}
          isSuggestedSection
          isCompleted={isCompleted}
          onStart={onStart}
          t={t}
        />
      )}
      <section className="px-2 py-1">
        <div className="mb-1 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <BookOpenCheck className="size-3.5" />
          {t('browseByType')}
        </div>
        <div className="space-y-1">
          {categories.map((category) => (
            <GuidedHelpCategoryCard
              key={category.id}
              category={category}
              onSelectCategory={onSelectCategory}
              t={t}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function GuidedHelpCategoryView({
  category,
  tours,
  suggestedTourId,
  isCompleted,
  onBack,
  onStart,
  t,
}: {
  category: ProductTourCategory
  tours: ProductTour[]
  suggestedTourId: ProductTourId | null
  isCompleted: (tourId: ProductTourId) => boolean
  onBack: () => void
  onStart: (tour: ProductTour) => Promise<void>
  t: TourTranslator
}) {
  return (
    <section className="px-2 py-1">
      <button
        type="button"
        className="mb-2 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-gray-300 outline-none transition-colors hover:bg-gray-800 hover:text-white focus-visible:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={onBack}
      >
        <ArrowLeft className="size-3.5" />
        {t('back')}
      </button>
      <div className="mb-2 px-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          {createElement(SECTION_ICONS[category], { className: 'size-4 text-blue-200' })}
          {t(`sections.${category}`)}
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-400">{t(`sectionDescriptions.${category}`)}</p>
      </div>
      <div className="space-y-1">
        {tours.map((tour) => (
          <GuidedHelpItem
            key={tour.id}
            tour={tour}
            isSuggested={tour.id === suggestedTourId}
            isCompleted={isCompleted(tour.id)}
            onStart={onStart}
            t={t}
          />
        ))}
      </div>
    </section>
  )
}

function GuidedHelpCategoryCard({
  category,
  onSelectCategory,
  t,
}: {
  category: ProductTourCategorySummary
  onSelectCategory: (category: ProductTourCategory) => void
  t: TourTranslator
}) {
  const guideCountLabel = `${category.count} ${category.count === 1 ? t('guideCount.one') : t('guideCount.other')}`

  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-gray-800 focus-visible:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500"
      onClick={() => onSelectCategory(category.id)}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-800 text-blue-200">
        {createElement(SECTION_ICONS[category.id], { className: 'size-4' })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{t(`sections.${category.id}`)}</span>
        <span className="mt-0.5 block text-xs leading-5 text-gray-400">
          {t(`sectionDescriptions.${category.id}`)}
        </span>
        <span className="mt-2 inline-flex rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-200">
          {guideCountLabel}
        </span>
      </span>
      <ChevronRight className="mt-2 size-4 shrink-0 text-gray-500" />
    </button>
  )
}

function GuidedHelpSection({
  section,
  isSuggestedSection,
  isCompleted,
  onStart,
  t,
}: {
  section: ProductTourSection
  isSuggestedSection: boolean
  isCompleted: (tourId: ProductTourId) => boolean
  onStart: (tour: ProductTour) => Promise<void>
  t: TourTranslator
}) {
  return (
    <section className="px-2 py-1">
      <div className="mb-1 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {createElement(SECTION_ICONS[section.id], { className: 'size-3.5' })}
        {t(`sections.${section.id}`)}
      </div>
      <div className="space-y-1">
        {section.tours.map((tour) => (
          <GuidedHelpItem
            key={tour.id}
            tour={tour}
            isSuggested={isSuggestedSection}
            isCompleted={isCompleted(tour.id)}
            onStart={onStart}
            t={t}
          />
        ))}
      </div>
    </section>
  )
}

function GuidedHelpItem({
  tour,
  isSuggested,
  isCompleted,
  onStart,
  t,
}: {
  tour: ProductTour
  isSuggested: boolean
  isCompleted: boolean
  onStart: (tour: ProductTour) => Promise<void>
  t: TourTranslator
}) {
  return (
    <button
      type="button"
      className="flex w-full gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-gray-800 focus-visible:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500"
      onClick={() => void onStart(tour)}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-800 text-blue-200">
        {createElement(GUIDE_ICONS[tour.id], { className: 'size-4' })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{t(`${tour.id}.title`)}</span>
        <span className="mt-0.5 block text-xs leading-5 text-gray-400">{t(`${tour.id}.summary`)}</span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {isSuggested && <GuideBadge>{t('badges.suggested')}</GuideBadge>}
          {isCompleted && <GuideBadge>{t('badges.completed')}</GuideBadge>}
          {tour.supportsDemoData && <GuideBadge>{t('badges.exampleData')}</GuideBadge>}
        </span>
      </span>
    </button>
  )
}

function GuideBadge({ children }: { children: string }) {
  return (
    <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-200">
      {children}
    </span>
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

function hasVisibleSystemModal(): boolean {
  const selectors = [
    '[data-app-modal="true"]',
    '[data-slot="alert-dialog-content"][data-state="open"]',
  ]

  return selectors.some((selector) => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))
    return elements.some(isVisibleElement)
  })
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
