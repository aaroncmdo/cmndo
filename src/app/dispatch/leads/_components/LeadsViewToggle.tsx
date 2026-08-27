'use client'

// AAR-179 P3-H + P3-I: Leads-Übersicht mit Toggle zwischen Liste (Tabelle)
// und Kanban (Karten gruppiert nach qualifizierungs_phase). Der Dispatcher
// wechselt zwischen „Schnell-Scan nach Zeit" (Tabelle) und „Was steht wo im
// Funnel?" (Kanban). Name als Link ist schon in beiden Views drin (P3-I).
//
// Aaron 2026-05-19: Realtime-Subscription auf leads-INSERT — wenn ein Lead
// während des Browser-Sessions reinkommt (z. B. von der kfzgutachter-LP),
// wird er live oben in der Liste hinzugefügt und kurz hervorgehoben.

import { useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PhoneIcon, ExternalLinkIcon, LayoutGridIcon, ListIcon, BellIcon, UserIcon, CalendarCheckIcon, UserCheckIcon } from 'lucide-react'
import { PHASE_BADGES, PHASE_LABELS, KANBAN_PHASEN } from './leadPhaseConstants'
import PhoneButton from '@/components/shared/PhoneButton'
import { Chip } from '@/components/ui/Chip'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import DensityToggle from '@/components/shared/DensityToggle'
import { useDensityPreference, type Density } from '@/hooks/useDensityPreference'
import { createClient } from '@/lib/supabase/client'
import { subscribeWhenAuthed } from '@/lib/supabase/realtime-gate'
import {
  type TerminGutachterInfo,
  TONE_BADGE,
  terminStatusTone,
  formatTerminKurz,
} from '@/lib/dispatch/lead-termin-gutachter'

type DispatcherProfile = {
  id: string
  vorname: string | null
  nachname: string | null
  avatar_url: string | null
}

type Lead = {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
  qualifizierungs_phase: string | null
  status: string | null
  kunden_konstellation: string | null
  schadens_fall_typ: string | null
  service_typ: string | null
  source_channel: string | null
  firma_name: string | null
  gegner_name: string | null
  gegner_kennzeichen: string | null
  konvertiert_zu_claim_id: string | null
  flow_link_geoeffnet: boolean | null
  flow_link_abgeschlossen: boolean | null
  whatsapp_verfuegbar: boolean | null
  created_at: string
  updated_at: string
  zugewiesen_an?: string | null
  zugewiesen_an_profile?: DispatcherProfile | DispatcherProfile[] | null
}

// AGENTS.md §Nested-FK: select('profiles!fk(...)') liefert je nach Cardinality
// Array oder Object — diese Helper normalisiert auf ein einzelnes Profile.
function unwrapDispatcher(
  raw: DispatcherProfile | DispatcherProfile[] | null | undefined,
): DispatcherProfile | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

function dispatcherInitials(p: DispatcherProfile | null): string {
  if (!p) return '?'
  const v = (p.vorname ?? '').trim().charAt(0).toUpperCase()
  const n = (p.nachname ?? '').trim().charAt(0).toUpperCase()
  return (v + n) || '?'
}

// 880 Hz Sinus-Beep für 120 ms, fade-out. AudioContext muss lazy gebaut werden
// weil er sonst beim Component-Mount sofort gesperrt ist. Wenn der Browser den
// Sound blockt (Tab-Background, no-user-interaction-yet, autoplay-Policy),
// ignorieren wir das — der visuelle Highlight reicht.
let _audioCtx: AudioContext | null = null
async function playNotificationBeep(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!_audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    _audioCtx = new Ctor()
  }
  const ctx = _audioCtx
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return
    }
  }
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.13)
}

