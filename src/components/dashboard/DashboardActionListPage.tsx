'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import ActionListSkeleton from '@/components/skeletons/ActionListSkeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { ACADEMIC_YEARS } from '@/lib/academic-years'
import {
  buildMonthKey,
  getAvailableMonthOptions,
  fromInputMonth,
  formatLocalizedMonth,
  getMonthKey,
  getMonthPartFromMonthKey,
  getYearFromMonthKey,
  resolveMonthKey,
  toInputMonth,
} from '@/lib/monthly-updates'
import { getReadingLevelStyle } from '@/lib/reading-levels'
import { cachedJson, clearClientGetCache } from '@/lib/client-get-cache'
import { useTourDemoMode } from '@/components/tours/useTourDemoMode'
import {
  TOUR_DEMO_DASHBOARD_STATS,
  TOUR_DEMO_READING_LEVELS,
  TOUR_DEMO_STUDENT_ID,
} from '@/lib/product-tour-demo-data'

type ActionListKind = 'need-attention' | 'missing-updates' | 'improved'

interface School {
  id: string
  name: string
}

interface AttentionStudent {
  id: string
  name: string
  studentNumber: string
  classId: string
  schoolName: string
  levelCode: string
}

interface MissingUpdateStudent extends AttentionStudent {
  latestAssessmentMonth: string | null
}

interface ClassRecord {
  id: string
  grade: string
  section: string
  shift: string
  academicYear: number
  schoolId: string
}

interface ReadingLevel {
  id: string
  code: string
  name: string
  order: number
}

interface DashboardStats {
  needAttention: AttentionStudent[]
  improved: AttentionStudent[]
  monthlyUpdates: {
    month: string
    missingStudents: MissingUpdateStudent[]
  }
}

interface DashboardActionListPageProps {
  kind: ActionListKind
  initialMonth?: string
  initialSchoolId?: string
  from?: string
}

