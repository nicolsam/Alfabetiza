'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BookOpen, CalendarCheck, ClipboardList, Eye, EyeOff, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const t = useTranslations('auth')
  const tErrors = useTranslations('errors')
  const tCommon = useTranslations('common')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const benefits = [
    { icon: CalendarCheck, label: t('benefitMonthly') },
    { icon: BookOpen, label: t('benefitHistory') },
    { icon: ClipboardList, label: t('benefitOrganization') },
    { icon: FileText, label: t('benefitReports') },
  ]

  useEffect(() => {
    router.prefetch('/dashboard')
  }, [router])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || tErrors('internalError'))
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.removeItem('teacher')
      router.replace('/dashboard')
    } catch {
      setError(tErrors('failedConnect'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-slate-50 text-slate-950 lg:grid-cols-2">
      <section className="flex items-center border-b border-slate-200 bg-white px-6 py-10 sm:px-10 lg:border-b-0 lg:border-r lg:px-16">
        <div className="mx-auto w-full max-w-xl space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 2xl:text-base">
              Alfabetiza
            </p>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold text-slate-950 2xl:text-5xl">
                {t('introTitle')}
              </h1>
              <p className="text-lg leading-8 text-slate-600 2xl:text-xl 2xl:leading-9">
                {t('description')}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {benefits.map(({ icon: Icon, label }) => (
              <div key={label} className="flex min-h-20 items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium leading-6 text-slate-700 2xl:text-base 2xl:leading-7">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="flex min-h-[560px] items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-md space-y-6 2xl:max-w-lg 2xl:space-y-8">
          <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm 2xl:p-10">
            <div className="mb-8 space-y-2 text-left 2xl:mb-10">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 2xl:text-base">{t('login')}</h3>
              <h2 className="text-2xl font-bold leading-8 text-slate-800 2xl:text-3xl 2xl:leading-9">{t('accessYourAccount')}</h2>
              <p className="text-lg leading-8 text-slate-600 2xl:text-xl 2xl:leading-9">{t('enterToContinueStudentsTracking')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 2xl:space-y-6">
              <div className="space-y-2 2xl:space-y-2.5">
                <Label htmlFor="email" className="2xl:text-base">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 2xl:h-12 2xl:text-base"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2 2xl:space-y-2.5">
                <Label htmlFor="password" className="2xl:text-base">{t('password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-11 2xl:h-12 2xl:pr-12 2xl:text-base"
                    autoComplete="current-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 2xl:right-2 2xl:size-9"
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              {error && <p className="text-sm font-medium text-red-600 2xl:text-base">{error}</p>}

              <Button type="submit" disabled={loading} className="h-11 w-full 2xl:h-12 2xl:text-base" aria-live="polite">
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span className="sr-only">{tCommon('loading')}</span>
                  </>
                ) : (
                  t('loginBtn')
                )}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-slate-500 2xl:text-base">{t('footer')}</p>
        </div>
      </main>
    </div>
  )
}
