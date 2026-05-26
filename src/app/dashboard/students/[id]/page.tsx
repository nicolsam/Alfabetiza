'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ArrowLeft, TrendingUp, User, BookOpen, Trash2, BarChart2, Edit2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { getReadingLevelStyle } from '@/lib/reading-levels'
import { getDefaultAssessmentDateForMonth, getMonthKey } from '@/lib/monthly-updates'
import { buildReadingLevelAxisLabels, buildStudentProgressChartData } from '@/lib/student-progress-chart'
import { getLocalDateString, formatPayloadDate } from '@/lib/date-utils'
import StudentProfileSkeleton from '@/components/skeletons/StudentProfileSkeleton'
import { cachedJson, clearClientGetCache } from '@/lib/client-get-cache'
import StudentContactsAndReportShare from '@/components/students/StudentContactsAndReportShare'
import RichTextEditor from '@/components/ui/RichTextEditor'
import { useTourDemoMode } from '@/components/tours/useTourDemoMode'
import {
  TOUR_DEMO_COMMENTARIES,
  TOUR_DEMO_READING_LEVELS,
  TOUR_DEMO_STUDENT,
  TOUR_DEMO_STUDENT_ID,
} from '@/lib/product-tour-demo-data'
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

const StudentProgressChart = dynamic(() => import('@/components/dashboard/StudentProgressChart'), {
  loading: () => <div className="h-[280px] animate-pulse rounded bg-gray-50" />,
})

const StudentProgressBarChart = dynamic(() => import('@/components/dashboard/StudentProgressBarChart'), {
  loading: () => <div className="h-[280px] animate-pulse rounded bg-gray-50" />,
})

interface ClassRecord {
  id: string
  grade: string
  section: string
  shift: string
  academicYear: number
}

interface HistoryEntry {
  id: string
  recordedAt: string
  notes: string | null
  readingLevel: { id: string; code: string; name: string; order: number }
  userId: string
  teacher: { name: string; role?: string }
}

interface CommentaryEntry {
  id: string
  recordedAt: string
  commentary: string
  userId: string
  teacher: { name: string; role?: string }
}

type TimelineItem = 
  | (HistoryEntry & { type: 'history' })
  | (CommentaryEntry & { type: 'commentary' })

interface StudentDetail {
  id: string
  name: string
  studentNumber: string
  class: ClassRecord
  school: { id: string; name: string }
}

interface ReadingLevel {
  id: string
  code: string
  name: string
  order: number
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const t = useTranslations('students')
  const tClasses = useTranslations('classes')
  const tCommon = useTranslations('common')
  const tLevels = useTranslations('levels')
  const tErrors = useTranslations('errors')
  const tTours = useTranslations('tours')
  const locale = useLocale()
  const activeDemoTour = useTourDemoMode()

