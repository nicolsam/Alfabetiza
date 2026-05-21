import {
  TOUR_DEMO_MODE_EVENT,
  TOUR_DEMO_STORAGE_KEY,
  TOUR_DEMO_STUDENT_ID,
  type ProductTourId,
  type TourStorage,
} from '@/lib/product-tours'

export { TOUR_DEMO_STUDENT_ID }

export const TOUR_DEMO_CLASS = {
  id: 'tour-demo-class',
  grade: '2º Ano',
  section: 'A',
  shift: 'Morning',
  academicYear: 2026,
  schoolId: 'tour-demo-school',
}

export const TOUR_DEMO_SCHOOL = {
  id: 'tour-demo-school',
  name: 'Escola Exemplo',
}

export const TOUR_DEMO_STUDENT = {
  id: TOUR_DEMO_STUDENT_ID,
  name: 'Aluno Exemplo',
  studentNumber: '0001',
  schoolId: TOUR_DEMO_SCHOOL.id,
  classId: TOUR_DEMO_CLASS.id,
  class: TOUR_DEMO_CLASS,
  school: TOUR_DEMO_SCHOOL,
  monthlyUpdateStatus: 'missing' as const,
  monthStatus: 'current' as const,
  latestAssessmentDate: '2026-04-18T12:00:00.000Z',
  readingHistory: [
    {
      id: 'tour-demo-assessment-current',
      recordedAt: '2026-04-18T12:00:00.000Z',
      createdAt: '2026-04-18T12:00:00.000Z',
      notes: '<p>Reconhece palavras frequentes e precisa praticar fluencia em frases curtas.</p>',
      userId: 'tour-demo-teacher',
      teacher: { name: 'Professora Exemplo', role: 'Teacher' },
      readingLevel: {
        id: 'tour-demo-level-rw',
        code: 'RW',
        name: 'Reads Words',
        order: 4,
      },
    },
    {
      id: 'tour-demo-assessment-previous',
      recordedAt: '2026-03-14T12:00:00.000Z',
      createdAt: '2026-03-14T12:00:00.000Z',
      notes: '<p>Identifica silabas com apoio visual.</p>',
      userId: 'tour-demo-teacher',
      teacher: { name: 'Professora Exemplo', role: 'Teacher' },
      readingLevel: {
        id: 'tour-demo-level-so',
        code: 'SO',
        name: 'Syllables Only',
        order: 3,
      },
    },
  ],
}

export const TOUR_DEMO_COMMENTARIES = [
  {
    id: 'tour-demo-commentary',
    recordedAt: '2026-04-21T12:00:00.000Z',
    commentary: '<p>Familia orientada a praticar leitura compartilhada por 10 minutos ao dia.</p>',
    userId: 'tour-demo-teacher',
    teacher: { name: 'Professora Exemplo', role: 'Teacher' },
  },
]

export const TOUR_DEMO_CONTACTS = [
  {
    id: 'tour-demo-contact',
    name: 'Responsavel Exemplo',
    relationship: 'GUARDIAN',
    phone: '(85) 99999-0000',
    whatsappPhone: '5585999990000',
    isPrimary: true,
  },
]

export const TOUR_DEMO_REPORT = {
  reportLink: {
    id: 'tour-demo-report-link',
    expiresAt: '2026-06-20T12:00:00.000Z',
    url: 'https://alfabetiza.example/reports/students/exemplo',
  },
  shareText: 'Acompanhe o relatorio de leitura do Aluno Exemplo.',
}

export const TOUR_DEMO_READING_LEVELS = [
  { id: 'tour-demo-level-dni', code: 'DNI', name: 'Does Not Identify', order: 1 },
  { id: 'tour-demo-level-lo', code: 'LO', name: 'Letters Only', order: 2 },
  { id: 'tour-demo-level-so', code: 'SO', name: 'Syllables Only', order: 3 },
  { id: 'tour-demo-level-rw', code: 'RW', name: 'Reads Words', order: 4 },
  { id: 'tour-demo-level-rs', code: 'RS', name: 'Reads Sentences', order: 5 },
  { id: 'tour-demo-level-rts', code: 'RTS', name: 'Reads Text Syllabically', order: 6 },
  { id: 'tour-demo-level-rtf', code: 'RTF', name: 'Reads Text Fluently', order: 7 },
]

export const TOUR_DEMO_DASHBOARD_STATS = {
  totalStudents: 3,
  distribution: [
    { level: 'SO', name: 'Syllables Only', count: 1, percentage: 33 },
    { level: 'RW', name: 'Reads Words', count: 1, percentage: 33 },
    { level: 'RS', name: 'Reads Sentences', count: 1, percentage: 34 },
  ],
  needAttention: [
    {
      id: TOUR_DEMO_STUDENT_ID,
      name: TOUR_DEMO_STUDENT.name,
      studentNumber: TOUR_DEMO_STUDENT.studentNumber,
      schoolName: TOUR_DEMO_SCHOOL.name,
      level: 'Reads Words',
      levelCode: 'RW',
      classId: TOUR_DEMO_CLASS.id,
    },
  ],
  mostCommonLevel: 'RW',
  improvedCount: 1,
  improved: [
    {
      id: 'tour-demo-improved-student',
      name: 'Aluno em Evolucao',
      studentNumber: '0002',
      schoolName: TOUR_DEMO_SCHOOL.name,
      level: 'Reads Sentences',
      levelCode: 'RS',
      classId: TOUR_DEMO_CLASS.id,
    },
  ],
  monthlyUpdates: {
    month: '05/2026',
    monthStatus: 'current' as const,
    academicYear: 2026,
    totalStudents: 3,
    updatedCount: 1,
    missingCount: 2,
    missingStudents: [
      {
        id: TOUR_DEMO_STUDENT_ID,
        name: TOUR_DEMO_STUDENT.name,
        studentNumber: TOUR_DEMO_STUDENT.studentNumber,
        schoolName: TOUR_DEMO_SCHOOL.name,
        level: 'Reads Words',
        levelCode: 'RW',
        classId: TOUR_DEMO_CLASS.id,
        latestAssessmentDate: TOUR_DEMO_STUDENT.latestAssessmentDate,
      },
    ],
  },
}

export function notifyTourDemoModeChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TOUR_DEMO_MODE_EVENT))
}

export function activateTourDemo(tourId: ProductTourId, storage?: TourStorage | null): void {
  storage?.setItem(TOUR_DEMO_STORAGE_KEY, tourId)
  notifyTourDemoModeChanged()
}

export function deactivateTourDemo(storage?: TourStorage | null): void {
  storage?.removeItem(TOUR_DEMO_STORAGE_KEY)
  notifyTourDemoModeChanged()
}
