'use client'

// AAR-770: Prominenter Mitteilungs-Banner ganz oben in der Fallakte.
// Zeigt offene (gelesen=false) Mitteilungen die diesen Fall betreffen
// (kontext_typ='fall' AND kontext_id=fallId) und dem aktuellen User
// gehören (empfaenger_id=user.id).
//
// Pro Mitteilung: Titel + Inhalt + Quick-Action-Button.
// Quick-Action-Button öffnet route_url als Pop-out (shared Modal-
// Primitive) ODER navigiert direkt — abhängig vom Pattern.

import { useEffect, useMemo, useState, useTransition, useId } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BellIcon,
  CheckCircle2Icon,
  ClockIcon,
  XIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Stack, Row, Text, Icon } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'
import type { Mitteilung, MitteilungPrioritaet } from '@/lib/mitteilungen/types'

type Props = {
  fallId: string
  /** Aktuelle Rolle für Empfänger-Filter (Server-RLS macht eh die Hauptarbeit). */
  rolle?: string
}

const PRIO_TONE: Record<MitteilungPrioritaet, { color: string; bg: string; icon: typeof BellIcon; label: string }> = {
  dringend: { color: '#dc2626', bg: '#fef2f2', icon: AlertTriangleIcon, label: 'Dringend' },
  hoch: { color: '#d97706', bg: '#fffbeb', icon: BellIcon, label: 'Wichtig' },
  normal: { color: '#4573A2', bg: '#f8f9fb', icon: BellIcon, label: 'Mitteilung' },
}

export function FallMitteilungenBanner({ fallId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const channelId = useId()
  const [items, setItems] = useState<Mitteilung[]>([])
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()

  const load = useMemo(
    () => async () => {
      const user = (await supabase.auth.getUser())?.data?.user
      if (!user) {
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('mitteilungen')
        .select('*')
        .eq('empfaenger_id', user.id)
        .eq('kontext_typ', 'fall')
        .eq('kontext_id', fallId)
        .eq('gelesen', false)
        .order('created_at', { ascending: false })
        .limit(10)
      setItems((data ?? []) as Mitteilung[])
      setLoading(false)
    },
    [supabase, fallId],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Realtime — bei neuen Mitteilungen für diesen Fall direkt neu laden
  useEffect(() => {
    const ch = supabase
      .channel(`fall-mitteilungen-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mitteilungen', filter: `kontext_id=eq.${fallId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [supabase, fallId, channelId, load])

  function dismiss(id: string) {
    startTransition(async () => {
      const { error } = await supabase
        .from('mitteilungen')
        .update({ gelesen: true, gelesen_am: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        toast.error('Konnte Mitteilung nicht als gelesen markieren')
        return
      }
      setItems((prev) => prev.filter((m) => m.id !== id))
    })
  }

  if (loading || items.length === 0) return null

  // Sortiere nach Prio: dringend > hoch > normal
  const prioOrder: Record<MitteilungPrioritaet, number> = { dringend: 0, hoch: 1, normal: 2 }
  const sorted = [...items].sort(
    (a, b) =>
      (prioOrder[a.prioritaet ?? 'normal'] ?? 2) - (prioOrder[b.prioritaet ?? 'normal'] ?? 2),
  )

  return (
    <Stack gap={2}>
      {sorted.map((m) => {
        const prio = (m.prioritaet ?? 'normal') as MitteilungPrioritaet
        const tone = PRIO_TONE[prio] ?? PRIO_TONE.normal
        const ToneIcon = tone.icon
        return (
          <div
            key={m.id}
            style={{
              backgroundColor: tone.bg,
              border: `1px solid ${tone.color}40`,
              borderLeft: `4px solid ${tone.color}`,
              borderRadius: tokens.radius.md,
              padding: tokens.spacing[3],
            }}
          >
            <Row gap={3} align="start" justify="between">
              <div style={{ display: 'flex', gap: tokens.spacing[2], minWidth: 0, flex: 1 }}>
                <ToneIcon size={18} style={{ color: tone.color, flexShrink: 0, marginTop: 2 }} />
                <Stack gap={1} >
                  <Row gap={2} align="center">
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: tone.color,
                      }}
                    >
                      {tone.label}
                    </span>
                    {m.absender_name && (
                      <Text variant="bodyXs" color="ondo">
                        von {m.absender_name}
                      </Text>
                    )}
                    <Text variant="bodyXs" color="ondo">
                      {new Date(m.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </Row>
                  <Text variant="body" color="navy">
                    {m.titel}
                  </Text>
                  {m.inhalt && (
                    <Text variant="bodySm" color="navy">
                      {m.inhalt}
                    </Text>
                  )}
                </Stack>
              </div>

              <Row gap={2} align="center">
                {m.route_url && (
                  <a
                    href={m.route_url}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 36,
                      paddingInline: tokens.spacing[3],
                      borderRadius: tokens.radius.sm,
                      backgroundColor: tone.color,
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Aktion ausführen
                    <ArrowRightIcon size={14} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(m.id)}
                  aria-label="Mitteilung als gelesen markieren"
                  style={{
                    width: 32,
                    height: 32,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: tokens.radius.full,
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: tokens.colors.ondo,
                    cursor: 'pointer',
                  }}
                >
                  <XIcon size={16} />
                </button>
              </Row>
            </Row>
          </div>
        )
      })}
    </Stack>
  )
}
