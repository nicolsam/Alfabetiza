'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import StudentsSkeleton from '@/components/skeletons/StudentsSkeleton'
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import Link from 'next/link'
import { ArrowRight, FileSpreadsheet, Pencil, Search, Trash2 } from "lucide-react"
import { getReadingLevelStyle } from '@/lib/reading-levels'
import { buildDashboardActionListHref } from '@/lib/dashboard-action-lists'
import { getStudentMetricCounts } from '@/lib/student-metrics'
import { getSectionOptionsForGrade, resolveSectionFilter } from '@/lib/class-filters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ACADEMIC_YEARS, getDefaultAcademicYear } from '@/lib/academic-years'
import { filterBySearchQuery } from '@/lib/search'
import { cachedJson, clearClientGetCache } from '@/lib/client-get-cache'
import {
  buildMonthKey,
  getAvailableMonthOptions,
  getDefaultAssessmentDateForMonth,
  getMonthKey,
  getMonthPartFromMonthKey,
  getYearFromMonthKey,
} from '@/lib/monthly-updates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { canManageSchoolScopedRecords, getStoredUser, type StoredUser } from '@/lib/client-auth'
import StudentRegistrationModal, {
  type StudentRegistrationPayload,
} from '@/components/students/StudentRegistrationModal'
import StudentImportModal, {
  type StudentImportResultSummary,
} from '@/components/students/StudentImportModal'
import { useTourDemoMode } from '@/components/tours/useTourDemoMode'
import {
  TOUR_DEMO_READING_LEVELS,
  TOUR_DEMO_STUDENT,
  TOUR_DEMO_STUDENT_ID,
} from '@/lib/product-tour-demo-data'

interface ClassRecord {
  id: string
  grade: string
  section: string
  shift: string
  academicYear: number
  schoolId: string
}

interface Student {
  id: string
  name: string
  studentNumber: string
  schoolId: string
  classId: string
  class?: ClassRecord
  readingHistory: {
    id: string
    recordedAt?: string
    createdAt?: string
    readingLevel: { name: string; code: string; order: number }
  }[]
  monthlyUpdateStatus?: 'updated' | 'missing'
  monthStatus?: 'current' | 'past'
  selectedMonth?: string
  selectedAcademicYear?: number
  latestAssessmentDate?: string | null
}

interface ReadingLevel {
  id: string
  code: string
  name: string
  order: number
  color?: string | null
  backgroundColor?: string | null
  textColor?: string | null
}

interface School {
  id: string
  name: string
}

const VALID_SHIFTS = ['Morning', 'Afternoon', 'Night']
const VALID_GRADES = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano', '1ª Série', '2ª Série', '3ª Série']
const DEFAULT_ACADEMIC_YEAR = getDefaultAcademicYear()

