'use client'

import dynamic from 'next/dynamic'
import type { GutachterFinderClientProps } from './GutachterFinderClient'

const GutachterFinderClientDynamic = dynamic<GutachterFinderClientProps>(
  () => import('./GutachterFinderClient').then(m => ({ default: m.GutachterFinderClient })),
  { ssr: false },
)

export function GutachterFinderLoader(props: GutachterFinderClientProps) {
  return <GutachterFinderClientDynamic {...props} />
}
