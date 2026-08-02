'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  BookOpenCheck,
  Building2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  SchoolIcon,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import NavigationHint from '@/components/navigation/NavigationHint'
import TourLauncher from '@/components/tours/TourLauncher'
import { cachedJson, clearClientGetCache } from '@/lib/client-get-cache'
import { canManageSchools, canManageTeachers, canViewCoordinators, getStoredUser, type StoredUser } from '@/lib/client-auth'

interface School {
  id: string
  name: string
}

type SidebarAssignment = {
  schoolName: string
  role: string
}

type SidebarLinkProps = {
  href: string
  icon: LucideIcon
  label: string
  pathname: string
  dataTour?: string
  exact?: boolean
  accent?: boolean
}

function SidebarLink({ href, icon: Icon, label, pathname, dataTour, exact = false, accent = false }: SidebarLinkProps) {
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      data-tour={dataTour}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-white/10 text-white shadow-sm'
          : accent
            ? 'text-amber-300 hover:bg-white/5 hover:text-amber-200'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-400" />}
      <Icon aria-hidden="true" className={`size-4.5 ${isActive ? 'text-blue-300' : 'text-slate-400 group-hover:text-current'}`} />
      <span className="flex-1">{label}</span>
      <NavigationHint />
    </Link>
  )
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </h2>
      {children}
    </section>
  )
}

function getRoleLabelNamespace(gender: string | null | undefined): string {
  if (gender === 'FEMALE') return 'rolesFemale'
  if (gender === 'MALE') return 'rolesMale'
  return 'roles'
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('nav')
  const [selectedSchool, setSelectedSchool] = useState<string>('')
  const [schools, setSchools] = useState<School[]>([])
  const [user, setUser] = useState<StoredUser | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setMounted(true))
  }, [])

  useEffect(() => {
    if (!mounted) return

    const token = localStorage.getItem('token')
    const storedUser = getStoredUser()
    if (!storedUser || !token) {
      router.push('/login')
      return
    }
    queueMicrotask(() => setUser(storedUser))

    // Heartbeat mechanism to keep session active
    const sendHeartbeat = async () => {
      try {
        await fetch('/api/auth/heartbeat', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch (e) {
        console.error('Heartbeat failed', e)
      }
    }

    sendHeartbeat() // Send immediately on mount
    const interval = setInterval(sendHeartbeat, 2 * 60 * 1000) // Then every 2 minutes

    return () => clearInterval(interval)
  }, [router, mounted])

  useEffect(() => {
    if (!mounted) return

    const fetchSchools = async () => {
      const token = localStorage.getItem('token')
      if (!token) return

      const res = await cachedJson<{ schools?: School[] }>('/api/schools', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok && res.data.schools) {
        setSchools(res.data.schools)
        const stored = localStorage.getItem('selectedSchool')
        if (stored && res.data.schools.find((s: School) => s.id === stored)) {
          setSelectedSchool(stored)
        } else if (res.data.schools.length > 0) {
          setSelectedSchool('') // Default to "All Schools" explicitly
        }
      }
    }
    fetchSchools()
  }, [mounted])

  // Broadcast school change to other components
  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('selectedSchool', selectedSchool)
    window.dispatchEvent(new Event('schoolChanged'))
  }, [selectedSchool, mounted])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('teacher')
    localStorage.removeItem('selectedSchool')
    clearClientGetCache()
    router.push('/login')
  }

  const roleLabelNamespace = getRoleLabelNamespace(user?.gender)
  const sidebarAssignments: SidebarAssignment[] = user?.isGlobalAdmin ? [] : (user?.schools || [])
    .map((assignment) => ({
      schoolName: assignment.schoolName || schools.find((school) => school.id === assignment.schoolId)?.name || '',
      role: assignment.role,
    }))
    .filter((assignment) => assignment.schoolName)


  return (
    <div className="min-h-screen flex">
      <aside className="relative sticky top-0 flex h-screen w-72 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-white shadow-xl">
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20">
              <BookOpenCheck aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">Alfabetiza</h1>
              {user && mounted && <p className="truncate text-sm text-slate-400">{user.name}</p>}
            </div>
          </div>
          {mounted && sidebarAssignments.length > 0 && (
            <div className="mt-4 space-y-2">
              {sidebarAssignments.map((assignment) => (
                <div
                  key={`${assignment.schoolName}-${assignment.role}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2.5"
                >
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-100">
                    <SchoolIcon aria-hidden="true" className="size-3.5 shrink-0 text-slate-500" />
                    <span className="truncate">{assignment.schoolName}</span>
                  </p>
                  <p className="mt-1.5 inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                    {t(`${roleLabelNamespace}.${assignment.role}`)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <nav className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-5">
          <SidebarSection label={t('categories.overview')}>
            <SidebarLink href="/dashboard" icon={LayoutDashboard} label={t('dashboard')} pathname={pathname} dataTour="nav-dashboard" exact />
          </SidebarSection>
          <SidebarSection label={t('categories.learning')}>
            <SidebarLink href="/dashboard/students" icon={GraduationCap} label={t('students')} pathname={pathname} dataTour="nav-students" />
            <SidebarLink href="/dashboard/classes" icon={Building2} label={t('classes')} pathname={pathname} />
          </SidebarSection>
          {(canManageTeachers(user) || canViewCoordinators(user) || canManageSchools(user)) && (
            <SidebarSection label={t('categories.management')}>
          {canManageTeachers(user) && (
                <SidebarLink href="/dashboard/teachers" icon={Users} label={t('teachers')} pathname={pathname} dataTour="nav-teachers" />
          )}
          {canViewCoordinators(user) && (
                <SidebarLink href="/dashboard/coordinators" icon={ShieldCheck} label={t('coordinators')} pathname={pathname} />
          )}
          {canManageSchools(user) && (
                <SidebarLink href="/dashboard/schools" icon={SchoolIcon} label={t('schools')} pathname={pathname} />
          )}
            </SidebarSection>
          )}
          {user?.isGlobalAdmin && (
            <SidebarSection label={t('categories.system')}>
              <SidebarLink href="/dashboard/admin" icon={ShieldCheck} label={t('adminPanel')} pathname={pathname} accent />
            </SidebarSection>
          )}
        </nav>
        <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/90 p-4">
          <TourLauncher user={mounted ? user : null} />
          <LanguageSwitcher />
          <button onClick={handleLogout} className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white">
            <LogOut aria-hidden="true" className="size-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      <main className="relative z-0 flex-1 bg-slate-50 p-8">
        {children}
      </main>
    </div>
  )
}
