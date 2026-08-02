'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import ClassesSkeleton from '@/components/skeletons/ClassesSkeleton'
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
import { Pencil, Search, Trash2 } from "lucide-react"
import Link from 'next/link'
import { ACADEMIC_YEARS, getDefaultAcademicYear } from '@/lib/academic-years'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cachedJson, clearClientGetCache } from '@/lib/client-get-cache'
import { PaginationControls } from '@/components/ui/pagination-controls'
import {
  DEFAULT_PAGE_SIZE,
  type PaginationMeta,
  type PageSizeOption,
} from '@/lib/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { canManageSchoolScopedRecords, getStoredUser, type StoredUser } from '@/lib/client-auth'
import { DashboardAddButton } from '@/components/dashboard/DashboardAddButton'

interface School {
  id: string
  name: string
}

interface ClassRecord {
  id: string
  grade: string
  section: string
  shift: string
  academicYear: number
  schoolId: string
  school: School
}

const VALID_SHIFTS = ['Morning', 'Afternoon', 'Night']
const VALID_GRADES = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano', '1ª Série', '2ª Série', '3ª Série']
const DEFAULT_ACADEMIC_YEAR = getDefaultAcademicYear()
const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

export default function ClassesPage() {
  const router = useRouter()
  const t = useTranslations('classes')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors')
  
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [availableAcademicYears, setAvailableAcademicYears] = useState<number[]>(ACADEMIC_YEARS)
  const [schoolId, setSchoolId] = useState('')
  const [academicYearFilter, setAcademicYearFilter] = useState(String(DEFAULT_ACADEMIC_YEAR))
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE)
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<StoredUser | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [newClass, setNewClass] = useState({ grade: '', section: '', shift: '', schoolId: '', academicYear: DEFAULT_ACADEMIC_YEAR })
  
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null)
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null)

  const handleSchoolFilterChange = (value: string) => {
    const nextSchoolId = value === '__all__' ? '' : value
    setSchoolId(nextSchoolId)
    setPage(1)
    localStorage.setItem('selectedSchool', nextSchoolId)
    window.dispatchEvent(new Event('schoolChanged'))
  }

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
      setPage(1)
    }

    handleSchoolChange()
    window.addEventListener('schoolChanged', handleSchoolChange)
    return () => window.removeEventListener('schoolChanged', handleSchoolChange)
  }, [router])

  const fetchData = useCallback(async (force = false) => {
      const token = localStorage.getItem('token')
      if (!token) return

      setLoading(true)
      const params = new URLSearchParams()
      if (schoolId) params.set('schoolId', schoolId)
      if (academicYearFilter) params.set('academicYear', academicYearFilter)
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      const url = `/api/classes${params.toString() ? `?${params.toString()}` : ''}`

      const [schoolsRes, classesRes] = await Promise.all([
        cachedJson<{ schools?: School[] }>('/api/schools', {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
        cachedJson<{ classes?: ClassRecord[]; academicYears?: number[]; pagination?: PaginationMeta }>(url, {
          headers: { Authorization: `Bearer ${token}` },
        }, { force }),
      ])

      if (schoolsRes.ok && schoolsRes.data.schools) {
        setSchools(schoolsRes.data.schools)
      }

      if (classesRes.ok && classesRes.data.classes) {
        setClasses(classesRes.data.classes)
        const nextPagination = classesRes.data.pagination || DEFAULT_PAGINATION
        setPagination(nextPagination)
        if (nextPagination.page !== page) setPage(nextPagination.page)
        const years = classesRes.data.academicYears?.length ? classesRes.data.academicYears : ACADEMIC_YEARS
        setAvailableAcademicYears(years)
        if (years.length > 0 && !years.includes(Number(academicYearFilter))) {
          setAcademicYearFilter(String(years[0]))
          setPage(1)
        }
      }
      setLoading(false)
  }, [schoolId, academicYearFilter, searchQuery, page, pageSize])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return

    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newClass),
    })

    if (res.ok) {
      clearClientGetCache('/api/classes')
      await fetchData(true)
      setShowModal(false)
      setNewClass({ grade: '', section: '', shift: '', schoolId: '', academicYear: Number(academicYearFilter) || DEFAULT_ACADEMIC_YEAR })
      toast.success(tCommon('save'))
    } else {
      const data = await res.json()
      toast.error(data.error || tErrors('failedUpdate'))
    }
  }

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingClass) return
    const token = localStorage.getItem('token')
    if (!token) return

    const res = await fetch(`/api/classes/${editingClass.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        grade: editingClass.grade, 
        section: editingClass.section,
        shift: editingClass.shift,
        academicYear: editingClass.academicYear
      }),
    })

    if (res.ok) {
      clearClientGetCache('/api/classes')
      await fetchData(true)
      setEditingClass(null)
      toast.success(tCommon('save'))
    } else {
      const data = await res.json()
      toast.error(data.error || tErrors('failedUpdate'))
    }
  }

  const handleDeleteClass = async () => {
    if (!deletingClassId) return
    const token = localStorage.getItem('token')
    if (!token) return

    const classIdToDelete = deletingClassId
    setDeletingClassId(null)

    const res = await fetch(`/api/classes/${classIdToDelete}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const deletedClass = classes.find(c => c.id === classIdToDelete)
      clearClientGetCache('/api/classes')
      await fetchData(true)
      
      toast(tCommon('delete'), {
        action: {
          label: tCommon('undo'),
          onClick: async () => {
            const restoreRes = await fetch(`/api/classes/${classIdToDelete}/restore`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}` }
            })
            if (restoreRes.ok) {
              clearClientGetCache('/api/classes')
              if (deletedClass) await fetchData(true)
            }
          }
        },
        duration: 10000,
      })
    } else {
      toast.error(tErrors('failedDelete'))
    }
  }

  if (loading) {
    return <ClassesSkeleton />
  }

  const canManageClasses = canManageSchoolScopedRecords(user)

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
        {canManageClasses && (
          <DashboardAddButton
            onClick={() => setShowModal(true)}
            label={t('add')}
          />
        )}
      </div>

      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="grid gap-4 md:flex md:flex-wrap md:items-end">
          <div className="space-y-1 md:min-w-64 md:flex-1">
            <Label className="text-gray-700">{tCommon('searchPlaceholder')}</Label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                data-testid="classes-search"
                aria-label={tCommon('searchPlaceholder')}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1 md:w-56">
            <Label className="text-gray-700">{t('school')}</Label>
            <Select value={schoolId || '__all__'} onValueChange={handleSchoolFilterChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('selectSchool')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('all')}</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:w-36">
            <Label className="text-gray-700">{t('academicYear')}</Label>
            <Select
              value={academicYearFilter}
              onValueChange={(value) => {
                setAcademicYearFilter(value)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('academicYear')} />
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

      {schools.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-700 mb-4">{t('needSchool')}</p>
          <Link href="/dashboard/schools" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block">
            {tCommon('createSchool')}
          </Link>
        </div>
      ) : (
        <>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 text-gray-700">{t('grade')}</th>
              <th className="text-left p-4 text-gray-700">{t('academicYear')}</th>
              <th className="text-left p-4 text-gray-700">{t('section')}</th>
              <th className="text-left p-4 text-gray-700">{t('shift')}</th>
              <th className="text-left p-4 text-gray-700">{t('school')}</th>
              {canManageClasses && <th className="text-left p-4 text-gray-700">{tCommon('actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td colSpan={canManageClasses ? 6 : 5} className="p-4 text-center text-gray-700">
                  {searchQuery.trim() ? tCommon('noSearchResults') : t('noClasses')}
                </td>
              </tr>
            ) : (
              classes.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50 group">
                  <td className="p-4 text-gray-800">{c.grade}</td>
                  <td className="p-4 text-gray-800">{c.academicYear}</td>
                  <td className="p-4 text-gray-800">{c.section}</td>
                  <td className="p-4 text-gray-800">{t(`shifts.${c.shift}`)}</td>
                  <td className="p-4 text-gray-800">{c.school?.name}</td>
                  {canManageClasses && (
                    <td className="p-4">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingClass(c)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title={tCommon('edit')}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeletingClassId(c.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title={tCommon('delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <PaginationControls
          pagination={pagination}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize)
            setPage(1)
          }}
        />
      </div>

      {showModal && (
        <div className="!mt-0 fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('add')}</h2>
            <form onSubmit={handleCreateClass} className="space-y-4">
              <select
                value={newClass.schoolId}
                onChange={(e) => setNewClass({ ...newClass, schoolId: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              >
                <option value="">{t('selectSchool')}</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </select>
              
              <select
                value={newClass.grade}
                onChange={(e) => setNewClass({ ...newClass, grade: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              >
                <option value="">{t('selectGrade')}</option>
                {VALID_GRADES.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>

              <Select value={String(newClass.academicYear)} onValueChange={(value) => setNewClass({ ...newClass, academicYear: Number(value) })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('academicYear')} />
                </SelectTrigger>
                <SelectContent>
                  {ACADEMIC_YEARS.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input
                type="text"
                placeholder={t('section')}
                value={newClass.section}
                onChange={(e) => setNewClass({ ...newClass, section: e.target.value.toUpperCase() })}
                className="w-full p-2 border border-gray-300 rounded"
                maxLength={2}
                required
              />

              <select
                value={newClass.shift}
                onChange={(e) => setNewClass({ ...newClass, shift: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              >
                <option value="">{t('selectShift')}</option>
                {VALID_SHIFTS.map((shift) => (
                  <option key={shift} value={shift}>{t(`shifts.${shift}`)}</option>
                ))}
              </select>

              <div className="flex gap-2">
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {tCommon('add')}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded">
                  {tCommon('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingClass && (
        <div className="!mt-0 fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('editClass')}</h2>
            <form onSubmit={handleUpdateClass} className="space-y-4">
              <select
                value={editingClass.grade}
                onChange={(e) => setEditingClass({ ...editingClass, grade: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              >
                <option value="">{t('selectGrade')}</option>
                {VALID_GRADES.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>

              <Select value={String(editingClass.academicYear)} onValueChange={(value) => setEditingClass({ ...editingClass, academicYear: Number(value) })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('academicYear')} />
                </SelectTrigger>
                <SelectContent>
                  {ACADEMIC_YEARS.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input
                type="text"
                placeholder={t('section')}
                value={editingClass.section}
                onChange={(e) => setEditingClass({ ...editingClass, section: e.target.value.toUpperCase() })}
                className="w-full p-2 border border-gray-300 rounded"
                maxLength={2}
                required
              />

              <select
                value={editingClass.shift}
                onChange={(e) => setEditingClass({ ...editingClass, shift: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              >
                <option value="">{t('selectShift')}</option>
                {VALID_SHIFTS.map((shift) => (
                  <option key={shift} value={shift}>{t(`shifts.${shift}`)}</option>
                ))}
              </select>

              <div className="flex gap-2">
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {tCommon('save')}
                </button>
                <button type="button" onClick={() => setEditingClass(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded">
                  {tCommon('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!deletingClassId} onOpenChange={(open) => !open && setDeletingClassId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon('confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{tCommon('deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClass} className="bg-red-600 hover:bg-red-700">
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
    </div>
  )
}
