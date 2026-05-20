'use client'

import UserManagementPage from '@/components/users/UserManagementPage'
import { canViewCoordinators } from '@/lib/client-auth'

export default function CoordinatorsPage() {
  return (
    <UserManagementPage
      role="COORDINATOR"
      messages="coordinators"
      searchTestId="coordinators-search"
      canAccess={canViewCoordinators}
      canManage={(user) => Boolean(user?.isGlobalAdmin)}
    />
  )
}
