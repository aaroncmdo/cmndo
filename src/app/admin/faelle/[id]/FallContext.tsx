'use client'

// AAR-162 / W2: Fallakte React-Context — zentrale Daten + Permission-Policy.
// Consumer (Tabs, Sidebar, Stammdaten-Sections) nutzen useFall() statt durch
// den 210-KB-Monolithen zu navigieren.
//
// Design-Entscheidungen:
// - Phase/Status wird aus fall.status + field-permissions abgeleitet.
// - canEdit/updateField setzen die AAR-161 Config-Libs 1:1 um.
// - refreshFall() macht router.refresh() (Server-Component lädt Daten neu).
// - Alle umfangreicheren Daten (Timeline, Nachrichten, Dokumente) bleiben
//   Props-Durchreichung in den Tab-Komponenten — Context enthält nur das
//   was überall gebraucht wird.

import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getVisibleSections, type StammdatenSection } from '@/lib/fall/phase-config'
import { canEditField, type FallakteRolle } from '@/lib/fall/field-permissions'
import { updateFallField } from './actions/stammdaten'

export type FallLike = Record<string, unknown> & {
  id: string
  fall_nummer: string | null
  status: string | null
  lead_id: string | null
  kunde_id?: string | null
  sv_id?: string | null
  kundenbetreuer_id?: string | null
  service_typ?: string | null
  abgeschlossen_am?: string | null
}

export type LeadLike = Record<string, unknown> & {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
} | null

type FallContextValue = {
  fall: FallLike
  lead: LeadLike
  phase: string
  visibleSections: StammdatenSection[]
  userRolle: FallakteRolle
  canEdit: (field: string) => boolean
  updateField: (field: string, value: unknown) => Promise<{ success: boolean; error?: string }>
  refreshFall: () => void
}

const Ctx = createContext<FallContextValue | null>(null)

export function useFall(): FallContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFall() muss innerhalb von FallProvider genutzt werden')
  return v
}

export function FallProvider({
  fall,
  lead,
  userRolle,
  children,
}: {
  fall: FallLike
  lead: LeadLike
  userRolle: FallakteRolle
  children: ReactNode
}) {
  const router = useRouter()

  const phase = fall.status ?? 'ersterfassung'
  const visibleSections = useMemo(() => getVisibleSections(phase), [phase])

  const canEdit = useCallback(
    (field: string) => canEditField(userRolle, field, phase),
    [userRolle, phase],
  )

  const updateField = useCallback(
    async (field: string, value: unknown) => {
      if (!canEdit(field)) {
        return { success: false, error: 'Keine Berechtigung für dieses Feld' }
      }
      const res = await updateFallField(fall.id, field, value)
      if (res.success) {
        router.refresh()
      } else {
        toast.error(res.error ?? 'Speichern fehlgeschlagen')
      }
      return res
    },
    [canEdit, fall.id, router],
  )

  const refreshFall = useCallback(() => router.refresh(), [router])

  const value: FallContextValue = {
    fall,
    lead,
    phase,
    visibleSections,
    userRolle,
    canEdit,
    updateField,
    refreshFall,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
