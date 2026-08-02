import { Plus } from 'lucide-react'
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DashboardAddButtonProps extends Omit<ComponentProps<typeof Button>, 'children'> {
  label: string
}

export function DashboardAddButton({
  className,
  label,
  type = 'button',
  ...props
}: DashboardAddButtonProps) {
  return (
    <Button
      type={type}
      className={cn('w-full sm:w-auto', className)}
      {...props}
    >
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </Button>
  )
}
