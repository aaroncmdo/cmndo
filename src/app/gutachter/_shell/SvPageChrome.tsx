'use client'
import { type ReactNode } from 'react'
import { useSvPageChrome } from './page-chrome-context'

/**
 * Deklarativer Weg für eine Seite, ihren Top-Bar-Titel/-Actions zu setzen.
 * Rendert nichts. Auch aus Server-Components heraus rendernbar (Client-Boundary).
 */
export function SvPageChrome({ title, actions }: { title?: string; actions?: ReactNode }) {
  useSvPageChrome({ title, actions })
  return null
}
