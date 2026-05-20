'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import NavigationHint from '@/components/navigation/NavigationHint'
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
      <aside className="w-64 bg-gray-800 text-white h-screen sticky top-0 flex flex-col flex-shrink-0">
        <div className="p-4">
          <h1 className="text-xl font-bold">Alfabetiza</h1>
          {user && mounted && <p className="text-sm text-gray-300 mt-1">{user.name}</p>}
          {mounted && sidebarAssignments.length > 0 && (
            <div className="mt-3 space-y-2">
              {sidebarAssignments.map((assignment) => (
                <div
                  key={`${assignment.schoolName}-${assignment.role}`}
                  className="rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2"
                >
                  <p className="truncate text-sm font-medium text-white">{assignment.schoolName}</p>
                  <p className="mt-1 inline-flex rounded-sm bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-100">
                    {t(`${roleLabelNamespace}.${assignment.role}`)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <nav className="mt-4 flex-1 overflow-y-auto custom-scrollbar">
          <Link
            href="/dashboard"
            className={`block px-4 py-2 hover:bg-gray-700 ${pathname === '/dashboard' ? 'bg-gray-700' : ''}`}
          >
            {t('dashboard')}
            <NavigationHint />
          </Link>
          <Link
            href="/dashboard/students"
            className={`block px-4 py-2 hover:bg-gray-700 ${pathname === '/dashboard/students' ? 'bg-gray-700' : ''}`}
          >
            {t('students')}
            <NavigationHint />
          </Link>
          <Link
            href="/dashboard/classes"
            className={`block px-4 py-2 hover:bg-gray-700 ${pathname === '/dashboard/classes' ? 'bg-gray-700' : ''}`}
          >
            {t('classes')}
            <NavigationHint />
          </Link>
          {canManageTeachers(user) && (
            <Link
              href="/dashboard/teachers"
              className={`block px-4 py-2 hover:bg-gray-700 ${pathname === '/dashboard/teachers' ? 'bg-gray-700' : ''}`}
            >
              {t('teachers')}
              <NavigationHint />
            </Link>
          )}
          {canViewCoordinators(user) && (
            <Link
              href="/dashboard/coordinators"
              className={`block px-4 py-2 hover:bg-gray-700 ${pathname === '/dashboard/coordinators' ? 'bg-gray-700' : ''}`}
            >
              {t('coordinators')}
              <NavigationHint />
            </Link>
          )}
          {canManageSchools(user) && (
            <Link
              href="/dashboard/schools"
              className={`block px-4 py-2 hover:bg-gray-700 ${pathname === '/dashboard/schools' ? 'bg-gray-700' : ''}`}
            >
              {t('schools')}
              <NavigationHint />
            </Link>
          )}
          {user?.isGlobalAdmin && (
            <Link
              href="/dashboard/admin"
              className={`block px-4 py-2 hover:bg-gray-700 text-yellow-400 ${pathname.startsWith('/dashboard/admin') ? 'bg-gray-700' : ''}`}
            >
              Admin Panel
              <NavigationHint />
            </Link>
          )}
        </nav>
        <div className="p-4 flex flex-col gap-4 border-t border-gray-700">
          <LanguageSwitcher />
          <button onClick={handleLogout} className="text-left text-sm text-gray-300 hover:text-white">
            {t('logout')}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  )
}
