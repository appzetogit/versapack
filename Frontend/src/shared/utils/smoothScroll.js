import Lenis from 'lenis'

const MOBILE_BREAKPOINT = 768

function shouldReduceMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function shouldUseNativeScroll() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }

  // Keep mobile/touch devices on native scrolling for stability.
  return window.matchMedia('(pointer: coarse)').matches
}

export function setupSmoothScroll({ disabled = false } = {}) {
  if (disabled || typeof window === 'undefined') return () => {}

  if (shouldReduceMotion()) return () => {}
  if (shouldUseNativeScroll()) return () => {}

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT

  const lenis = new Lenis({
    duration: isMobile ? 0.9 : 1.15,
    smoothWheel: true,
    syncTouch: false,
    wheelMultiplier: isMobile ? 0.8 : 1,
    touchMultiplier: 1,
    allowNestedScroll: true,
    autoRaf: false,
  })

  let frameId = null

  const raf = (time) => {
    lenis.raf(time)
    frameId = window.requestAnimationFrame(raf)
  }

  frameId = window.requestAnimationFrame(raf)

  const handleVisibilityChange = () => {
    if (document.hidden) {
      lenis.stop()
      return
    }

    lenis.start()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    if (frameId) window.cancelAnimationFrame(frameId)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    lenis.destroy()
  }
}