function DispatcherAvatar({
  lead,
  size = 'sm',
}: {
  lead: Lead
  size?: 'sm' | 'xs'
}) {
  const profile = unwrapDispatcher(lead.zugewiesen_an_profile)
  const dims = size === 'xs' ? 'h-5 w-5 text-[8px]' : 'h-7 w-7 text-[10px]'

  if (!lead.zugewiesen_an) {
    return (
      <span
        title="Noch nicht zugewiesen"
        className={`inline-flex ${dims} items-center justify-center rounded-full border border-dashed border-claimondo-ondo/40 bg-claimondo-bg text-claimondo-ondo/60`}
      >
        <UserIcon className="h-3 w-3" aria-hidden />
      </span>
    )
  }

  const label = profile
    ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() ||
      'Zugewiesen'
    : 'Zugewiesen'

  if (profile?.avatar_url) {
    return (
      <span
        title={`Zugewiesen an ${label}`}
        className={`relative inline-block ${dims} overflow-hidden rounded-full ring-1 ring-success/20`}
      >
        <Image
          src={profile.avatar_url}
          alt={label}
          fill
          sizes="28px"
          className="object-cover"
          unoptimized
        />
      </span>
    )
  }
  return (
    <span
      title={`Zugewiesen an ${label}`}
      className={`inline-flex ${dims} items-center justify-center rounded-full bg-success-soft font-bold text-success-strong ring-1 ring-success/20`}
    >
      {dispatcherInitials(profile)}
    </span>
  )
}

// lead_status (neu/rueckruf/quali-offen/flow-gesendet/umgewandelt/umgewandelt-sv/
// disqualifiziert/kalt) ist die grobe Lifecycle-Achse — orthogonal zur
// qualifizierungs_phase (Funnel-Schritt). Terminal-/Warnzustände bekommen
// Farbe, der Normalfall 'neu' bleibt unmarkiert (Redundanz zur Phase vermeiden).
const STATUS_BADGES: Record<string, string> = {
  rueckruf: 'bg-warning-soft text-warning',
  'quali-offen': 'bg-claimondo-bg text-claimondo-ondo',
  'flow-gesendet': 'bg-claimondo-ondo/10 text-claimondo-ondo',
  umgewandelt: 'bg-success-soft text-success-strong',
  'umgewandelt-sv': 'bg-success-soft text-success-strong',
  disqualifiziert: 'bg-danger-soft text-danger',
  kalt: 'bg-claimondo-bg text-claimondo-ondo/60',
}

function waPill(verfuegbar: boolean | null, telefon: string | null): { label: string; cls: string } | null {
  if (!telefon) return null
  if (verfuegbar === true) return { label: '📱 WA', cls: 'bg-success-soft text-success-strong' }
  if (verfuegbar === false) return { label: '📵', cls: 'bg-claimondo-bg text-claimondo-ondo/50' }
  return { label: '⏳ WA?', cls: 'bg-warning-soft text-warning' }
}

function flowLinkBadge(offen: boolean | null, abgeschlossen: boolean | null): { label: string; cls: string } {
  if (abgeschlossen) return { label: 'Abgeschlossen', cls: 'bg-success-soft text-success-strong' }
  if (offen) return { label: 'Offen', cls: 'bg-warning-soft text-warning-strong' }
  return { label: '—', cls: 'text-claimondo-ondo/50' }
}

// Flotten-Schaden-Leads (Schadenkarte-Gegner-Submit / FM-manuell): der „Kunde" ist die FIRMA,
// nicht eine Person -> vorname/nachname sind leer, die Zeile waere sonst namenlos. Anzeige faellt
// auf firma_name (bzw. Gegner) zurueck. + „Flotte"-Chip als Herkunft, damit der Dispatcher die
// Fleet-Faelle erkennt (statt sie als kaputte Zeile zu ueberlesen). Der Lead bleibt die
// universelle Intake-Zeile — er wird nur korrekt gerendert (kein neues Dispatch-Surface).
const FLOTTE_KANAELE = ['schaden-karte', 'flotte-manuell']
function istFlottenLead(lead: Lead): boolean {
  return lead.source_channel != null && FLOTTE_KANAELE.includes(lead.source_channel)
}
function leadAnzeigeName(lead: Lead): string {
  const person = [lead.vorname, lead.nachname].filter(Boolean).join(' ').trim()
  return person || lead.firma_name || lead.gegner_name || '—'
}

