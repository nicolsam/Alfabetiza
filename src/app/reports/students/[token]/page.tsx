import { getTranslations, getLocale } from 'next-intl/server'
import { connection } from 'next/server'
import { BookOpen, CalendarDays, School, TrendingUp, UserRound, BarChart2 } from 'lucide-react'
import { getStudentParentReportByToken } from '@/lib/student-parent-reports'
import { getReadingLevelStyle } from '@/lib/reading-levels'
import { buildReadingLevelAxisLabels, buildStudentProgressChartData } from '@/lib/student-progress-chart'
import StudentProgressChart from '@/components/dashboard/StudentProgressChart'
import StudentProgressBarChart from '@/components/dashboard/StudentProgressBarChart'

type ReportPageProps = {
  params: Promise<{ token: string }>
}

function formatClassName(
  classRecord: { grade: string; section: string; shift: string; academicYear: number },
  shiftLabel: string
): string {
  return `${classRecord.grade} ${classRecord.section} (${shiftLabel}) - ${classRecord.academicYear}`
}

function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatMonth(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function StudentParentReportPage({ params }: ReportPageProps) {
  await connection()
  const { token } = await params
  const locale = await getLocale()
  const t = await getTranslations('reports')
  const tLevels = await getTranslations('levels')
  const tClasses = await getTranslations('classes')
  const report = await getStudentParentReportByToken(token)

  if (!report) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <section className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <BookOpen className="mx-auto size-10 text-gray-400" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{t('unavailableTitle')}</h1>
          <p className="mt-2 text-gray-600">{t('unavailableDescription')}</p>
        </section>
      </main>
    )
  }

  const currentLevel = report.history[0]?.readingLevel
  const currentLevelStyle = getReadingLevelStyle(currentLevel?.code)
  const shiftLabel = tClasses(`shifts.${report.student.class.shift}`)
  const chartData = buildStudentProgressChartData(report.history, locale, tLevels)
  const levelLabels = buildReadingLevelAxisLabels(tLevels)

  const timeline = [
    ...report.history.map((h) => ({ ...h, type: 'history' as const })),
    ...report.commentaries.map((c) => ({ ...c, type: 'commentary' as const }))
  ].sort((a, b) => {
    const rightDate = b.type === 'history' ? b.referenceMonth : b.recordedAt
    const leftDate = a.type === 'history' ? a.referenceMonth : a.recordedAt
    return new Date(rightDate).getTime() - new Date(leftDate).getTime()
  })

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <article className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 bg-white p-6">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">{t('eyebrow')}</p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-950">{report.student.name}</h1>
              <p className="mt-1 text-sm text-gray-500">#{report.student.studentNumber}</p>
            </div>
            <span
              className="inline-flex w-fit rounded-full px-3 py-1.5 text-sm font-semibold"
              style={{
                backgroundColor: currentLevelStyle.backgroundColor,
                color: currentLevelStyle.textColor,
              }}
            >
              {currentLevel ? tLevels(currentLevel.code) : t('notAssessed')}
            </span>
          </div>
          <div className="mt-5 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <School className="size-4 text-gray-400" />
              <span>{report.student.school.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <UserRound className="size-4 text-gray-400" />
              <span>{formatClassName(report.student.class, shiftLabel)}</span>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <CalendarDays className="size-4 text-gray-400" />
              <span>{t('expiresAt', { date: formatDate(report.expiresAt, locale) })}</span>
            </div>
          </div>
        </header>

        {chartData.length > 0 && (
          <div className="border-b border-gray-200 p-6 grid gap-6 lg:grid-cols-2 bg-gray-50/50">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="size-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">{t('progressChart')}</h2>
              </div>
              <StudentProgressChart data={chartData} levelLabels={levelLabels} />
            </section>
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <BarChart2 className="size-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">{t('progressChart')}</h2>
              </div>
              <StudentProgressBarChart data={chartData} levelLabels={levelLabels} />
            </section>
          </div>
        )}

        <section className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <BookOpen className="size-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">{t('historyTitle')}</h2>
          </div>

          {timeline.length === 0 ? (
            <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-gray-600">
              {t('noHistory')}
            </p>
          ) : (
            <div className="space-y-4">
              {timeline.map((entry, index) => {
                const style = entry.type === 'history' ? getReadingLevelStyle(entry.readingLevel.code) : null
                return (
                  <section key={entry.id} className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      {entry.type === 'history' ? (
                        <span
                          className="inline-flex w-fit rounded px-2 py-1 text-xs font-semibold"
                          style={{ backgroundColor: style!.backgroundColor, color: style!.textColor }}
                        >
                          {tLevels(entry.readingLevel.code)}
                        </span>
                      ) : (
                        <span className="inline-flex w-fit rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
                          {locale === 'pt-BR' ? 'Comentário' : 'Commentary'}
                        </span>
                      )}
                      <span className="text-sm text-gray-500">
                        {entry.type === 'history'
                          ? formatMonth(entry.referenceMonth, locale)
                          : formatDate(entry.recordedAt, locale)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-sm text-gray-500">
                        {t('recordedBy')} <strong>{entry.teacher.name}</strong>
                      </p>
                      {entry.teacher.role && (
                        <span className="inline-flex rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-600">
                          {entry.teacher.role === 'Admin' ? (locale === 'pt-BR' ? 'Administrador' : 'Admin') : 
                           entry.teacher.role === 'Coordinator' ? (locale === 'pt-BR' ? 'Coordenador' : 'Coordinator') :
                           (locale === 'pt-BR' ? 'Professor' : 'Teacher')}
                        </span>
                      )}
                    </div>
                    {entry.type === 'history' && entry.notes && (
                      <div 
                        className="mt-3 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-gray-900 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-gray-900 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2 [&_p]:my-1"
                        dangerouslySetInnerHTML={{ __html: entry.notes }}
                      />
                    )}
                    {entry.type === 'commentary' && (
                      <div 
                        className="mt-3 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-gray-900 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-gray-900 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2 [&_p]:my-1"
                        dangerouslySetInnerHTML={{ __html: entry.commentary }}
                      />
                    )}
                    {index === 0 && entry.type === 'history' && (
                      <span className="mt-3 inline-flex rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                        {t('currentLevel')}
                      </span>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </section>
      </article>
    </main>
  )
}
