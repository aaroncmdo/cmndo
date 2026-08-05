import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/shared/PageHeader'
import { CalendarClockIcon } from 'lucide-react'
import TerminwunschListe, { type TerminwunschRow } from './TerminwunschListe'
import type { SvOption } from './TerminAktionen'
import { getDispatchableSvs } from '@/lib/sv/queries'

// kunde-termin-funnel T3 (Task 9): Dispatch-Queue "Terminwünsche" — Wunschtermine
// aus dem Kunden-Funnel, die noch auf eine SV-Zuweisung warten. Auth-Guard kommt
// vom Dispatch-Layout (requirePortalAccess(['dispatch','admin'])), analog
// src/app/dispatch/rueckrufe/page.tsx.
// Task 10: Aktionen (SV zuweisen / stornieren) — s. reassigniereDeadPin
// (src/lib/termine/engine/state-transitions.ts) fuer den Dead-Pin-Reassign-Pfad.
// Die SV-Optionsliste fuer den Zuweisen-Dialog wird HIER serverseitig geladen
// (getDispatchableSvs — dieselbe "eine Wahrheit" wie /api/sv-zuweisung nutzt,
// nicht nur ist_aktiv=true: schliesst gesperrte/geloeschte/unverifizierte/Test-
// SVs aus) und als Prop durchgereicht, damit der Client-Dialog ohne eigenen
// Ladezustand auskommt.
//
// Admin-Client: gutachter_termine/claims/leads-Reads unabhaengig von der
// RLS-Sicht des eingeloggten Dispatchers — Auth ist bereits durch den
// Layout-Guard sichergestellt (analog dispatch/dashboard/page.tsx).

type TerminRaw = {
  id: string
  start_zeit: string
  status: string | null
  created_at: string | null
  assignee_typ: string | null
  assignee_id: string | null // Task 10: fuer SV-Zuweisung benoetigt
  bezug_typ: string | null
  bezug_id: string | null
  besichtigungsort_adresse: string | null
}

type LeadKontext = {
  id: string
  vorname: string | null
  nachname: string | null
  unfallort_ort: string | null
  unfallort_plz: string | null
}

type ClaimKontext = {
  id: string
  claim_nummer: string | null
  geschaedigter_user_id: string | null
}

type ProfilKontext = {
  id: string
  vorname: string | null
  nachname: string | null
}

type SvOptionRaw = {
  id: string
  profiles: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
}

export default async function DispatchTerminwuensche() {
  const admin = createAdminClient()

  const [{ data: termineRaw, error: termineError }, svRaw] = await Promise.all([
    admin
      .from('gutachter_termine')
      .select(
        'id, start_zeit, status, created_at, assignee_typ, assignee_id, bezug_typ, bezug_id, besichtigungsort_adresse',
      )
      .in('status', ['dispatch_pending', 'sv_gesucht'])
      .is('cancelled_at', null)
      .order('created_at', { ascending: true }),
    getDispatchableSvs<SvOptionRaw>(admin, 'id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)'),
  ])

  if (termineError) {
    console.error('[terminwuensche] termine-Read fehlgeschlagen:', termineError.message)
  }

  const svOptionen: SvOption[] = svRaw
    .map((sv) => {
      const profil = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
      const name = [profil?.vorname, profil?.nachname].filter(Boolean).join(' ').trim()
      return { id: sv.id, name: name || 'Unbenannter SV' }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  const termine = (termineRaw ?? []) as unknown as TerminRaw[]

  // Kontext-Aufloesung in einem Nachlade-Block: bezug_typ='lead' -> leads;
  // bezug_typ in ('fall','claim') -> claims + Kunde via profiles (fall≡claim,
  // IDs identisch — Spec §4.1). Batch per .in(), kein N+1.
  const leadIds = [...new Set(termine.filter((t) => t.bezug_typ === 'lead' && t.bezug_id).map((t) => t.bezug_id as string))]
  const claimIds = [
    ...new Set(
      termine
        .filter((t) => (t.bezug_typ === 'fall' || t.bezug_typ === 'claim') && t.bezug_id)
        .map((t) => t.bezug_id as string),
    ),
  ]

  const leadMap = new Map<string, LeadKontext>()
  if (leadIds.length > 0) {
    const { data, error } = await admin
      .from('leads')
      .select('id, vorname, nachname, unfallort_ort, unfallort_plz')
      .in('id', leadIds)
    if (error) console.error('[terminwuensche] leads-Read fehlgeschlagen:', error.message)
    for (const l of (data ?? []) as unknown as LeadKontext[]) leadMap.set(l.id, l)
  }

  const claimMap = new Map<string, ClaimKontext>()
  if (claimIds.length > 0) {
    const { data, error } = await admin
      .from('claims')
      .select('id, claim_nummer, geschaedigter_user_id')
      .in('id', claimIds)
    if (error) console.error('[terminwuensche] claims-Read fehlgeschlagen:', error.message)
    for (const c of (data ?? []) as unknown as ClaimKontext[]) claimMap.set(c.id, c)
  }

  const kundeIds = [...new Set([...claimMap.values()].map((c) => c.geschaedigter_user_id).filter((x): x is string => !!x))]
  const profileMap = new Map<string, ProfilKontext>()
  if (kundeIds.length > 0) {
    const { data, error } = await admin.from('profiles').select('id, vorname, nachname').in('id', kundeIds)
    if (error) console.error('[terminwuensche] profiles-Read fehlgeschlagen:', error.message)
    for (const p of (data ?? []) as unknown as ProfilKontext[]) profileMap.set(p.id, p)
  }

  const rows: TerminwunschRow[] = termine.map((t) => {
    const isLead = t.bezug_typ === 'lead'
    const isClaim = t.bezug_typ === 'fall' || t.bezug_typ === 'claim'
    const lead = isLead && t.bezug_id ? leadMap.get(t.bezug_id) : undefined
    const claim = isClaim && t.bezug_id ? claimMap.get(t.bezug_id) : undefined
    const profil = claim?.geschaedigter_user_id ? profileMap.get(claim.geschaedigter_user_id) : undefined

    const kundeName = lead
      ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null
      : [profil?.vorname, profil?.nachname].filter(Boolean).join(' ') || null

    // Fix 2 (Review T3): besichtigungsort_adresse aus gutachter_termine ist der
    // EINHEITLICHE Ort fuer JEDE Zeile — auch Claim-Anker (kein Lead) bekommen so
    // einen echten Ort. Lead-Text-Fallback (unfallort_plz/_ort) nur wenn der
    // Termin (noch) keinen Besichtigungsort traegt.
    const leadOrt = lead ? [lead.unfallort_plz, lead.unfallort_ort].filter(Boolean).join(' ') || null : null
    const ort = t.besichtigungsort_adresse || leadOrt

    return {
      id: t.id,
      start_zeit: t.start_zeit,
      status: t.status,
      created_at: t.created_at,
      ort,
      leadId: isLead ? (t.bezug_id ?? null) : null,
      claimId: isClaim ? (t.bezug_id ?? null) : null,
      claimNummer: claim?.claim_nummer ?? null,
      kundeName,
      quelle: t.assignee_typ === 'sv_lead' ? 'dead_pin' : 'portal',
    }
  })

  return (
    <div className="space-y-5 py-6">
      <PageHeader
        title="Terminwünsche"
        description="Wunschtermine aus dem Kunden-Funnel, die auf eine SV-Zuweisung warten."
        size="lg"
        icon={CalendarClockIcon}
      />
      <TerminwunschListe rows={rows} ladeFehler={!!termineError} svOptionen={svOptionen} />
    </div>
  )
}