export default function LeadsViewToggle({
  leads: initialLeads,
  terminGutachter,
}: {
  leads: Lead[]
  terminGutachter: Record<string, TerminGutachterInfo>
}) {
  const [view, setView] = useState<'liste' | 'kanban'>('liste')
  const [density] = useDensityPreference('dispatch-leads')
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set())
  const channelInstanceId = useId() // verhindert Channel-Kollision wenn der Component mehrfach mountet
  const router = useRouter()
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initial-Props syncen, falls Server eine Refresh ausliefert (revalidatePath
  // oder Phase-Filter wechselt → neue Props, lokaler State soll mit ziehen).
  useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  // Realtime-Subscription auf neue Leads. Nur INSERT — Updates kommen ueber
  // den Server-Refresh, der reicht für den Status-Wechsel-Use-Case.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dispatch-leads-list:${channelInstanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        async (payload) => {
          const fresh = payload.new as Lead
          // Falls Phase-Filter aktiv ist, kommt der Lead trotzdem in den State —
          // der Server-Render filtert beim nächsten Refresh wieder weg, wenn
          // nicht passend. Lieber 1× sichtbar als verpasst.
          setLeads((prev) => {
            if (prev.some((l) => l.id === fresh.id)) return prev
            return [fresh, ...prev]
          })
          setNewLeadIds((prev) => new Set(prev).add(fresh.id))

          // Sound-Cue: kurzer Sinus-Beep via WebAudio. Browser blockt
          // AudioContext.resume() bevor der User interagiert hat — wir
          // catchen den Fehler und ignorieren ihn lautlos.
          playNotificationBeep().catch(() => {})

          // Realtime-Payload enthält nur die leads-Row, kein joined Profile.
          // Wenn der Round-Robin den Lead direkt einem Dispatcher zugewiesen
          // hat, holen wir das Profile separat nach.
          if (fresh.zugewiesen_an) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, vorname, nachname, avatar_url')
              .eq('id', fresh.zugewiesen_an)
              .maybeSingle()
            if (profile) {
              setLeads((prev) =>
                prev.map((l) =>
                  l.id === fresh.id
                    ? { ...l, zugewiesen_an_profile: profile }
                    : l,
                ),
              )
            }
          }

          // Highlight nach 12 s wieder entfernen
          setTimeout(() => {
            setNewLeadIds((prev) => {
              const next = new Set(prev)
              next.delete(fresh.id)
              return next
            })
          }, 12000)
        },
      )

    return subscribeWhenAuthed(supabase, () => channel)
  }, [channelInstanceId])

  // AAR-956 #4: Termin/Gutachter live in der Liste. Die "Termin · Gutachter"-Spalte
  // kommt aus v_lead_termin_gutachter (Server-Prop terminGutachter). Eine Buchung/
  // Umlegung/Stornierung ODER SV-Zuweisung landet als gutachter_termine-Change —
  // global abonniert (kein lead_id-Filter: die Liste zeigt viele Leads), debounced
  // router.refresh() laedt terminGutachter (+ leads) frisch nach. Spiegelt
  // LeadRealtimeRefresh(watchTermine) der Detail-Sicht auf Listen-Ebene. Kein gfa-
  // Watch noetig: eine SV-Zuweisung schreibt immer gutachter_termine; der kunden_pick
  // (gfa) ist post-Konversion statisch und nicht in der Realtime-Publication.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dispatch-leads-termine:${channelInstanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gutachter_termine' },
        () => {
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = setTimeout(() => {
            router.refresh()
            refreshTimerRef.current = null
          }, 600)
        },
      )

    const cleanupChannel = subscribeWhenAuthed(supabase, () => channel)
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      cleanupChannel()
    }
  }, [channelInstanceId, router])

  const newCount = newLeadIds.size

  return (
    <div className="space-y-3">
      {/* Segmented Control (Design-Brief §8.1) */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex p-[3px] bg-claimondo-navy/[0.06] rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => setView('liste')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-ios-md text-xs font-semibold tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] ${
              view === 'liste'
                ? 'bg-white text-claimondo-navy shadow-[0_1px_2px_rgba(15,30,68,.04),0_3px_8px_rgba(15,30,68,.06)]'
                : 'text-claimondo-shield hover:text-claimondo-navy'
            }`}
          >
            <ListIcon className="w-3.5 h-3.5" />
            Liste
          </button>
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-ios-md text-xs font-semibold tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] ${
              view === 'kanban'
                ? 'bg-white text-claimondo-navy shadow-[0_1px_2px_rgba(15,30,68,.04),0_3px_8px_rgba(15,30,68,.06)]'
                : 'text-claimondo-shield hover:text-claimondo-navy'
            }`}
          >
            <LayoutGridIcon className="w-3.5 h-3.5" />
            Kanban
          </button>
        </div>

        {newCount > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success-strong"
          >
            <BellIcon className="h-3.5 w-3.5" aria-hidden />
            {newCount === 1
              ? '1 neuer Lead'
              : `${newCount} neue Leads`}{' '}
            soeben eingegangen
          </div>
        )}
      </div>

      {view === 'liste' ? (
        <ListView leads={leads} density={density} highlightIds={newLeadIds} terminGutachter={terminGutachter} />
      ) : (
        <KanbanView leads={leads} highlightIds={newLeadIds} terminGutachter={terminGutachter} />
      )}
    </div>
  )
}

