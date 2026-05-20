export type StoredUser = {
  id: string
  name: string
  email: string
  gender?: string | null
  isGlobalAdmin?: boolean
  schools?: { schoolId: string; schoolName?: string; role: string }[]
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null

  const storedUser = localStorage.getItem('user')
  const storedTeacher = localStorage.getItem('teacher')
  const rawUser = storedUser || storedTeacher
  if (!rawUser) return null

  try {
    const user = JSON.parse(rawUser) as StoredUser
    if (!storedUser) localStorage.setItem('user', JSON.stringify(user))
    return user
  } catch {
    return null
  }
}

export function isCoordinator(user: StoredUser | null): boolean {
  return Boolean(user?.schools?.some((school) => school.role === 'COORDINATOR'))
}

export function canManageSchools(user: StoredUser | null): boolean {
  return Boolean(user?.isGlobalAdmin)
}

export function canManageSchoolScopedRecords(user: StoredUser | null): boolean {
  return Boolean(user?.isGlobalAdmin || isCoordinator(user))
}

export function canManageTeachers(user: StoredUser | null): boolean {
  return canManageSchoolScopedRecords(user)
}

export function canViewCoordinators(user: StoredUser | null): boolean {
  return canManageSchoolScopedRecords(user)
}