export default function DashboardActionListPage({
  kind,
  initialMonth,
  initialSchoolId = '',
  from,
}: DashboardActionListPageProps) {
  const router = useRouter()
  const t = useTranslations()
  const locale = useLocale()
  const activeDemoTour = useTourDemoMode()
  const initialResolvedMonth = resolveMonthKey(initialMonth)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [schoolId, setSchoolId] = useState(initialSchoolId)
  const [selectedMonth, setSelectedMonth] = useState(initialResolvedMonth)
  const [selectedYear, setSelectedYear] = useState(String(getYearFromMonthKey(initialResolvedMonth)))
  const [availableAcademicYears, setAvailableAcademicYears] = useState<number[]>(ACADEMIC_YEARS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<StoredUser | null>(null)

  const [levels, setLevels] = useState<ReadingLevel[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [editingStudent, setEditingStudent] = useState<AttentionStudent | null>(null)
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null)
  const [updateLevel, setUpdateLevel] = useState({
    studentId: '',
    readingLevelId: '',
    notes: '',
    referenceMonth: getMonthKey(),
  })
  const canManageStudents = canManageSchoolScopedRecords(user)

  const selectedMonthPart = getMonthPartFromMonthKey(selectedMonth)
  const selectedAcademicYear = Number(selectedYear)
  const availableMonths = getAvailableMonthOptions(selectedAcademicYear)
  const isNeedAttention = kind === 'need-attention'
  const isImproved = kind === 'improved'
  const title = isNeedAttention
    ? t('students.needAttention')
    : isImproved
    ? t('students.improved')
    : t('students.missingMonthlyUpdates')
  const emptyMessage = isNeedAttention
    ? t('dashboard.noStudentsNeedAttention')
    : isImproved
    ? t('dashboard.noStudentsImproved')
    : t('dashboard.noStudentsMissingMonthlyUpdate')

  const backHref = from === 'dashboard' ? '/dashboard' : '/dashboard/students'
  const backLabel = from === 'dashboard' ? t('dashboard.backToDashboard') : t('students.backToStudents')

  const formatClassName = (c?: ClassRecord) => {
    if (!c) return 'N/A'
    return `${c.grade} ${c.section} (${t(`classes.shifts.${c.shift}`)}) - ${c.academicYear}`
  }

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

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    queueMicrotask(() => setUser(getStoredUser()))
  }, [router])

  const fetchData = useCallback(async (force = false) => {
      const token = localStorage.getItem('token')
      if (!token) return

      setLoading(true)

      const classParams = new URLSearchParams()
      if (schoolId) classParams.set('schoolId', schoolId)

      const dashboardParams = new URLSearchParams({ month: selectedMonth })
      if (schoolId) dashboardParams.set('schoolId', schoolId)

      const [schoolsRes, classesRes, levelsRes, dashboardRes] = await Promise.all([
        cachedJson<{ schools?: School[] }>('/api/schools', {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
        cachedJson<{ classes?: ClassRecord[]; academicYears?: number[] }>(`/api/classes${classParams.toString() ? `?${classParams.toString()}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
        cachedJson<ReadingLevel[]>('/api/levels', undefined, { force }),
        cachedJson<DashboardStats>(`/api/dashboard?${dashboardParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
      ])

      if (schoolsRes.ok) {
        setSchools(schoolsRes.data.schools || [])
      }

      if (classesRes.ok) {
        setClasses(classesRes.data.classes || [])
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

      if (levelsRes.ok) {
        setLevels(levelsRes.data)
      }

      if (dashboardRes.ok) {
        setStats(dashboardRes.data)
      }

      setLoading(false)
  }, [schoolId, selectedMonth, selectedAcademicYear, selectedMonthPart])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchData()
    })
  }, [fetchData])

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
        classId: editingStudent.classId,
      }),
    })

    if (res.ok) {
      clearClientGetCache('/api/students')
      clearClientGetCache('/api/dashboard')
      setEditingStudent(null)
      await fetchData(true)
    } else {
      toast.error(t('errors.failedUpdate'))
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
      clearClientGetCache('/api/students')
      clearClientGetCache('/api/dashboard')
      await fetchData(true)
    } else {
      toast.error(t('errors.failedDelete'))
    }
  }

  const handleUpdateLevel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (updateLevel.studentId === TOUR_DEMO_STUDENT_ID) {
      setUpdateLevel({
        studentId: '',
        readingLevelId: '',
        notes: '',
        referenceMonth: getMonthKey(),
      })
      toast.info(t('tours.demoNoSave'))
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    if (!updateLevel.readingLevelId) {
      setError(t('errors.selectLevel'))
      return
    }

    const submitLevel = (confirmReplace = false) => fetch('/api/students/update', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updateLevel, confirmReplace }),
    })
    let res = await submitLevel()
    if (res.status === 409) {
      if (!window.confirm(t('students.confirmReplaceMonth', { month: updateLevel.referenceMonth }))) return
      res = await submitLevel(true)
    }

    if (res.ok) {
      clearClientGetCache('/api/students')
      clearClientGetCache('/api/dashboard')
      setUpdateLevel({
        studentId: '',
        readingLevelId: '',
        notes: '',
        referenceMonth: getMonthKey(),
      })
      await fetchData(true)
    } else {
      const data = await res.json()
      setError(data.error || t('errors.failedUpdate'))
    }
  }

  const shouldShowDemoStats = (
    activeDemoTour === 'monthly-follow-up' &&
    (!stats || (
      stats.needAttention.length === 0 &&
      stats.improved.length === 0 &&
      stats.monthlyUpdates.missingStudents.length === 0
    ))
  )
  const visibleStats = shouldShowDemoStats ? TOUR_DEMO_DASHBOARD_STATS : stats
  const visibleLevels = levels.length > 0 ? levels : TOUR_DEMO_READING_LEVELS
  const students = kind === 'need-attention'
    ? visibleStats?.needAttention || []
    : kind === 'improved'
    ? visibleStats?.improved || []
    : visibleStats?.monthlyUpdates.missingStudents || []
  if (loading) {
    return <ActionListSkeleton />
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="link" className="mb-2 h-auto p-0 text-blue-600">
            <Link href={backHref}>
              <ArrowLeft className="size-4" />
              {backLabel}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
        </div>
      </div>

      <Card className="mb-6" data-tour="action-list-filters">
        <CardContent className="p-4">
          <div className="grid gap-4 md:flex md:flex-wrap md:items-end">
            <div className="space-y-1 md:w-56">
              <Label>{t('classes.school')}</Label>
              <Select value={schoolId || '__all__'} onValueChange={(value) => setSchoolId(value === '__all__' ? '' : value)}>
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
            <div className="space-y-1 md:w-28">
              <Label>{t('dashboard.monthFilter')}</Label>
              <Select value={selectedMonthPart} onValueChange={handleMonthPartChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('dashboard.monthFilter')} />
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
              <Label>{t('classes.academicYear')}</Label>
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
        </CardContent>
      </Card>

      <Card data-tour="action-list-table">
        <CardContent className="p-0">
          {students.length === 0 ? (
            <div className="p-8 text-center text-gray-700">{emptyMessage}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b">
                    <th className="text-left p-4 text-gray-700">{t('students.name')}</th>
                    <th className="text-left p-4 text-gray-700">{t('students.studentNumber')}</th>
                    <th className="text-left p-4 text-gray-700">{t('nav.schools')}</th>
                    <th className="text-left p-4 text-gray-700">{t('students.readingLevel')}</th>
                    {(!isNeedAttention && !isImproved) && (
                      <th className="text-left p-4 text-gray-700">{t('students.latestUpdate')}</th>
                    )}
                    <th className="text-left p-4 text-gray-700">{t('students.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="border-b hover:bg-gray-50 group">
                      <td className="p-4 text-gray-800 font-medium">
                        <Link href={`/dashboard/students/${student.id}`} className="text-blue-600 hover:underline">
                          {student.name}
                          {student.id === TOUR_DEMO_STUDENT_ID && (
                            <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {t('tours.sampleBadge')}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="p-4 text-gray-800">{student.studentNumber}</td>
                      <td className="p-4 text-gray-800">{student.schoolName}</td>
                      <td className="p-4">
                        <span
                          className="px-2 py-1 rounded text-sm"
                          style={{
                            backgroundColor: getReadingLevelStyle(student.levelCode).backgroundColor,
                            color: getReadingLevelStyle(student.levelCode).textColor,
                          }}
                        >
                          {student.levelCode !== 'N/A'
                            ? t(`levels.${student.levelCode}`)
                            : t('students.notAssessed')}
                        </span>
                      </td>
                      {(!isNeedAttention && !isImproved) && (
                        <td className="p-4 text-gray-800">
                          {(student as MissingUpdateStudent).latestAssessmentMonth
                            ? formatLocalizedMonth((student as MissingUpdateStudent).latestAssessmentMonth!, locale)
                            : t('students.notAssessed')}
                        </td>
                      )}
                      <td className="p-4">
                        <div className="flex items-center gap-4">
                          <Button
                            type="button"
                            data-tour="action-list-update-level-button"
                            variant="link"
                            size="sm"
                            onClick={() => {
                              setUpdateLevel({
                                studentId: student.id,
                                readingLevelId: '',
                                notes: '',
                                referenceMonth: selectedMonth,
                              })
                            }}
                            className="h-auto p-0 text-blue-600"
                          >
                            {t('students.updateLevel')}
                          </Button>

                          {canManageStudents && (
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditingStudent(student)}
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title={t('common.edit')}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => setDeletingStudentId(student.id)}
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                                title={t('common.delete')}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {editingStudent && (
        <div className="!mt-0 fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('students.editStudent')}</h2>
            <form onSubmit={handleUpdateStudent} className="space-y-4">
              <div className="space-y-1">
                <Label>{t('classes.selectClass')}</Label>
                <Select value={editingStudent.classId} onValueChange={(value) => setEditingStudent({ ...editingStudent, classId: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('classes.selectClass')} />
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
                placeholder={t('students.name')}
                value={editingStudent.name}
                onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                required
              />
              <Input
                type="text"
                placeholder={t('students.studentNumber')}
                value={editingStudent.studentNumber}
                onChange={(e) => setEditingStudent({ ...editingStudent, studentNumber: e.target.value })}
                required
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {t('common.save')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingStudent(null)} className="flex-1">
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Level Modal */}
      {updateLevel.studentId && (
        <div className="!mt-0 fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('students.updateLevel')}</h2>
            <form onSubmit={handleUpdateLevel} className="space-y-4">
              {error && (
                <div className="p-2 bg-red-100 text-red-700 text-sm rounded">{error}</div>
              )}
              <div className="space-y-1">
                <Label>{t('levels.selectLevel')}</Label>
                <Select value={updateLevel.readingLevelId} onValueChange={(value) => setUpdateLevel({ ...updateLevel, readingLevelId: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('levels.selectLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleLevels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {t(`levels.${level.code}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <textarea
                placeholder={t('students.notes')}
                value={updateLevel.notes}
                onChange={(e) => setUpdateLevel({ ...updateLevel, notes: e.target.value })}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                rows={3}
              />
              <div className="space-y-1">
                <Label>{t('students.referenceMonth')}</Label>
                <Input
                  type="month"
                  value={toInputMonth(updateLevel.referenceMonth)}
                  max={toInputMonth(getMonthKey())}
                  onChange={(e) => setUpdateLevel({ ...updateLevel, referenceMonth: fromInputMonth(e.target.value) })}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {t('common.save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-tour="assessment-cancel"
                  onClick={() => setUpdateLevel({ studentId: '', readingLevelId: '', notes: '', referenceMonth: getMonthKey() })}
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!deletingStudentId} onOpenChange={(open) => !open && setDeletingStudentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStudent} className="bg-red-600 hover:bg-red-700">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
