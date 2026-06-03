// Zentrale Ambient-Augmentation für window.gtag.
// Vorher in TrackingHooks.tsx versteckt; Task 2 räumt dort auf.

declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: Record<string, unknown>) => void
  }
}

export {}
