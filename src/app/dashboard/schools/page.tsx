'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import SchoolsSkeleton from '@/components/skeletons/SchoolsSkeleton'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { filterBySearchQuery } from '@/lib/search'
import { cachedJson, clearClientGetCache } from '@/lib/client-get-cache'

interface School {
  id: string
  name: string
  address?: string
}

export default function SchoolsPage() {
  const router = useRouter()
  const t = useTranslations('schools')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors')
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [newSchool, setNewSchool] = useState({ name: '', address: '' })
  
  const [editingSchool, setEditingSchool] = useState<School | null>(null)
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    const fetchSchools = async () => {
      const res = await cachedJson<{ schools?: School[] }>('/api/schools', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok && res.data.schools) {
        setSchools(res.data.schools)
      }
      setLoading(false)
    }
    fetchSchools()
  }, [router])

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return

    const res = await fetch('/api/schools', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newSchool),
    })

    if (res.ok) {
      const data = await res.json()
      clearClientGetCache('/api/schools')
      setSchools([...schools, data.school])
      setShowModal(false)
      setNewSchool({ name: '', address: '' })
    }
  }

  const handleUpdateSchool = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSchool) return
    const token = localStorage.getItem('token')
    if (!token) return

    const res = await fetch(`/api/schools/${editingSchool.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingSchool.name, address: editingSchool.address }),
    })

    if (res.ok) {
      const data = await res.json()
      clearClientGetCache('/api/schools')
      setSchools(schools.map(s => s.id === data.school.id ? data.school : s))
      setEditingSchool(null)
    } else {
      toast.error(tErrors('failedUpdate'))
    }
  }

  const handleDeleteSchool = async () => {
    if (!deletingSchoolId) return
    const token = localStorage.getItem('token')
    if (!token) return

    const schoolIdToDelete = deletingSchoolId
    setDeletingSchoolId(null)

    const res = await fetch(`/api/schools/${schoolIdToDelete}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const deletedSchool = schools.find(s => s.id === schoolIdToDelete)
      clearClientGetCache('/api/schools')
      setSchools(schools.filter(s => s.id !== schoolIdToDelete))
      
      toast(tCommon('delete'), {
        action: {
          label: tCommon('undo'),
          onClick: async () => {
            const restoreRes = await fetch(`/api/schools/${schoolIdToDelete}/restore`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}` }
            })
            if (restoreRes.ok) {
              clearClientGetCache('/api/schools')
              if (deletedSchool) setSchools(prev => [...prev, deletedSchool])
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
    return <SchoolsSkeleton />
  }

  const filteredSchools = filterBySearchQuery(schools, searchQuery, (school) => [
    school.name,
    school.address,
  ])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {t('add')}
        </button>
      </div>

      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="space-y-1">
          <Label>{tCommon('searchPlaceholder')}</Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              data-testid="schools-search"
              aria-label={tCommon('searchPlaceholder')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {schools.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center text-gray-700 col-span-full">
            {t('noSchools')}
          </div>
        ) : filteredSchools.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center text-gray-700 col-span-full">
            {tCommon('noSearchResults')}
          </div>
        ) : (
          filteredSchools.map((school) => (
            <div key={school.id} className="bg-white p-6 rounded-lg shadow relative group">
              <h3 className="text-lg font-semibold text-gray-800">{school.name}</h3>
              <p className="text-gray-600 text-sm">{school.address || t('noAddress')}</p>
              
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingSchool(school)}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                  title={tCommon('edit')}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeletingSchoolId(school.id)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full"
                  title={tCommon('delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96">
            <h2 className="text-xl font-bold mb-4">{t('add')}</h2>
            <form onSubmit={handleCreateSchool} className="space-y-4">
              <input
                type="text"
                placeholder={t('name')}
                value={newSchool.name}
                onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              />
              <input
                type="text"
                placeholder={t('addressOptional')}
                value={newSchool.address}
                onChange={(e) => setNewSchool({ ...newSchool, address: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {tCommon('add')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingSchool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-xl font-bold mb-4">{t('editSchool')}</h2>
            <form onSubmit={handleUpdateSchool} className="space-y-4">
              <input
                type="text"
                placeholder={t('name')}
                value={editingSchool.name}
                onChange={(e) => setEditingSchool({ ...editingSchool, name: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              />
              <input
                type="text"
                placeholder={t('addressOptional')}
                value={editingSchool.address || ''}
                onChange={(e) => setEditingSchool({ ...editingSchool, address: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {tCommon('save')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSchool(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!deletingSchoolId} onOpenChange={(open) => !open && setDeletingSchoolId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon('confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tCommon('deleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSchool} className="bg-red-600 hover:bg-red-700">
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
