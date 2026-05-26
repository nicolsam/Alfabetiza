'use client'

import { useEffect, useState } from 'react'
import { Copy, Edit, MessageCircle, Phone, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { buildWhatsappShareUrl } from '@/lib/whatsapp'
import {
  formatBrazilPhoneInput,
  STUDENT_CONTACT_RELATIONSHIPS,
  type StudentContactRelationship,
} from '@/lib/student-contacts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TOUR_DEMO_CONTACTS,
  TOUR_DEMO_REPORT,
} from '@/lib/product-tour-demo-data'

type StudentContact = {
  id: string
  name: string
  relationship: string | null
  phone: string
  whatsappPhone: string
  isPrimary: boolean
}

type ReportLinkResponse = {
  reportLink: { id: string; expiresAt: string; url: string }
  shareText: string
}

type ContactForm = {
  name: string
  relationship: '' | StudentContactRelationship
  phone: string
  isPrimary: boolean
}

type Props = {
  studentId: string
  studentName: string
  schoolName: string
  demoMode?: boolean
}

const emptyContactForm: ContactForm = {
  name: '',
  relationship: '',
  phone: '',
  isPrimary: false,
}

export default function StudentContactsAndReportShare({ studentId, demoMode = false }: Props) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  const tTours = useTranslations('tours')
  const [contacts, setContacts] = useState<StudentContact[]>([])
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContactForm)
  const [selectedContactId, setSelectedContactId] = useState('')
  const [report, setReport] = useState<ReportLinkResponse | null>(null)
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [savingContact, setSavingContact] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [editingContactId, setEditingContactId] = useState<string | null>(null)

  useEffect(() => {
    if (demoMode) {
      queueMicrotask(() => {
        setContacts(TOUR_DEMO_CONTACTS)
        setSelectedContactId(TOUR_DEMO_CONTACTS[0]?.id || '')
        setLoadingContacts(false)
      })
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    const fetchContacts = async () => {
      const res = await fetch(`/api/students/${studentId}/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json() as { contacts: StudentContact[] }
        setContacts(data.contacts)
        setSelectedContactId(data.contacts.find((contact) => contact.isPrimary)?.id || '')
      }
      setLoadingContacts(false)
    }

    fetchContacts()
  }, [studentId, demoMode])

  const selectedContact = contacts.find((contact) => contact.id === selectedContactId) || null
  const getRelationshipLabel = (relationship: string | null) => (
    relationship ? t(`relationships.${relationship}`) : ''
  )

  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault()
    if (demoMode) {
      setShowContactModal(false)
      toast.info(tTours('demoNoSave'))
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    setSavingContact(true)
    const url = editingContactId 
      ? `/api/students/${studentId}/contacts/${editingContactId}`
      : `/api/students/${studentId}/contacts`
      
    const res = await fetch(url, {
      method: editingContactId ? 'PUT' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(contactForm),
    })
    setSavingContact(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      toast.error(data.error || t('contactError'))
      return
    }

    const data = await res.json() as { contact: StudentContact }
    const nextContacts = data.contact.isPrimary
      ? contacts.map((contact) => ({ ...contact, isPrimary: false }))
      : contacts
      
    const filteredContacts = nextContacts.filter(c => c.id !== data.contact.id)
    setContacts([...filteredContacts, data.contact].sort(sortContacts))
    
    setSelectedContactId(data.contact.id)
    setContactForm(emptyContactForm)
    setEditingContactId(null)
    setShowContactModal(false)
    toast.success(t('contactCreated'))
  }
  
  const openEditModal = (contact: StudentContact) => {
    setContactForm({
      name: contact.name,
      relationship: (contact.relationship as StudentContactRelationship) || '',
      phone: contact.phone,
      isPrimary: contact.isPrimary,
    })
    setEditingContactId(contact.id)
    setShowContactModal(true)
  }
  
  const openAddModal = () => {
    setContactForm(emptyContactForm)
    setEditingContactId(null)
    setShowContactModal(true)
  }

  const deleteContact = async (contactId: string) => {
    if (demoMode) {
      toast.info(tTours('demoNoSave'))
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    const res = await fetch(`/api/students/${studentId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      toast.error(t('contactError'))
      return
    }

    const nextContacts = contacts.filter((contact) => contact.id !== contactId)
    setContacts(nextContacts)
    if (selectedContactId === contactId) setSelectedContactId(nextContacts[0]?.id || '')
    toast.success(t('contactDeleted'))
  }

  const generateReport = async () => {
    if (demoMode) {
      setReport(TOUR_DEMO_REPORT)
      toast.info(tTours('demoNoSave'))
      return TOUR_DEMO_REPORT
    }

    const token = localStorage.getItem('token')
    if (!token) return null

    setGeneratingReport(true)
    const res = await fetch(`/api/students/${studentId}/report-link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    setGeneratingReport(false)

    if (!res.ok) {
      toast.error(t('reportError'))
      return null
    }

    const data = await res.json() as ReportLinkResponse
    setReport(data)
    toast.success(t('reportLinkReady'))
    return data
  }

  const copyReportLink = async () => {
    const currentReport = report || await generateReport()
    if (!currentReport) return
    await navigator.clipboard.writeText(currentReport.reportLink.url)
    toast.success(t('copiedReportLink'))
  }

  const openWhatsapp = async () => {
    const currentReport = report || await generateReport()
    if (!currentReport) return
    const url = buildWhatsappShareUrl(currentReport.shareText, selectedContact?.whatsappPhone)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="mb-6 grid gap-6 lg:grid-cols-[6fr_4fr]">
      <div className="rounded-lg bg-white p-6 shadow" data-tour="student-parent-contacts">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Phone className="size-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">{t('parentContacts')}</h2>
          </div>
          <div className="flex items-center gap-3">
            {loadingContacts && <span className="text-sm text-gray-500">{tCommon('loading')}</span>}
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="size-4" />
              {t('addContact')}
            </button>
          </div>
        </div>

        {contacts.length === 0 && !loadingContacts ? (
          <p className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            {t('noContacts')}
          </p>
        ) : (
          <div className="mb-4 space-y-2">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-medium text-gray-900">
                    {contact.name}
                    {contact.isPrimary && <Star className="size-4 fill-amber-400 text-amber-400" />}
                  </p>
                  <p className="truncate text-sm text-gray-500">
                    {[getRelationshipLabel(contact.relationship), contact.phone].filter(Boolean).join(' - ')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(contact)}
                    className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    aria-label={tCommon('edit')}
                  >
                    <Edit className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteContact(contact.id)}
                    className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                    aria-label={tCommon('delete')}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" data-app-modal="true">
          <div className="w-96 rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-gray-800">
              {editingContactId ? tCommon('edit') : t('addContact')}
            </h2>
            <form onSubmit={saveContact} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={contactForm.name}
                  onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })}
                  placeholder={t('contactName')}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  required
                />
                <Select
                  value={contactForm.relationship}
                  onValueChange={(relationship) => setContactForm({
                    ...contactForm,
                    relationship: relationship as StudentContactRelationship,
                  })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('relationship')} />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_CONTACT_RELATIONSHIPS.map((relationship) => (
                      <SelectItem key={relationship} value={relationship}>
                        {t(`relationships.${relationship}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input
                type="tel"
                inputMode="numeric"
                value={contactForm.phone}
                onChange={(event) => setContactForm({ ...contactForm, phone: formatBrazilPhoneInput(event.target.value) })}
                placeholder={t('contactPhonePlaceholder')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={contactForm.isPrimary}
                  onChange={(event) => setContactForm({ ...contactForm, isPrimary: event.target.checked })}
                />
                {t('primaryContact')}
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingContact}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingContact ? tCommon('loading') : tCommon('save')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow" data-tour="student-report-share">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="size-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-800">{t('reportSharing')}</h2>
        </div>

        <div className="space-y-3">
          <select
            value={selectedContactId}
            onChange={(event) => setSelectedContactId(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">{t('genericWhatsapp')}</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} - {contact.phone}
              </option>
            ))}
          </select>

          {report && (
            <div 
              onClick={copyReportLink}
              title={t('copyReportLink')}
              className="group relative cursor-pointer break-all rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 rounded-md bg-white border border-gray-200 px-2 py-1 text-gray-600 shadow-sm transition-opacity">
                <Copy className="size-3.5" />
                <span className="text-xs font-medium">{t('copyReportLink')}</span>
              </div>
              <p className="pr-24">{report.reportLink.url}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2" data-tour="student-report-actions">
            <button
              type="button"
              onClick={generateReport}
              disabled={generatingReport}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <Plus className="size-4" />
              {generatingReport ? tCommon('loading') : t('generateReportLink')}
            </button>
            <button
              type="button"
              onClick={openWhatsapp}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <MessageCircle className="size-4" />
              {t('shareOnWhatsapp')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function sortContacts(first: StudentContact, second: StudentContact): number {
  if (first.isPrimary !== second.isPrimary) return first.isPrimary ? -1 : 1
  return first.name.localeCompare(second.name)
}
