import { prisma } from '@/lib/db'
import { READING_ASSESSMENT_TYPE_CODE } from '@/lib/assessments'
import { hashStudentReportToken } from '@/lib/student-report-links'

export type StudentParentReport = {
  student: {
    id: string
    name: string
    studentNumber: string
    school: { name: string; id: string }
    class: {
      grade: string
      section: string
      shift: string
      academicYear: number
    }
  }
  expiresAt: Date
  history: {
    id: string
    referenceMonth: Date
    notes: string | null
    readingLevel: { code: string; name: string; order: number }
    teacher: { name: string; role: string }
  }[]
  commentaries: {
    id: string
    recordedAt: Date
    commentary: string
    teacher: { name: string; role: string }
  }[]
}

type ReportAuthor = {
  name: string
  isGlobalAdmin: boolean
  schools: { role: string }[]
}

export async function getStudentParentReportByToken(
  token: string,
  now = new Date()
): Promise<StudentParentReport | null> {
  const tokenHash = hashStudentReportToken(token)
  const reportLink = await prisma.studentParentReportLink.findUnique({
    where: { tokenHash },
    include: {
      student: {
        include: {
          school: { select: { id: true, name: true, deletedAt: true } },
          class: {
            select: {
              grade: true,
              section: true,
              shift: true,
              academicYear: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  })

  if (!reportLink || reportLink.revokedAt || reportLink.expiresAt <= now) return null
  if (reportLink.student.deletedAt || reportLink.student.school.deletedAt || reportLink.student.class.deletedAt) return null

  await prisma.studentParentReportLink.update({
    where: { id: reportLink.id },
    data: { lastViewedAt: now },
  })

  const userSelect = { 
    name: true, 
    isGlobalAdmin: true, 
    schools: { 
      where: { schoolId: reportLink.student.school.id }, 
      select: { role: true } 
    } 
  }

  const [history, commentaries] = await Promise.all([
    prisma.studentAssessment.findMany({
      where: {
        studentId: reportLink.studentId,
        assessmentType: { code: READING_ASSESSMENT_TYPE_CODE },
      },
      orderBy: [{ referenceMonth: 'desc' }, { createdAt: 'desc' }],
      include: {
        assessmentLevel: { select: { code: true, name: true, order: true } },
        user: { select: userSelect },
      },
    }),
    prisma.studentCommentary.findMany({
      where: { studentId: reportLink.studentId },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        user: { select: userSelect },
      },
    })
  ])

  const mapTeacher = (user: ReportAuthor) => ({
    name: user.name,
    role: user.isGlobalAdmin ? 'Admin' : (user.schools?.[0]?.role === 'COORDINATOR' ? 'Coordinator' : 'Teacher')
  })

  return {
    expiresAt: reportLink.expiresAt,
    student: {
      id: reportLink.student.id,
      name: reportLink.student.name,
      studentNumber: reportLink.student.studentNumber,
      school: { id: reportLink.student.school.id, name: reportLink.student.school.name },
      class: reportLink.student.class,
    },
    history: history.map((entry) => ({
      ...entry,
      readingLevel: entry.assessmentLevel,
      teacher: mapTeacher(entry.user),
    })),
    commentaries: commentaries.map((entry) => ({ ...entry, teacher: mapTeacher(entry.user) })),
  }
}
