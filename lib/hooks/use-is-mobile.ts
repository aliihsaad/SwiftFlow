'use client'

import { useEffect, useState } from 'react'
import { ASSISTANT_MOBILE_BREAKPOINT, isAssistantMobileWidth } from '@/lib/assistant/mobile-layout'

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window === 'undefined' ? false : isAssistantMobileWidth(window.innerWidth)
  ))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const query = window.matchMedia(`(max-width: ${ASSISTANT_MOBILE_BREAKPOINT - 1}px)`)
    const update = () => setIsMobile(isAssistantMobileWidth(window.innerWidth))

    update()
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update)
    } else {
      query.addListener(update)
    }
    window.addEventListener('resize', update)

    return () => {
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', update)
      } else {
        query.removeListener(update)
      }
      window.removeEventListener('resize', update)
    }
  }, [])

  return isMobile
}