export default function StudentsPage() {
  const router = useRouter()
  const t = useTranslations('students')
  const tClasses = useTranslations('classes')
  const tCommon = useTranslations('common')
  const tLevels = useTranslations('levels')
  const tErrors = useTranslations('errors')
  const tTours = useTranslations('tours')
  const activeDemoTour = useTourDemoMode()

  const [students, setStudents] = useState<Student[]>([])
  const [levels, setLevels] = useState<ReadingLevel[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [user, setUser] = useState<StoredUser | null>(null)
  const [availableAcademicYears, setAvailableAcademicYears] = useState<number[]>(ACADEMIC_YEARS)
  const [schoolId, setSchoolId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (typeof window === 'undefined') return getMonthKey()
    return new URLSearchParams(window.location.search).get('month') || getMonthKey()
  })
  const [selectedYear, setSelectedYear] = useState(() => {
    if (typeof window === 'undefined') return String(DEFAULT_ACADEMIC_YEAR)
    const month = new URLSearchParams(window.location.search).get('month')
    const year = month && /^\d{2}\/\d{4}$/.test(month) ? getYearFromMonthKey(month) : DEFAULT_ACADEMIC_YEAR
    return ACADEMIC_YEARS.includes(year) ? String(year) : String(DEFAULT_ACADEMIC_YEAR)
  })
  const selectedMonthPart = getMonthPartFromMonthKey(selectedMonth)
  const selectedAcademicYear = Number(selectedYear)
  const availableMonths = getAvailableMonthOptions(selectedAcademicYear)
  const maxAssessmentDate = getDefaultAssessmentDateForMonth(getMonthKey())

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
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [error, setError] = useState('')

  // Filters
  const [gradeFilter, setGradeFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
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

  const [updateLevel, setUpdateLevel] = useState({ studentId: '', readingLevelId: '', notes: '', recordedAt: getDefaultAssessmentDateForMonth(getMonthKey()) })

  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    queueMicrotask(() => setUser(getStoredUser()))

    const handleSchoolChange = () => {
      const storedSchool = localStorage.getItem('selectedSchool')
      setSchoolId(storedSchool || '')
    }

    handleSchoolChange()
    window.addEventListener('schoolChanged', handleSchoolChange)
    return () => window.removeEventListener('schoolChanged', handleSchoolChange)
  }, [router])

  const fetchData = useCallback(async (force = false) => {
      const token = localStorage.getItem('token')
      if (!token) return

      setLoading(true)
      const classParams = new URLSearchParams({ academicYear: String(selectedAcademicYear) })
      if (schoolId) classParams.set('schoolId', schoolId)
      const classesUrl = `/api/classes?${classParams.toString()}`

      const params = new URLSearchParams()
      if (schoolId) params.append('schoolId', schoolId)
      if (gradeFilter) params.append('grade', gradeFilter)
      if (sectionFilter) params.append('section', sectionFilter)
      if (shiftFilter) params.append('shift', shiftFilter)
      params.append('month', selectedMonth)
      params.append('academicYear', String(selectedAcademicYear))
      const studentsUrl = `/api/students${params.toString() ? `?${params.toString()}` : ''}`

      const [schoolsRes, classesRes, studentsRes, levelsRes] = await Promise.all([
        cachedJson<{ schools?: School[] }>('/api/schools', {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
        cachedJson<{ classes?: ClassRecord[]; academicYears?: number[] }>(classesUrl, {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
        cachedJson<{ students?: Student[] }>(studentsUrl, {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
        cachedJson<ReadingLevel[]>('/api/levels', undefined, { force }),
      ])

      if (schoolsRes.ok) {
        setSchools(schoolsRes.data.schools || [])
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
        }
      }

      if (studentsRes.ok) {
        setStudents(studentsRes.data.students || [])
      }

      if (levelsRes.ok) {
        setLevels(levelsRes.data)
      }
      setLoading(false)
  }, [schoolId, gradeFilter, sectionFilter, shiftFilter, selectedMonth, selectedAcademicYear, selectedMonthPart])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchData()
    })
  }, [fetchData])

  const handleCreateStudent = async (studentRegistration: StudentRegistrationPayload): Promise<string | null> => {
    const token = localStorage.getItem('token')
    if (!token || !studentRegistration.classId) {
      return tClasses('selectClass')
    }

    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(studentRegistration),
    })

    if (res.ok) {
      const data = await res.json()
      clearClientGetCache('/api/students')
      clearClientGetCache('/api/dashboard')
      setStudents([
        ...students,
        {
          ...data.student,
          readingHistory: data.student.readingHistory || [],
          monthlyUpdateStatus: 'missing',
        },
      ])
      setShowModal(false)
      toast.success(tCommon('save'))
      return null
    } else {
      const data = await res.json()
      return data.error || tErrors('failedCreate')
    }
  }

  const handleImportStudents = async (summary: StudentImportResultSummary) => {
    clearClientGetCache('/api/students')
    clearClientGetCache('/api/dashboard')
    await fetchData(true)
    toast.success(t('importComplete', { count: summary.importedRows }))
  }

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStudent) return
    const token = localStorage.getItem('token')
    if (!token) return

    const res = await fetch(`/api/students/${editingStudent.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editingStudent.name,
        studentNumber: editingStudent.studentNumber,
        classId: editingStudent.classId
      }),
    })

    if (res.ok) {
      const data = await res.json()
      clearClientGetCache('/api/students')
      clearClientGetCache('/api/dashboard')
      setStudents(students.map(s => s.id === data.student.id ? { ...data.student, readingHistory: s.readingHistory } : s))
      setEditingStudent(null)
      toast.success(tCommon('save'))
    } else {
      toast.error(tErrors('failedUpdate'))
    }
  }

  const handleDeleteStudent = async () => {
    if (!deletingStudentId) return
    const token = localStorage.getItem('token')
    if (!token) return

    const studentIdToDelete = deletingStudentId
    setDeletingStudentId(null)

    const res = await fetch(`/api/students/${studentIdToDelete}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const deletedStudent = students.find(s => s.id === studentIdToDelete)
      clearClientGetCache('/api/students')
      clearClientGetCache('/api/dashboard')
      setStudents(students.filter(s => s.id !== studentIdToDelete))

      toast(tCommon('delete'), {
        action: {
          label: tCommon('undo'),
          onClick: async () => {
            const restoreRes = await fetch(`/api/students/${studentIdToDelete}/restore`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}` }
            })
            if (restoreRes.ok) {
              clearClientGetCache('/api/students')
              clearClientGetCache('/api/dashboard')
              if (deletedStudent) setStudents(prev => [...prev, deletedStudent])
            }
          }
        },
        duration: 10000,
      })
    } else {
      toast.error(tErrors('failedDelete'))
    }
  }

  const handleUpdateLevel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (updateLevel.studentId === TOUR_DEMO_STUDENT_ID) {
      setUpdateLevel({
        studentId: '',
        readingLevelId: '',
        notes: '',
        recordedAt: getDefaultAssessmentDateForMonth(getMonthKey()),
      })
      toast.info(tTours('demoNoSave'))
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    if (!updateLevel.readingLevelId) {
      setError(tErrors('selectLevel'))
      return
    }

    const res = await fetch('/api/students/update', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updateLevel),
    })

    if (res.ok) {
      clearClientGetCache('/api/students')
      clearClientGetCache('/api/dashboard')
      setUpdateLevel({
        studentId: '',
        readingLevelId: '',
        notes: '',
        recordedAt: getDefaultAssessmentDateForMonth(getMonthKey()),
      })
      await fetchData(true)
    } else {
      const data = await res.json()
      setError(data.error || tErrors('failedUpdate'))
    }
  }

  const formatClassName = (c?: ClassRecord) => {
    if (!c) return 'N/A'
    return `${c.grade} ${c.section} (${tClasses(`shifts.${c.shift}`)}) - ${c.academicYear}`
  }

  const getCurrentLevelLabel = (student: Student) => (
    student.readingHistory?.[0] ? tLevels(student.readingHistory[0].readingLevel.code) : t('notAssessed')
  )

  const getMonthlyUpdateLabel = (student: Student) => (
    student.monthlyUpdateStatus === 'updated'
      ? (student.monthStatus === 'current' ? t('monthlyUpdated') : t('monthlyUpdatedPast'))
      : (student.monthStatus === 'current' ? t('monthlyMissing') : t('monthlyMissingPast'))
  )

  const missingUpdatesHref = buildDashboardActionListHref('/dashboard/students/missing-updates', { month: selectedMonth, schoolId })
  const needAttentionHref = buildDashboardActionListHref('/dashboard/students/need-attention', { month: selectedMonth, schoolId })
  const improvedHref = buildDashboardActionListHref('/dashboard/students/improved', { month: selectedMonth, schoolId })
  const canManageStudents = canManageSchoolScopedRecords(user)
  const shouldShowDemoStudent = (
    ['student-assessment', 'student-profile', 'parent-report-sharing'].includes(activeDemoTour || '') &&
    students.length === 0
  )
  const visibleStudents = shouldShowDemoStudent ? [TOUR_DEMO_STUDENT] : students
  const studentMetrics = getStudentMetricCounts(visibleStudents, selectedMonth)
  const visibleLevels = levels.length > 0 ? levels : TOUR_DEMO_READING_LEVELS
  const filteredStudents = filterBySearchQuery(visibleStudents, searchQuery, (student) => [
    student.name,
    student.studentNumber,
    formatClassName(student.class),
    getCurrentLevelLabel(student),
    getMonthlyUpdateLabel(student),
  ])

  if (loading) {
    return <StudentsSkeleton />
  }

  if (schools.length === 0 && !shouldShowDemoStudent) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-700 mb-4">{t('needSchool')}</p>
        <Link href="/dashboard/schools" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block">
          {tCommon('createSchool')}
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
        {canManageStudents && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setShowImportModal(true)} data-testid="student-import-open" data-tour="students-import-button">
              <FileSpreadsheet className="size-4" />
              {t('importStudents')}
            </Button>
            <Button onClick={() => setShowModal(true)}>
              {t('add')}
            </Button>
          </div>
        )}
      </div>

      <div className="mb-6 space-y-4 bg-white p-4 rounded-lg shadow" data-tour="students-filters">
        <div className="grid gap-4 md:flex md:flex-wrap md:items-end">
          <div className="space-y-1 md:min-w-64 md:flex-1">
            <Label>{tCommon('searchPlaceholder')}</Label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                data-testid="students-search"
                aria-label={tCommon('searchPlaceholder')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1 md:w-56">
            <Label>{tClasses('school')}</Label>
            <Select value={schoolId || '__all__'} onValueChange={handleSchoolFilterChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={tClasses('selectSchool')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tClasses('all')}</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-56">
            <Label>{tClasses('grade')}</Label>
            <Select value={gradeFilter || '__all__'} onValueChange={handleGradeFilterChange}>
              <SelectTrigger className="w-full" data-testid="students-grade-filter">
                <SelectValue placeholder={tClasses('all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tClasses('all')}</SelectItem>
                {VALID_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-28">
            <Label>{tClasses('section')}</Label>
            <Select value={sectionFilter || '__all__'} onValueChange={handleSectionFilterChange}>
              <SelectTrigger className="w-full" data-testid="students-section-filter">
                <SelectValue placeholder={tClasses('all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tClasses('all')}</SelectItem>
                {sectionOptions.map((section) => (
                  <SelectItem key={section} value={section}>
                    {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-44">
            <Label>{tClasses('shift')}</Label>
            <Select value={shiftFilter} onValueChange={(value) => setShiftFilter(value === '__all__' ? '' : value)}>
              <SelectTrigger className="w-full" data-testid="students-shift-filter">
                <SelectValue placeholder={tClasses('all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tClasses('all')}</SelectItem>
                {VALID_SHIFTS.map(s => <SelectItem key={s} value={s}>{tClasses(`shifts.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 border-t pt-4 md:flex md:flex-wrap md:items-end">
          <div className="space-y-1 md:w-28">
            <Label>{t('monthFilter')}</Label>
            <Select value={selectedMonthPart} onValueChange={handleMonthPartChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('monthFilter')} />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-36">
            <Label>{tClasses('academicYear')}</Label>
            <Select value={selectedYear} onValueChange={handleYearChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={tClasses('academicYear')} />
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

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" data-tour="students-metrics">
        <Link href={needAttentionHref} data-testid="students-need-attention-card">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('needAttention')}
                </CardTitle>
                <ArrowRight className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600" data-testid="students-need-attention-count">
                {studentMetrics.needAttentionCount}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href={missingUpdatesHref} data-testid="students-missing-updates-card">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('missingMonthlyUpdates')}
                </CardTitle>
                <ArrowRight className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600" data-testid="students-missing-updates-count">
                {studentMetrics.missingMonthlyUpdatesCount}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href={improvedHref} data-testid="students-improved-card">
          <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('improved')}
                </CardTitle>
                <ArrowRight className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600" data-testid="students-improved-count">
                {studentMetrics.improvedCount}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 text-gray-700">{t('name')}</th>
              <th className="text-left p-4 text-gray-700">{t('studentNumber')}</th>
              <th className="text-left p-4 text-gray-700">{tClasses('class')}</th>
              <th className="text-left p-4 text-gray-700 whitespace-nowrap">{t('currentLevel')}</th>
              <th className="text-left p-4 text-gray-700">{t('monthlyUpdate')}</th>
              <th className="text-left p-4 text-gray-700">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleStudents.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-700">
                  {t('noStudents')}
                </td>
              </tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-700">
                  {tCommon('noSearchResults')}
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => (
                <tr key={student.id} className="border-t hover:bg-gray-50 group">
                  <td className="p-4">
                    <Link
                      href={`/dashboard/students/${student.id}`}
                      className="text-blue-600 hover:underline font-medium"
                      data-tour="students-first-profile-link"
                    >
                      {student.name}
                      {student.id === TOUR_DEMO_STUDENT_ID && (
                        <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {tTours('sampleBadge')}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="p-4 text-gray-800">{student.studentNumber}</td>
                  <td className="p-4 text-gray-800">{formatClassName(student.class)}</td>
                  <td className="p-4">
                    <span
                      className="inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-sm leading-none"
                      style={{
                        backgroundColor: getReadingLevelStyle(student.readingHistory?.[0]?.readingLevel.code).backgroundColor,
                        color: getReadingLevelStyle(student.readingHistory?.[0]?.readingLevel.code).textColor,
                      }}
                    >
                      {getCurrentLevelLabel(student)}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge
                      variant={student.monthlyUpdateStatus === 'updated' ? 'success' : 'warning'}
                    >
                      {getMonthlyUpdateLabel(student)}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        data-tour="students-update-level-button"
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setUpdateLevel({
                            studentId: student.id,
                            readingLevelId: '',
                            notes: '',
                            recordedAt: getDefaultAssessmentDateForMonth(selectedMonth),
                          })
                        }}
                        className={`h-auto p-0 ${student.monthlyUpdateStatus === 'missing' ? 'text-amber-700' : 'text-blue-600'
                          }`}
                      >
                        {t('updateLevel')}
                      </Button>

                      {canManageStudents && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingStudent(student)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title={tCommon('edit')}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingStudentId(student.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title={tCommon('delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <StudentRegistrationModal
          classes={classes}
          formatClassName={formatClassName}
          onCancel={() => setShowModal(false)}
          onSubmit={handleCreateStudent}
        />
      )}

      {showImportModal && (
        <StudentImportModal
          classes={classes}
          levels={visibleLevels}
          userId={user?.id}
          formatClassName={formatClassName}
          initialMonth={selectedMonth}
          onCancel={() => setShowImportModal(false)}
          onImported={handleImportStudents}
        />
      )}

      {/* Edit Modal */}
      {editingStudent && (
        <div className="!mt-0 fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('editStudent')}</h2>
            <form onSubmit={handleUpdateStudent} className="space-y-4">
              <div className="space-y-1">
                <Label>{tClasses('selectClass')}</Label>
                <Select value={editingStudent.classId} onValueChange={(value) => setEditingStudent({ ...editingStudent, classId: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tClasses('selectClass')} />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {formatClassName(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="text"
                placeholder={t('name')}
                value={editingStudent.name}
                onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                required
              />
              <Input
                type="text"
                placeholder={t('studentNumber')}
                value={editingStudent.studentNumber}
                onChange={(e) => setEditingStudent({ ...editingStudent, studentNumber: e.target.value })}
                required
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {tCommon('save')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingStudent(null)} className="flex-1">
                  {tCommon('cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Level Modal */}
      {updateLevel.studentId && (
        <div className="!mt-0 fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl" data-tour="assessment-modal">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('updateLevel')}</h2>
            <form onSubmit={handleUpdateLevel} className="space-y-4">
              <div className="space-y-1" data-tour="assessment-level-field">
                <Label>{tLevels('selectLevel')}</Label>
                <Select value={updateLevel.readingLevelId} onValueChange={(value) => setUpdateLevel({ ...updateLevel, readingLevelId: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tLevels('selectLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleLevels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {tLevels(level.code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <textarea
                data-tour="assessment-notes-field"
                placeholder={t('notes')}
                value={updateLevel.notes}
                onChange={(e) => setUpdateLevel({ ...updateLevel, notes: e.target.value })}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                rows={3}
              />
              <div className="space-y-1" data-tour="assessment-date-field">
                <Label>{t('assessmentDate')}</Label>
                <Input
                  type="date"
                  value={updateLevel.recordedAt}
                  max={maxAssessmentDate}
                  onChange={(e) => setUpdateLevel({ ...updateLevel, recordedAt: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-2" data-tour="assessment-actions">
                <Button type="submit" className="flex-1">
                  {tCommon('save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-tour="assessment-cancel"
                  onClick={() => setUpdateLevel({ studentId: '', readingLevelId: '', notes: '', recordedAt: getDefaultAssessmentDateForMonth(getMonthKey()) })}
                  className="flex-1"
                >
                  {tCommon('cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!deletingStudentId} onOpenChange={(open) => !open && setDeletingStudentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon('confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{tCommon('deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStudent} className="bg-red-600 hover:bg-red-700">
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
