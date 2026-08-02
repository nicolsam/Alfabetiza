'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import DashboardSkeleton from '@/components/skeletons/DashboardSkeleton'
import ChartSkeleton from '@/components/dashboard/ChartSkeleton'
import { buildDashboardActionListHref } from '@/lib/dashboard-action-lists'
import { ACADEMIC_YEARS } from '@/lib/academic-years'
import { getSectionOptionsForGrade, resolveSectionFilter } from '@/lib/class-filters'
import { cachedJson } from '@/lib/client-get-cache'
import {
  buildMonthKey,
  formatLocalizedMonth,
  formatMonthName,
  getAvailableMonthOptions,
  getMonthKey,
  getMonthPartFromMonthKey,
  getYearFromMonthKey,
} from '@/lib/monthly-updates'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTourDemoMode } from '@/components/tours/useTourDemoMode'
import { TOUR_DEMO_DASHBOARD_STATS } from '@/lib/product-tour-demo-data'

const DashboardCharts = dynamic(() => import('@/components/dashboard/DashboardCharts'), {
  loading: () => <ChartSkeleton />,
})

const VALID_SHIFTS = ['Morning', 'Afternoon', 'Night']
const VALID_GRADES = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano', '1ª Série', '2ª Série', '3ª Série']

interface Stats {
  totalStudents: number
  distribution: { level: string; name: string; count: number; percentage: number }[]
  needAttention: { id: string; name: string; studentNumber: string; schoolName: string; level: string; levelCode: string }[]
  mostCommonLevel: string | null
  improvedCount: number
  improved: { id: string; name: string; studentNumber: string; schoolName: string; level: string; levelCode: string }[]
  monthlyUpdates: {
    month: string
    monthStatus: 'current' | 'past'
    academicYear: number
    totalStudents: number
    updatedCount: number
    missingCount: number
    missingStudents: {
      id: string
      name: string
      studentNumber: string
      schoolName: string
      level: string
      levelCode: string
      latestAssessmentMonth: string | null
    }[]
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const t = useTranslations()
  const locale = useLocale()
  const activeDemoTour = useTourDemoMode()
  const [stats, setStats] = useState<Stats | null>(null)
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([])
  const [classes, setClasses] = useState<{ id: string; grade: string; section: string; shift: string }[]>([])
  const [schoolId, setSchoolId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey())
  const [selectedYear, setSelectedYear] = useState(String(getYearFromMonthKey(getMonthKey())))
  const [availableAcademicYears, setAvailableAcademicYears] = useState<number[]>(ACADEMIC_YEARS)
  const [loading, setLoading] = useState(true)

  const [gradeFilter, setGradeFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const sectionOptions = getSectionOptionsForGrade(classes, gradeFilter)

  const handleGradeFilterChange = (value: string) => {
    const nextGrade = value === '__all__' ? '' : value
    const nextSectionOptions = getSectionOptionsForGrade(classes, nextGrade)

    setGradeFilter(nextGrade)
    setSectionFilter((currentSection) => resolveSectionFilter(currentSection, nextSectionOptions))
  }

  const handleSectionFilterChange = (value: string) => {
    setSectionFilter(value === '__all__' ? '' : value)
  }

  const selectedMonthPart = getMonthPartFromMonthKey(selectedMonth)
  const selectedAcademicYear = Number(selectedYear)
  const availableMonths = getAvailableMonthOptions(selectedAcademicYear)

  const handleMonthPartChange = (month: string) => {
    setSelectedMonth(buildMonthKey(month, selectedYear))
  }

  const handleYearChange = (year: string) => {
    const yearMonths = getAvailableMonthOptions(Number(year))
    const nextMonth = yearMonths.some((month) => month.value === selectedMonthPart)
      ? selectedMonthPart
      : yearMonths.at(-1)?.value || getMonthPartFromMonthKey(getMonthKey())

    setSelectedYear(year)
    setSelectedMonth(buildMonthKey(nextMonth, year))
  }

  const handleSchoolFilterChange = (value: string) => {
    const nextSchoolId = value === '__all__' ? '' : value
    setSchoolId(nextSchoolId)
    localStorage.setItem('selectedSchool', nextSchoolId)
    window.dispatchEvent(new Event('schoolChanged'))
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    
    const handleSchoolChange = () => {
      const storedSchool = localStorage.getItem('selectedSchool')
      setSchoolId(storedSchool || '')
    }

    handleSchoolChange()
    window.addEventListener('schoolChanged', handleSchoolChange)
    return () => window.removeEventListener('schoolChanged', handleSchoolChange)
  }, [router])

  useEffect(() => {
    const fetchStats = async () => {
      const token = localStorage.getItem('token')
      if (!token) return

      setLoading(true)
      const classParams = new URLSearchParams()
      if (schoolId) classParams.set('schoolId', schoolId)
      const classUrl = `/api/classes${classParams.toString() ? `?${classParams.toString()}` : ''}`

      const dashboardParams = new URLSearchParams({ month: selectedMonth })
      if (schoolId) dashboardParams.set('schoolId', schoolId)
      if (gradeFilter) dashboardParams.set('grade', gradeFilter)
      if (sectionFilter) dashboardParams.set('section', sectionFilter)
      if (shiftFilter) dashboardParams.set('shift', shiftFilter)
      const dashboardUrl = `/api/dashboard?${dashboardParams.toString()}`

      const [schoolsRes, classesRes, dashboardRes] = await Promise.all([
        cachedJson<{ schools?: { id: string; name: string }[] }>('/api/schools', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        cachedJson<{ classes?: { id: string; grade: string; section: string; shift: string }[]; academicYears?: number[] }>(classUrl, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        cachedJson<Stats>(dashboardUrl, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (schoolsRes.ok && schoolsRes.data.schools) {
        setSchools(schoolsRes.data.schools)
      }

      if (classesRes.ok) {
        const fetchedClasses = classesRes.data.classes || []
        setClasses(fetchedClasses)
        setSectionFilter((currentSection) => (
          resolveSectionFilter(currentSection, getSectionOptionsForGrade(fetchedClasses, gradeFilter))
        ))
        const years = classesRes.data.academicYears?.length ? classesRes.data.academicYears : ACADEMIC_YEARS
        setAvailableAcademicYears(years)

        if (years.length > 0 && !years.includes(selectedAcademicYear)) {
          const yearMonths = getAvailableMonthOptions(years[0])
          const nextMonth = yearMonths.some((month) => month.value === selectedMonthPart)
            ? selectedMonthPart
            : yearMonths.at(-1)?.value || getMonthPartFromMonthKey(getMonthKey())

          setSelectedYear(String(years[0]))
          setSelectedMonth(buildMonthKey(nextMonth, years[0]))
          setLoading(false)
          return
        }
      }

      if (dashboardRes.ok) {
        setStats(dashboardRes.data)
      }
      setLoading(false)
    }
    fetchStats()
  }, [schoolId, gradeFilter, sectionFilter, shiftFilter, selectedMonth, selectedAcademicYear, selectedMonthPart])

  if (loading) {
    return <DashboardSkeleton />
  }

  const shouldShowDemoStats = (
    (activeDemoTour === 'dashboard-overview' || activeDemoTour === 'monthly-follow-up') &&
    (!stats || stats.totalStudents === 0)
  )
  const visibleStats = shouldShowDemoStats ? TOUR_DEMO_DASHBOARD_STATS : stats
  const isCurrent = visibleStats?.monthlyUpdates.monthStatus === 'current'
  const missingUpdatesHref = buildDashboardActionListHref('/dashboard/students/missing-updates', { month: selectedMonth, schoolId, from: 'dashboard' })
  const needAttentionHref = buildDashboardActionListHref('/dashboard/students/need-attention', { month: selectedMonth, schoolId, from: 'dashboard' })
  const improvedHref = buildDashboardActionListHref('/dashboard/students/improved', { month: selectedMonth, schoolId, from: 'dashboard' })
  const chartDistribution = visibleStats?.distribution.map((item) => ({
    ...item,
    translatedName: t(`levels.${item.level}`),
  })) || []

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('dashboard.title')}</h1>
      </div>

      <div className="mb-6 bg-white p-4 rounded-lg shadow" data-tour="dashboard-filters">
        <div className="grid gap-4 md:flex md:flex-wrap md:items-end">
          <div className="space-y-1 md:min-w-56 md:flex-1">
            <Label className="text-gray-700">{t('classes.school')}</Label>
            <Select value={schoolId || '__all__'} onValueChange={handleSchoolFilterChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('classes.selectSchool')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('classes.all')}</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-56">
            <Label className="text-gray-700">{t('classes.grade')}</Label>
            <Select value={gradeFilter || '__all__'} onValueChange={handleGradeFilterChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('classes.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('classes.all')}</SelectItem>
                {VALID_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-28">
            <Label className="text-gray-700">{t('classes.section')}</Label>
            <Select value={sectionFilter || '__all__'} onValueChange={handleSectionFilterChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('classes.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('classes.all')}</SelectItem>
                {sectionOptions.map((section) => (
                  <SelectItem key={section} value={section}>
                    {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-44">
            <Label className="text-gray-700">{t('classes.shift')}</Label>
            <Select value={shiftFilter} onValueChange={(value) => setShiftFilter(value === '__all__' ? '' : value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('classes.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('classes.all')}</SelectItem>
                {VALID_SHIFTS.map(s => <SelectItem key={s} value={s}>{t(`classes.shifts.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 border-t pt-4 mt-4 md:flex md:flex-wrap md:items-end">
          <div className="space-y-1 md:w-28">
            <Label className="text-gray-700">{t('dashboard.monthFilter')}</Label>
            <Select value={selectedMonthPart} onValueChange={handleMonthPartChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('dashboard.monthFilter')} />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {formatMonthName(month.value, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-36">
            <Label className="text-gray-700">{t('classes.academicYear')}</Label>
            <Select value={selectedYear} onValueChange={handleYearChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('classes.academicYear')} />
              </SelectTrigger>
              <SelectContent>
                {availableAcademicYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!visibleStats || visibleStats.totalStudents === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow text-center text-gray-700">
          {t('dashboard.noData')}
        </div>
      ) : (
        <>

      {/* Current month: urgent warning banner */}
      {isCurrent && visibleStats.monthlyUpdates.missingCount > 0 && (
        <Alert variant="warning" className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <AlertTitle>{t('dashboard.monthlyUpdateAlertTitle')}</AlertTitle>
              <AlertDescription>
                {t('dashboard.monthlyUpdateAlertDescription', {
                  count: visibleStats.monthlyUpdates.missingCount,
                  month: formatLocalizedMonth(visibleStats.monthlyUpdates.month, locale),
                })}
              </AlertDescription>
            </div>
            <Button asChild variant="secondary" className="self-start bg-amber-600 text-white hover:bg-amber-700 md:self-auto">
              <Link href={missingUpdatesHref}>
                {t('dashboard.reviewMonthlyUpdates')}
              </Link>
            </Button>
          </div>
        </Alert>
      )}

      {/* Past month: neutral informational banner */}
      {!isCurrent && visibleStats.monthlyUpdates.missingCount > 0 && (
        <Alert variant="default" className="mb-6">
          <AlertDescription>
            {t('dashboard.pastMonthInfoDescription', {
              count: visibleStats.monthlyUpdates.missingCount,
              month: formatLocalizedMonth(visibleStats.monthlyUpdates.month, locale),
            })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-600 text-sm">{t('dashboard.totalStudents')}</h3>
          <p className="text-3xl font-bold text-gray-800">{visibleStats.totalStudents}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-600 text-sm">{t('dashboard.mostCommonLevel')}</h3>
          <p className="text-2xl font-bold text-gray-800">
            {visibleStats.mostCommonLevel ? t(`levels.${visibleStats.mostCommonLevel}`) : '-'}
          </p>
        </div>
        <Link href={improvedHref} data-testid="dashboard-improved-card" data-tour="dashboard-improved-card">
          <div className="bg-white p-6 rounded-lg shadow transition-shadow hover:shadow-md cursor-pointer h-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-gray-600 text-sm">{t('dashboard.improvedThisMonth')}</h3>
                <p className="text-3xl font-bold text-green-600" data-testid="dashboard-improved-count">
                  {visibleStats.improvedCount ?? 0}
                </p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground mt-1" />
            </div>
          </div>
        </Link>
        <Link href={needAttentionHref} data-testid="dashboard-need-attention-card" data-tour="dashboard-need-attention-card">
          <div className="bg-white p-6 rounded-lg shadow transition-shadow hover:shadow-md cursor-pointer h-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-gray-600 text-sm">{t('dashboard.needAttention')}</h3>
                <p className="text-3xl font-bold text-red-600" data-testid="dashboard-need-attention-count">
                  {visibleStats.needAttention.length}
                </p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground mt-1" />
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card data-tour="dashboard-monthly-updated-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.updatedThisMonth')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{visibleStats.monthlyUpdates.updatedCount}</p>
          </CardContent>
        </Card>
        <Link href={missingUpdatesHref} data-testid="dashboard-missing-updates-card" data-tour="dashboard-missing-updates-card">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('dashboard.missingMonthlyUpdates')}
                </CardTitle>
                <ArrowRight className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600" data-testid="dashboard-missing-updates-count">
                {visibleStats.monthlyUpdates.missingCount}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mb-6" data-tour="dashboard-reading-distribution">
        <DashboardCharts
          distribution={chartDistribution}
          distributionTitle={t('dashboard.distribution')}
          byLevelTitle={t('dashboard.byLevel')}
          studentLabel={t('nav.students')}
        />
      </div>

        </>
      )}
    </div>
  )
}
