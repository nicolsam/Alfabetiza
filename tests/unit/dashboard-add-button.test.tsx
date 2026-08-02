import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DashboardAddButton } from '@/components/dashboard/DashboardAddButton'

describe('DashboardAddButton', () => {
  it('renders a consistent primary action with an icon and responsive width', () => {
    const markup = renderToStaticMarkup(
      <DashboardAddButton label="Add Student" aria-label="Add Student" />
    )

    expect(markup).toContain('data-slot="button"')
    expect(markup).toContain('data-variant="default"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain('w-full sm:w-auto')
    expect(markup).toContain('<svg')
    expect(markup).toContain('Add Student')
  })

  it('preserves caller classes and native button properties', () => {
    const markup = renderToStaticMarkup(
      <DashboardAddButton label="Add Class" className="custom-class" disabled />
    )

    expect(markup).toContain('custom-class')
    expect(markup).toContain('disabled=""')
  })
})