function ListView({
  leads,
  density,
  highlightIds,
  terminGutachter,
}: {
  leads: Lead[]
  density: Density
  highlightIds: Set<string>
  terminGutachter: Record<string, TerminGutachterInfo>
}) {
  const compact = density === 'compact'
  const rowPadCls = compact ? 'px-3 py-1.5' : 'px-4 py-3'
  const cellPadCls = compact ? 'px-3 py-1.5' : 'px-4 py-3'
  return (
    <DataTableContainer variant="plain" className="bg-white rounded-3xl shadow-claimondo-md overflow-hidden border border-claimondo-navy/[0.06]">
        <Table>
          <Thead className="!bg-transparent">
            <Tr className="border-b border-claimondo-navy/[0.08] bg-claimondo-navy/[0.03]">
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Name</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Telefon</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Status</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">FlowLink</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Termin · Gutachter</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Service</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Zugewiesen</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Erstellt</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]"></Th>
            </Tr>
          </Thead>
          <Tbody className="!divide-claimondo-navy/[0.06]">
            {leads.map((lead) => {
              const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
              const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)
              return (
                <Tr
                  key={lead.id}
                  className={`transition-colors ${
                    highlightIds.has(lead.id)
                      ? 'bg-success-soft/70 ring-2 ring-success/20 hover:bg-success-soft'
                      : 'hover:bg-claimondo-navy/[0.03]'
                  }`}
                >
                  <Td>
                    <Link href={`/dispatch/leads/${lead.id}`} className="font-medium text-claimondo-navy hover:text-claimondo-ondo">
                      {leadAnzeigeName(lead)}
                    </Link>
                    {istFlottenLead(lead) && (
                      <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-claimondo-ondo/10 text-claimondo-navy">Flotte</span>
                    )}
                    {lead.konvertiert_zu_claim_id && (
                      <Link href={`/faelle/${lead.konvertiert_zu_claim_id}`} className="ml-1.5 text-[10px] font-medium text-claimondo-ondo hover:underline">
                        → Fall
                      </Link>
                    )}
                    {lead.schadens_fall_typ && (
                      <span className="ml-2 text-[10px] text-claimondo-ondo/70">{lead.schadens_fall_typ}</span>
                    )}
                    {lead.kunden_konstellation && (
                      <span className="ml-1.5 text-[10px] text-claimondo-ondo/50">{lead.kunden_konstellation}</span>
                    )}
                  </Td>
                  <Td className={cellPadCls}>
                    {lead.telefon ? (
                      <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
                    ) : (
                      <span className="text-claimondo-ondo/50">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGES[lead.qualifizierungs_phase ?? ''] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                        {PHASE_LABELS[lead.qualifizierungs_phase ?? ''] ?? lead.qualifizierungs_phase ?? '—'}
                      </span>
                      {lead.status && STATUS_BADGES[lead.status] && lead.status !== 'neu' && (
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_BADGES[lead.status]}`}>
                          {lead.status}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className={cellPadCls}>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                  </Td>
                  <Td className={cellPadCls}>
                    <TerminGutachterCell info={terminGutachter[lead.id]} />
                  </Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {lead.service_typ === 'nur_gutachter' ? 'Nur SV' : 'Komplett'}
                  </Td>
                  <Td className={cellPadCls}>
                    <DispatcherAvatar lead={lead} />
                  </Td>
                  {/* suppressHydrationWarning: Datums-Formatierung via toLocaleDateString
                      ist server-seitig UTC, client-seitig Europe/Berlin → #418-Mismatch.
                      Der angezeigte Wert ist korrekt, nur das HTML-Attribut weicht ab. */}
                  <Td className="!text-claimondo-ondo/70 text-xs" suppressHydrationWarning>
                    {new Date(lead.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Td>
                  <Td>
                    <Link href={`/dispatch/leads/${lead.id}`} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
                      <ExternalLinkIcon className="w-4 h-4" />
                    </Link>
                  </Td>
                </Tr>
              )
            })}
            {leads.length === 0 && (
              <Tr>
                <Td colSpan={9} className="!py-12 text-center text-sm !text-claimondo-ondo/70">Keine Leads gefunden</Td>
              </Tr>
            )}
          </Tbody>
        </Table>
    </DataTableContainer>
  )
}

function KanbanView({
  leads,
  highlightIds,
  terminGutachter,
}: {
  leads: Lead[]
  highlightIds: Set<string>
  terminGutachter: Record<string, TerminGutachterInfo>
}) {
  // Kanban-Bucketing: jede DB-Phase muss eine eigene Spalte haben damit Leads
  // nicht stillschweigend in 'neu' verschwinden (Audit-Fix AAR-179 Follow-up).
  const gruppen: Record<string, Lead[]> = {}
  for (const p of KANBAN_PHASEN) gruppen[p] = []
  for (const lead of leads) {
    const k = lead.qualifizierungs_phase ?? 'neu'
    if (gruppen[k]) gruppen[k].push(lead)
    else {
      // Unerwarteter Phase-Wert (neue DB-Enum, fehlt in KANBAN_PHASEN).
      // Wir legen on-the-fly eine Spalte an damit nichts verloren geht.
      gruppen[k] = [lead]
    }
  }

  // Unbekannte Phase-Werte ans Ende hängen damit sie in der UI sichtbar werden
  const phasenOrder = [
    ...KANBAN_PHASEN,
    ...Object.keys(gruppen).filter((k) => !KANBAN_PHASEN.includes(k as typeof KANBAN_PHASEN[number])),
  ]

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {phasenOrder.map((phase) => {
        const bucket = gruppen[phase] ?? []
        return (
          <div key={phase} className="min-w-[260px] w-[260px] bg-claimondo-navy/[0.04] rounded-2xl p-3 space-y-2 flex-shrink-0 border border-claimondo-navy/[0.06]">
            <div className="flex items-center justify-between px-1">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${PHASE_BADGES[phase] ?? 'bg-claimondo-border text-claimondo-ondo'}`}>
                {PHASE_LABELS[phase] ?? phase}
              </span>
              <span className="text-[10px] text-claimondo-ondo/70 tabular-nums">{bucket.length}</span>
            </div>
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
              {bucket.map((lead) => {
                const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
                const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)
                return (
                  <Link
                    key={lead.id}
                    href={`/dispatch/leads/${lead.id}`}
                    className={`block rounded-2xl border p-3 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_2px_6px_rgba(15,30,68,.05)] ${
                      highlightIds.has(lead.id)
                        ? 'border-success/30 bg-success-soft/70 ring-2 ring-success/20'
                        : 'border-claimondo-navy/[0.08] bg-white hover:border-claimondo-ondo'
                    }`}
                  >
                    <p className="text-xs font-medium text-claimondo-navy truncate">
                      {leadAnzeigeName(lead)}
                    </p>
                    {istFlottenLead(lead) && (
                      <span className="mt-0.5 inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-claimondo-ondo/10 text-claimondo-navy">Flotte</span>
                    )}
                    {lead.telefon && (
                      <p className="text-[10px] text-claimondo-ondo flex items-center gap-1 mt-0.5">
                        <PhoneIcon className="w-2.5 h-2.5" />
                        {lead.telefon}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                      <span className="ml-auto inline-flex items-center gap-1">
                        <DispatcherAvatar lead={lead} size="xs" />
                        {/* suppressHydrationWarning: toLocaleDateString UTC vs. Europe/Berlin (#418) */}
                        <span className="text-[9px] text-claimondo-ondo/70" suppressHydrationWarning>
                          {new Date(lead.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </span>
                    </div>
                    <TerminGutachterMini info={terminGutachter[lead.id]} />
                  </Link>
                )
              })}
              {bucket.length === 0 && (
                <p className="text-[10px] text-claimondo-ondo/50 text-center py-4 italic">Keine Leads</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AAR-956: Single-Source Termin/Gutachter-Zellen (Tabelle + Kanban).
// Quelle = v_lead_termin_gutachter (eine Zeile pro Lead). undefined (z. B. ein
// soeben per Realtime eingegangener Lead, noch ohne Termin/Gutachter) → "—".
// ─────────────────────────────────────────────────────────────

function TerminGutachterCell({ info }: { info?: TerminGutachterInfo }) {
  if (!info || (!info.hat_termin && !info.hat_gutachter)) {
    return <span className="text-xs text-claimondo-ondo/40">—</span>
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {info.hat_termin ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_BADGE[terminStatusTone(info.termin_status)]}`}>
          <CalendarCheckIcon className="h-3 w-3" />
          {formatTerminKurz(info.termin_start)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] text-claimondo-ondo/50">
          <CalendarCheckIcon className="h-3 w-3 opacity-40" />
          kein Termin
        </span>
      )}
      {info.hat_gutachter ? (
        <span className="inline-flex max-w-[190px] items-center gap-1">
          <UserCheckIcon className="h-3 w-3 shrink-0 text-claimondo-ondo" />
          <span className="truncate text-[11px] font-medium text-claimondo-navy">{info.gutachter_name ?? 'Gutachter'}</span>
          {info.gutachter_divergiert ? (
            <span
              title={`Kunde wählte ursprünglich ${info.kunden_pick_name ?? '—'}`}
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${TONE_BADGE.warning}`}
            >
              ≠ Wunsch
            </span>
          ) : info.gutachter_quelle === 'kunden_pick' ? (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${TONE_BADGE.neutral}`}>Wunsch</span>
          ) : null}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] text-claimondo-ondo/50">
          <UserCheckIcon className="h-3 w-3 opacity-40" />
          kein Gutachter
        </span>
      )}
    </div>
  )
}

function TerminGutachterMini({ info }: { info?: TerminGutachterInfo }) {
  if (!info || (!info.hat_termin && !info.hat_gutachter)) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {info.hat_termin && (
        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${TONE_BADGE[terminStatusTone(info.termin_status)]}`}>
          <CalendarCheckIcon className="h-2.5 w-2.5" />
          {formatTerminKurz(info.termin_start)}
        </span>
      )}
      {info.hat_gutachter && (
        <span
          title={info.gutachter_name ?? undefined}
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${info.gutachter_divergiert ? TONE_BADGE.warning : 'bg-claimondo-navy/[0.06] text-claimondo-navy'}`}
        >
          <UserCheckIcon className="h-2.5 w-2.5" />
          <span className="max-w-[90px] truncate">{info.gutachter_name ?? 'SV'}</span>
        </span>
      )}
    </div>
  )
}