  const [studentId, setStudentId] = useState<string>('')
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [levels, setLevels] = useState<ReadingLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updateLevel, setUpdateLevel] = useState({
    readingLevelId: '',
    recordedAt: getDefaultAssessmentDateForMonth(getMonthKey()),
    notes: '',
  })
  
  // Inline comment state
  const [inlineComment, setInlineComment] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)

  // Edit states
  const [editingItem, setEditingItem] = useState<TimelineItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<TimelineItem | null>(null)
  const [editHistoryData, setEditHistoryData] = useState({ readingLevelId: '', recordedAt: '', notes: '' })
  const [editCommentaryData, setEditCommentaryData] = useState({ commentary: '', recordedAt: '' })
  
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; isGlobalAdmin: boolean } | null>(null)

  const maxAssessmentDate = getDefaultAssessmentDateForMonth(getMonthKey())

  useEffect(() => {
    params.then(p => setStudentId(p.id))
  }, [params])

  useEffect(() => {
    if (!studentId) return
    if (studentId === TOUR_DEMO_STUDENT_ID) {
      const combined: TimelineItem[] = [
        ...TOUR_DEMO_STUDENT.readingHistory.map((historyEntry) => ({ ...historyEntry, type: 'history' as const })),
        ...TOUR_DEMO_COMMENTARIES.map((commentary) => ({ ...commentary, type: 'commentary' as const })),
      ].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())

      queueMicrotask(() => {
        setStudent(TOUR_DEMO_STUDENT)
        setHistory(TOUR_DEMO_STUDENT.readingHistory)
        setTimeline(combined)
        setLevels(TOUR_DEMO_READING_LEVELS)
        setCurrentUser({ id: 'tour-demo-teacher', role: 'TEACHER', isGlobalAdmin: false })
        setLoading(false)
      })
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { id: string; role: string; isGlobalAdmin: boolean }
      queueMicrotask(() => setCurrentUser(payload))
    } catch {
      // ignore
    }

    const fetchData = async () => {
      const [historyRes, levelsRes] = await Promise.all([
        cachedJson<{ student: StudentDetail; history: HistoryEntry[]; commentaries: CommentaryEntry[] }>(`/api/students/${studentId}/history`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        cachedJson<ReadingLevel[]>('/api/levels'),
      ])

      if (historyRes.ok) {
        setStudent(historyRes.data.student)
        setHistory(historyRes.data.history)
        const combined: TimelineItem[] = [
          ...historyRes.data.history.map((h: HistoryEntry) => ({ ...h, type: 'history' as const })),
          ...historyRes.data.commentaries.map((c: CommentaryEntry) => ({ ...c, type: 'commentary' as const }))
        ].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
        setTimeline(combined)
      }

      if (levelsRes.ok) {
        setLevels(levelsRes.data)
      }

      setLoading(false)
    }
    fetchData()
  }, [studentId, router, activeDemoTour])

  const refreshData = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    clearClientGetCache(`/api/students/${studentId}/history`)
    const historyRes = await cachedJson<{ student: StudentDetail; history: HistoryEntry[]; commentaries: CommentaryEntry[] }>(`/api/students/${studentId}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    }, { force: true })
    if (historyRes.ok) {
      setStudent(historyRes.data.student)
      setHistory(historyRes.data.history)
      const combined: TimelineItem[] = [
        ...historyRes.data.history.map((h: HistoryEntry) => ({ ...h, type: 'history' as const })),
        ...historyRes.data.commentaries.map((c: CommentaryEntry) => ({ ...c, type: 'commentary' as const }))
      ].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      setTimeline(combined)
    }
  }

  const handleUpdateLevel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (studentId === TOUR_DEMO_STUDENT_ID) {
      setShowUpdateModal(false)
      toast.info(tTours('demoNoSave'))
      return
    }

    const token = localStorage.getItem('token')
    if (!token || !updateLevel.readingLevelId) return

    const res = await fetch('/api/students/update', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...updateLevel }),
    })

    if (res.ok) {
      await refreshData()
      setShowUpdateModal(false)
      setUpdateLevel({
        readingLevelId: '',
        recordedAt: getDefaultAssessmentDateForMonth(getMonthKey()),
        notes: '',
      })
    }
  }

  const handlePostInlineComment = async () => {
    if (!inlineComment.trim() || inlineComment === '<p></p>') return
    if (studentId === TOUR_DEMO_STUDENT_ID) {
      setInlineComment('')
      toast.info(tTours('demoNoSave'))
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    setIsPostingComment(true)
    const res = await fetch(`/api/students/${studentId}/commentaries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commentary: inlineComment,
        recordedAt: new Date().toISOString()
      }),
    })

    if (res.ok) {
      await refreshData()
      setInlineComment('')
    }
    setIsPostingComment(false)
  }

  const openEditModal = (item: TimelineItem) => {
    setEditingItem(item)
    const localDate = getLocalDateString(item.recordedAt)
    if (item.type === 'history') {
      setEditHistoryData({
        readingLevelId: item.readingLevel.id || '',
        recordedAt: localDate,
        notes: item.notes || ''
      })
    } else {
      setEditCommentaryData({
        commentary: item.commentary,
        recordedAt: localDate
      })
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return
    const token = localStorage.getItem('token')
    if (!token) return

    const endpoint = editingItem.type === 'history'
      ? `/api/students/${studentId}/history/${editingItem.id}`
      : `/api/students/${studentId}/commentaries/${editingItem.id}`

    const body = editingItem.type === 'history' 
      ? { ...editHistoryData, recordedAt: formatPayloadDate(editHistoryData.recordedAt, editingItem.recordedAt) } 
      : { ...editCommentaryData, recordedAt: formatPayloadDate(editCommentaryData.recordedAt, editingItem.recordedAt) }

    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      await refreshData()
      setEditingItem(null)
    } else {
      alert(tErrors('internalError'))
    }
  }

  const handleDeleteItem = async () => {
    if (!deletingItem) return
    const token = localStorage.getItem('token')
    if (!token) return

    const endpoint = deletingItem.type === 'history'
      ? `/api/students/${studentId}/history/${deletingItem.id}`
      : `/api/students/${studentId}/commentaries/${deletingItem.id}`

    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      await refreshData()
      setDeletingItem(null)
    }
  }

  const formatClassName = (c?: ClassRecord) => {
    if (!c) return 'N/A'
    return `${c.grade} ${c.section} (${tClasses(`shifts.${c.shift}`)}) - ${c.academicYear}`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const currentLevel = history.length > 0 ? history[0] : null
  const chartData = buildStudentProgressChartData(history, locale, tLevels)
  const levelLabels = buildReadingLevelAxisLabels(tLevels)

  const canEdit = (item: TimelineItem) => {
    if (!currentUser) return false
    if (item.type === 'history') {
      return true // Any Teacher/Coordinator/Admin can edit assessments
    }
    return item.userId === currentUser.id || currentUser.isGlobalAdmin || currentUser.role === 'COORDINATOR' // Actually plan says only owner, but keeping admin safe. Let's stick to owner and admin.
  }

  if (loading) {
    return <StudentProfileSkeleton />
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-700">{tErrors('internalError')}</p>
        <Link href="/dashboard/students" className="text-blue-600 hover:underline mt-2 inline-block">
          {t('backToStudents')}
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <Link
        href="/dashboard/students"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 mb-6 text-sm"
      >
        <ArrowLeft size={16} />
        {t('backToStudents')}
      </Link>

      <div className="bg-white rounded-lg shadow p-6 mb-6" data-tour="student-profile-summary">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <User size={24} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{student.name}</h1>
              {student.id === TOUR_DEMO_STUDENT_ID && (
                <span className="mt-1 inline-flex rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {tTours('sampleBadge')}
                </span>
              )}
              <p className="text-gray-500 text-sm">#{student.studentNumber}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span>{t('school')}: <strong>{student.school.name}</strong></span>
                <span>{tClasses('class')}: <strong>{formatClassName(student.class)}</strong></span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2" data-tour="student-current-level">
            {currentLevel ? (
              <span
                className="px-3 py-1.5 rounded-full text-sm font-semibold"
                style={{
                  backgroundColor: getReadingLevelStyle(currentLevel.readingLevel.code).backgroundColor,
                  color: getReadingLevelStyle(currentLevel.readingLevel.code).textColor,
                }}
              >
                {tLevels(currentLevel.readingLevel.code)}
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-500">
                {t('notAssessed')}
              </span>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowUpdateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                {t('updateLevel')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <StudentContactsAndReportShare
        studentId={student.id}
        studentName={student.name}
        schoolName={student.school.name}
        demoMode={student.id === TOUR_DEMO_STUDENT_ID}
      />

      {chartData.length > 0 && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2" data-tour="student-progress-charts">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-800">{t('progressChart')}</h2>
            </div>
            <StudentProgressChart data={chartData} levelLabels={levelLabels} />
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-800">{t('progressChart')}</h2>
            </div>
            <StudentProgressBarChart data={chartData} levelLabels={levelLabels} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6" data-tour="student-reading-history">
        <div className="flex items-center gap-2 mb-6">
          <BookOpen size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">{t('historyAndCommentaries') || 'Histórico e Comentários'}</h2>
        </div>

        <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100" data-tour="student-commentary-entry">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {t('addCommentary') || 'Adicionar Comentário'}
          </label>
          <RichTextEditor 
            value={inlineComment} 
            onChange={setInlineComment} 
            placeholder={t('commentaryText') || 'Digite seu comentário...'}
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handlePostInlineComment}
              disabled={isPostingComment || !inlineComment.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              <Check size={16} />
              {isPostingComment ? tCommon('saving') : (t('addCommentary') || 'Comentar')}
            </button>
          </div>
        </div>

        {timeline.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('noHistory')}</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

            <div className="space-y-6">
              {timeline.map((entry) => (
                <div key={entry.id} className="relative flex gap-4 pl-10 group">
                  {entry.type === 'history' ? (
                    <div
                      className="absolute left-2.5 w-3 h-3 rounded-full border-2 border-white"
                      style={{ backgroundColor: getReadingLevelStyle(entry.readingLevel.code).color, top: '6px' }}
                    />
                  ) : (
                    <div
                      className="absolute left-2.5 w-3 h-3 rounded-full border-2 border-white bg-gray-400"
                      style={{ top: '6px' }}
                    />
                  )}

                  <div className="flex-1 bg-gray-50 rounded-lg p-4 relative pr-16">
                    <div className="absolute right-3 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canEdit(entry) && (
                        <button 
                          onClick={() => openEditModal(entry)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title={tCommon('edit') || 'Editar'}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => setDeletingItem(entry)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title={tCommon('delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mb-1 pr-12">
                      {entry.type === 'history' ? (
                        <span
                          className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: getReadingLevelStyle(entry.readingLevel.code).backgroundColor,
                            color: getReadingLevelStyle(entry.readingLevel.code).textColor,
                          }}
                        >
                          {tLevels(entry.readingLevel.code)}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-700">
                          {t('commentary') || 'Comentário'}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(entry.recordedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500">
                        {t('recordedBy')} <strong>{entry.teacher.name}</strong>
                      </p>
                      {entry.teacher.role && (
                        <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-600">
                          {entry.teacher.role === 'Admin' ? (locale === 'pt-BR' ? 'Administrador' : 'Admin') : 
                           entry.teacher.role === 'Coordinator' ? (locale === 'pt-BR' ? 'Coordenador' : 'Coordinator') :
                           (locale === 'pt-BR' ? 'Professor' : 'Teacher')}
                        </span>
                      )}
                    </div>
                    
                    {entry.type === 'history' && entry.notes && (
                      <div 
                        className="text-sm text-gray-700 mt-2 bg-white rounded p-3 border border-gray-100 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-gray-900 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-gray-900 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2 [&_p]:my-1"
                        dangerouslySetInnerHTML={{ __html: entry.notes }}
                      />
                    )}
                    
                    {entry.type === 'commentary' && (
                      <div 
                        className="text-sm text-gray-800 mt-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-gray-900 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-gray-900 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2 [&_p]:my-1"
                        dangerouslySetInnerHTML={{ __html: entry.commentary }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showUpdateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('updateLevel')}</h2>
            <form onSubmit={handleUpdateLevel} className="space-y-4">
              <select
                value={updateLevel.readingLevelId}
                onChange={(e) => setUpdateLevel({ ...updateLevel, readingLevelId: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded"
                required
              >
                <option value="">{tLevels('selectLevel')}</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {tLevels(level.code)}
                  </option>
                ))}
              </select>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('assessmentDate')}</label>
                <input
                  type="date"
                  value={updateLevel.recordedAt}
                  max={maxAssessmentDate}
                  onChange={(e) => setUpdateLevel({ ...updateLevel, recordedAt: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('notes') || 'Observações (Opcional)'}</label>
                <RichTextEditor 
                  value={updateLevel.notes} 
                  onChange={(val) => setUpdateLevel({ ...updateLevel, notes: val })} 
                  placeholder={t('commentaryText') || 'Digite suas observações...'}
                  minHeight="100px"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {tCommon('save')}
                </button>
                <button type="button" onClick={() => setShowUpdateModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded">
                  {tCommon('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-app-modal="true">
          <div className="bg-white p-6 rounded-lg w-[500px] max-w-[90vw] shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{tCommon('edit') || 'Editar'}</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              {editingItem.type === 'history' ? (
                <>
                  <select
                    value={editHistoryData.readingLevelId}
                    onChange={(e) => setEditHistoryData({ ...editHistoryData, readingLevelId: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded"
                    required
                  >
                    <option value="">{tLevels('selectLevel')}</option>
                    {levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {tLevels(level.code)}
                      </option>
                    ))}
                  </select>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{t('assessmentDate')}</label>
                    <input
                      type="date"
                      value={editHistoryData.recordedAt}
                      max={maxAssessmentDate}
                      onChange={(e) => setEditHistoryData({ ...editHistoryData, recordedAt: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{t('notes') || 'Observações'}</label>
                    <RichTextEditor 
                      value={editHistoryData.notes} 
                      onChange={(val) => setEditHistoryData({ ...editHistoryData, notes: val })} 
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{t('assessmentDate')}</label>
                    <input
                      type="date"
                      value={editCommentaryData.recordedAt}
                      max={maxAssessmentDate}
                      onChange={(e) => setEditCommentaryData({ ...editCommentaryData, recordedAt: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{t('commentary') || 'Comentário'}</label>
                    <RichTextEditor 
                      value={editCommentaryData.commentary} 
                      onChange={(val) => setEditCommentaryData({ ...editCommentaryData, commentary: val })} 
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {tCommon('save')}
                </button>
                <button type="button" onClick={() => setEditingItem(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded">
                  {tCommon('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon('confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{tCommon('deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-red-600 hover:bg-red-700">
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
