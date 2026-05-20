'use client'

import UserManagementPage from '@/components/users/UserManagementPage'
import { canManageTeachers } from '@/lib/client-auth'

export default function TeachersPage() {
  return (
    <UserManagementPage
      role="TEACHER"
      messages="teachers"
      searchTestId="teachers-search"
      canAccess={canManageTeachers}
      canManage={canManageTeachers}
    />
  )
}
