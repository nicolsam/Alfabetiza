'use client'

import { useEffect, useState } from 'react'

import {
  getActiveTourDemo,
  TOUR_DEMO_MODE_EVENT,
  type ProductTourId,
} from '@/lib/product-tours'

export function useTourDemoMode(): ProductTourId | null {
  const [activeDemoTour, setActiveDemoTour] = useState<ProductTourId | null>(null)

  useEffect(() => {
    const syncDemoTour = () => {
      setActiveDemoTour(getActiveTourDemo(window.sessionStorage))
    }

    syncDemoTour()
    window.addEventListener(TOUR_DEMO_MODE_EVENT, syncDemoTour)
    window.addEventListener('storage', syncDemoTour)

    return () => {
      window.removeEventListener(TOUR_DEMO_MODE_EVENT, syncDemoTour)
      window.removeEventListener('storage', syncDemoTour)
    }
  }, [])

  return activeDemoTour
}
