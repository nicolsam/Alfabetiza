'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  formatBrazilPhoneInput,
  STUDENT_CONTACT_RELATIONSHIPS,
  type StudentContactRelationship,
} from '@/lib/student-contacts'
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

type ClassRecord = {
  id: string
  grade: string
  section: string
  shift: string
  academicYear: number
  schoolId: string
}

export type StudentRegistrationContact = {
  name: string
  relationship: StudentContactRelationship
  phone: string
  isPrimary: boolean
}

export type StudentRegistrationPayload = {
  name: string
  studentNumber: string
  classId: string
  contacts: StudentRegistrationContact[]
}

type ContactDraft = {
  name: string
  relationship: '' | StudentContactRelationship
  phone: string
  isPrimary: boolean
}

type Props = {
  classes: ClassRecord[]
  formatClassName: (classRecord?: ClassRecord) => string
  onCancel: () => void
  onSubmit: (payload: StudentRegistrationPayload) => Promise<string | null>
}

const emptyContactDraft: ContactDraft = {
  name: '',
  relationship: '',
  phone: '',
  isPrimary: false,
}

export default function StudentRegistrationModal({ classes, formatClassName, onCancel, onSubmit }: Props) {
  const t = useTranslations('students')
  const tClasses = useTranslations('classes')
  const tCommon = useTranslations('common')

  const [step, setStep] = useState(1)
  const [student, setStudent] = useState({ name: '', studentNumber: '', classId: '' })
  const [contacts, setContacts] = useState<StudentRegistrationContact[]>([])
  const [contactDraft, setContactDraft] = useState<ContactDraft>(emptyContactDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedClass = classes.find((classRecord) => classRecord.id === student.classId)

  const getRelationshipLabel = (relationship: StudentContactRelationship) => t(`relationships.${relationship}`)

  const addContact = () => {
    const contact = validateContactDraft(contactDraft)
    if (!contact) return

    setContacts(addContactWithPrimaryFallback(contacts, contact))
    setContactDraft(emptyContactDraft)
    setError('')
  }

  const removeContact = (indexToRemove: number) => {
    const nextContacts = contacts.filter((_, index) => index !== indexToRemove)
    if (nextContacts.length > 0 && !nextContacts.some((contact) => contact.isPrimary)) {
      nextContacts[0] = { ...nextContacts[0], isPrimary: true }
    }
    setContacts(nextContacts)
  }

  const goToContacts = () => {
    if (!student.classId || !student.name.trim() || !student.studentNumber.trim()) {
      setError(t('missingStudentFields'))
      return
    }

    setError('')
    setStep(2)
  }

  const goToReview = () => {
    const finalizedContacts = finalizeContacts()
    if (!finalizedContacts) return

    setContacts(finalizedContacts)
    setContactDraft(emptyContactDraft)
    setError('')
    setStep(3)
  }

  const saveStudent = async () => {
    setSaving(true)
    const submitError = await onSubmit({
      name: student.name.trim(),
      studentNumber: student.studentNumber.trim(),
      classId: student.classId,
      contacts,
    })
    setSaving(false)

    if (submitError) setError(submitError)
  }

  const validateContactDraft = (draft: ContactDraft): StudentRegistrationContact | null => {
    if (!draft.name.trim() || !draft.phone.trim() || !draft.relationship) {
      setError(t('missingContactFields'))
      return null
    }

    return {
      name: draft.name.trim(),
      relationship: draft.relationship,
      phone: draft.phone.trim(),
      isPrimary: draft.isPrimary,
    }
  }

  const finalizeContacts = () => {
    if (!hasContactDraftValue(contactDraft)) return contacts

    const contact = validateContactDraft(contactDraft)
    if (!contact) return null
    return addContactWithPrimaryFallback(contacts, contact)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" data-app-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{t('add')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('registrationStep', { step, total: 3 })}</p>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map((stepNumber) => (
              <span
                key={stepNumber}
                className={`h-2 w-8 rounded-full ${stepNumber <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        </div>

        {error && <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</div>}

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{tClasses('selectClass')}</Label>
              <Select value={student.classId} onValueChange={(classId) => setStudent({ ...student, classId })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tClasses('selectClass')} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((classRecord) => (
                    <SelectItem key={classRecord.id} value={classRecord.id}>
                      {formatClassName(classRecord)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              type="text"
              placeholder={t('name')}
              value={student.name}
              onChange={(event) => setStudent({ ...student, name: event.target.value })}
            />
            <Input
              type="text"
              placeholder={t('studentNumber')}
              value={student.studentNumber}
              onChange={(event) => setStudent({ ...student, studentNumber: event.target.value })}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {contacts.length === 0 ? (
              <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                {t('contactsOptional')}
              </p>
            ) : (
              <ContactList contacts={contacts} getRelationshipLabel={getRelationshipLabel} onRemove={removeContact} />
            )}

            <div className="rounded-md border border-gray-200 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={contactDraft.name}
                  onChange={(event) => setContactDraft({ ...contactDraft, name: event.target.value })}
                  placeholder={t('contactName')}
                />
                <Select
                  value={contactDraft.relationship}
                  onValueChange={(relationship) => setContactDraft({
                    ...contactDraft,
                    relationship: relationship as StudentContactRelationship,
                  })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('relationship')} />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_CONTACT_RELATIONSHIPS.map((relationship) => (
                      <SelectItem key={relationship} value={relationship}>
                        {getRelationshipLabel(relationship)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="tel"
                inputMode="numeric"
                value={contactDraft.phone}
                onChange={(event) => setContactDraft({ ...contactDraft, phone: formatBrazilPhoneInput(event.target.value) })}
                placeholder={t('contactPhonePlaceholder')}
                className="mt-3"
              />
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={contactDraft.isPrimary}
                  onChange={(event) => setContactDraft({ ...contactDraft, isPrimary: event.target.checked })}
                />
                {t('primaryContact')}
              </label>
              <Button type="button" variant="outline" onClick={addContact} className="mt-3">
                <Plus className="size-4" />
                {t('addContact')}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <section className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-900">{student.name}</h3>
              <p className="mt-1 text-sm text-gray-600">#{student.studentNumber}</p>
              <p className="mt-1 text-sm text-gray-600">{formatClassName(selectedClass)}</p>
            </section>

            {contacts.length === 0 ? (
              <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                {t('noContacts')}
              </p>
            ) : (
              <ContactList contacts={contacts} getRelationshipLabel={getRelationshipLabel} onRemove={removeContact} />
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
          {step > 1 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              {tCommon('back')}
            </Button>
          )}
          {step === 1 && (
            <Button type="button" onClick={goToContacts}>
              {tCommon('next')}
            </Button>
          )}
          {step === 2 && (
            <Button type="button" onClick={goToReview}>
              {tCommon('next')}
            </Button>
          )}
          {step === 3 && (
            <Button type="button" onClick={saveStudent} disabled={saving}>
              {saving ? tCommon('loading') : tCommon('save')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ContactList({
  contacts,
  getRelationshipLabel,
  onRemove,
}: {
  contacts: StudentRegistrationContact[]
  getRelationshipLabel: (relationship: StudentContactRelationship) => string
  onRemove: (index: number) => void
}) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')

  return (
    <div className="space-y-2">
      {contacts.map((contact, index) => (
        <div key={`${contact.name}-${contact.phone}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{contact.name}</p>
            <p className="truncate text-sm text-gray-500">
              {[getRelationshipLabel(contact.relationship), contact.phone].join(' - ')}
              {contact.isPrimary ? ` - ${t('primaryContact')}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
            aria-label={tCommon('delete')}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function hasContactDraftValue(draft: ContactDraft): boolean {
  return Boolean(draft.name.trim() || draft.phone.trim() || draft.relationship)
}

function addContactWithPrimaryFallback(
  contacts: StudentRegistrationContact[],
  contact: StudentRegistrationContact
): StudentRegistrationContact[] {
  const shouldMakePrimary = contact.isPrimary || contacts.length === 0
  const nextContacts = shouldMakePrimary
    ? contacts.map((existingContact) => ({ ...existingContact, isPrimary: false }))
    : contacts

  return [...nextContacts, { ...contact, isPrimary: shouldMakePrimary }]
}
