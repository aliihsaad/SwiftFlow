'use client'

import { useSyncExternalStore } from 'react'
import { ASSISTANT_MOBILE_BREAKPOINT, isAssistantMobileWidth } from '@/lib/assistant/mobile-layout'

export function getAssistantMobileSnapshot() {
  return typeof window !== 'undefined' && isAssistantMobileWidth(window.innerWidth)
}

export function getAssistantMobileServerSnapshot() {
  return false
}

export function subscribeAssistantMobileChange(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined

  const query = window.matchMedia(`(max-width: ${ASSISTANT_MOBILE_BREAKPOINT - 1}px)`)

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange)
  } else {
    query.addListener(onChange)
  }
  window.addEventListener('resize', onChange)

  return () => {
    if (typeof query.removeEventListener === 'function') {
      query.removeEventListener('change', onChange)
    } else {
      query.removeListener(onChange)
    }
    window.removeEventListener('resize', onChange)
  }
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribeAssistantMobileChange,
    getAssistantMobileSnapshot,
    getAssistantMobileServerSnapshot,
  )
}
