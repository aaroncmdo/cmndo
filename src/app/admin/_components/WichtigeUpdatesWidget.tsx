import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  UserPlusIcon,
  FileSignatureIcon,
  CreditCardIcon,
  FolderPlusIcon,
  CheckCircle2Icon,
  ActivityIcon,
  ScrollTextIcon,
} from 'lucide-react'

// KFZ-155: Wichtige Updates Widget — Live-Feed der letzten 48h.
//
// Events:
//   - Neue SV-Anmeldungen (sachverstaendige.created_at)
//   - Vertrags-Unterzeichnungen (vertrag_unterschrieben_am)
//   - Erfolgreiche Anzahlungen (stripe_anzahlung_bezahlt_am)
//   - Neue Faelle (faelle.created_at)
//   - Abgeschlossene Faelle (faelle.regulierung_am)
//   - AAR-645: Abtretungs-Uploads durch SV (fall_dokumente.dokument_typ='abtretung')
//
// Maximal 10 Eintraege, sortiert nach Zeitstempel absteigend.

type EventType = 'sv_neu' | 'vertrag_signiert' | 'anzahlung_eingegangen' | 'fall_neu' | 'fall_abgeschlossen' | 'abtretung_upload'

type Event = {
  key: string
  type: EventType
  text: string
  href: string | null
  ts: string
}

const EVENT_META: Record<EventType, { icon: typeof UserPlusIcon; bg: string; iconColor: string; label: string }> = {
  sv_neu: { icon: UserPlusIcon, bg: 'bg-claimondo-ondo/10', iconColor: 'text-claimondo-ondo', label: 'Neuer SV' },
  vertrag_signiert: { icon: FileSignatureIcon, bg: 'bg-purple-50', iconColor: 'text-purple-600', label: 'Vertrag' },
  anzahlung_eingegangen: { icon: CreditCardIcon, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', label: 'Anzahlung' },
  fall_neu: { icon: FolderPlusIcon, bg: 'bg-amber-50', iconColor: 'text-amber-600', label: 'Neuer Fall' },
  fall_abgeschlossen: { icon: CheckCircle2Icon, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', label: 'Abgeschlossen' },
  abtretung_upload: { icon: ScrollTextIcon, bg: 'bg-indigo-50', iconColor: 'text-indigo-600', label: 'Abtretung' },
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std`
  const days = Math.floor(hours / 24)
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
}

type LoadResult = {
  events: Event[]
  mails: { versendet: number; failed: number }
}

async function loadEvents(): Promise<LoadResult> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const events: Event[] = []

  // 1. Neue SVs (created_at)
  const { data: neueSvs } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)

  // 2. Vertrags-Unterzeichnungen
  const { data: vertraege } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, vertrag_unterschrieben_am')
    .eq('vertrag_unterschrieben', true)
    .gte('vertrag_unterschrieben_am', since)
    .order('vertrag_unterschrieben_am', { ascending: false })
    .limit(15)

  // 3. Erfolgreiche Anzahlungen (Stripe Webhook setzt das Feld)
  const { data: anzahlungen } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, stripe_anzahlung_bezahlt_am')
    .not('stripe_anzahlung_bezahlt_am', 'is', null)
    .gte('stripe_anzahlung_bezahlt_am', since)
    .order('stripe_anzahlung_bezahlt_am', { ascending: false })
    .limit(15)

  // SV-Profile fuer die Namen aller obigen Quellen
  const allProfileIds = new Set<string>()
  for (const arr of [neueSvs ?? [], vertraege ?? [], anzahlungen ?? []]) {
    for (const r of arr) {
      if (r.profile_id) allProfileIds.add(r.profile_id)
    }
  }
  let profileMap = new Map<string, { vorname: string | null; nachname: string | null }>()
  if (allProfileIds.size) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname')
      .in('id', Array.from(allProfileIds))
    profileMap = new Map((profs ?? []).map(p => [p.id, p]))
  }

  function svName(profileId: string | null): string {
    if (!profileId) return 'Unbekannt'
    const p = profileMap.get(profileId)
    if (!p) return 'Unbekannt'
    return `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || 'Unbekannt'
  }

  for (const r of neueSvs ?? []) {
    events.push({
      key: `svneu-${r.id}`,
      type: 'sv_neu',
      text: `${svName(r.profile_id)} wurde als SV angelegt`,
      href: `/admin/sachverstaendige/${r.id}`,
      ts: r.created_at,
    })
  }
  for (const r of vertraege ?? []) {
    events.push({
      key: `vert-${r.id}`,
      type: 'vertrag_signiert',
      text: `${svName(r.profile_id)} hat den Vertrag unterzeichnet`,
      href: `/admin/sachverstaendige/${r.id}`,
      ts: r.vertrag_unterschrieben_am,
    })
  }
  for (const r of anzahlungen ?? []) {
    events.push({
      key: `anz-${r.id}`,
      type: 'anzahlung_eingegangen',
      text: `${svName(r.profile_id)} hat die Anzahlung geleistet`,
      href: `/admin/sachverstaendige/${r.id}`,
      ts: r.stripe_anzahlung_bezahlt_am,
    })
  }

  // 4. Neue Faelle
  const { data: neueFaelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)
  for (const f of neueFaelle ?? []) {
    events.push({
      key: `fall-${f.id}`,
      type: 'fall_neu',
      text: `Neuer Fall ${f.fall_nummer ?? ''}`.trim(),
      href: `/faelle/${f.id}`,
      ts: f.created_at,
    })
  }

  // AAR-645: 5. Abtretungs-Uploads durch SV — Admin muss prüfen und freigeben.
  // Gutachter lädt die signierte Abtretung via fall_dokumente hoch
  // (dokument_typ='abtretung', uploaded_by_sv=true). Bis hier stand das nur
  // in der Benachrichtigungsglocke unter Tasks — jetzt auch im Dashboard-Feed,
  // damit Admins die Prüfung direkt auf der Übersicht erkennen.
  const { data: abtretungen } = await supabase
    .from('fall_dokumente')
    .select('id, fall_id, hochgeladen_am, faelle(fall_nummer)')
    .eq('dokument_typ', 'abtretung')
    .eq('uploaded_by_sv', true)
    .is('geloescht_am', null)
    .gte('hochgeladen_am', since)
    .order('hochgeladen_am', { ascending: false })
    .limit(15)
  for (const d of abtretungen ?? []) {
    const fRaw = d.faelle as unknown
    const f = (Array.isArray(fRaw) ? fRaw[0] : fRaw) as { fall_nummer: string | null } | null
    const nummer = f?.fall_nummer ?? d.fall_id.slice(0, 8)
    events.push({
      key: `abt-${d.id}`,
      type: 'abtretung_upload',
      text: `Abtretung von SV hochgeladen — Fall ${nummer} prüfen`,
      href: `/faelle/${d.fall_id}`,
      ts: d.hochgeladen_am,
    })
  }

  // 6. Abgeschlossene Faelle
  const { data: abgeschlossen } = await supabase
    .from('faelle')
    .select('id, fall_nummer, regulierung_am, regulierung_betrag')
    .eq('status', 'abgeschlossen')
    .not('regulierung_am', 'is', null)
    .gte('regulierung_am', since)
    .order('regulierung_am', { ascending: false })
    .limit(15)
  for (const f of abgeschlossen ?? []) {
    const betrag = Number(f.regulierung_betrag ?? 0)
    const betragStr = betrag > 0 ? ` (${betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })})` : ''
    events.push({
      key: `abg-${f.id}`,
      type: 'fall_abgeschlossen',
      text: `Fall ${f.fall_nummer ?? ''} abgeschlossen${betragStr}`,
      href: `/faelle/${f.id}`,
      ts: f.regulierung_am,
    })
  }

  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

  // Welcome-Mail-Versand-Statistik der letzten 48h (zaehlt alle Mails an SVs,
  // nicht nur Welcome — die Templates sind aber alle in dem gleichen Topf).
  let versendet = 0
  let failed = 0
  try {
    const [{ count: ok }, { count: fail }] = await Promise.all([
      supabase
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', since),
      supabase
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', since),
    ])
    versendet = ok ?? 0
    failed = fail ?? 0
  } catch { /* ignore */ }

  return {
    events: events.slice(0, 10),
    mails: { versendet, failed },
  }
}

export default async function WichtigeUpdatesWidget() {
  const { events, mails } = await loadEvents()

  return (
    <div className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden flex flex-col h-full max-h-[500px]">
      <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Wichtige Updates</h2>
        </div>
        <span className="text-[10px] text-claimondo-ondo">letzte 48h</span>
      </div>

      {/* Welcome-Mail-Versand-Statistik */}
      <div className="px-5 py-2 border-b border-claimondo-border bg-claimondo-bg flex items-center gap-3 text-[11px]">
        <span className="text-claimondo-ondo">Email-Versand 48h:</span>
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {mails.versendet} versendet
        </span>
        <span className={`flex items-center gap-1 font-medium ${mails.failed > 0 ? 'text-red-600' : 'text-claimondo-ondo/70'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${mails.failed > 0 ? 'bg-red-500' : 'bg-claimondo-border'}`} />
          {mails.failed} failed
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-claimondo-ondo">Keine Aktivitaet in den letzten 48 Stunden.</p>
          </div>
        ) : (
          <ol className="divide-y divide-claimondo-border">
            {events.map(e => {
              const meta = EVENT_META[e.type]
              const Icon = meta.icon
              const content = (
                <div className="flex items-start gap-3 px-5 py-3 hover:bg-claimondo-bg transition-colors">
                  <div className={`w-7 h-7 rounded-full ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${meta.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-claimondo-navy leading-snug truncate">{e.text}</p>
                    <p className="text-[10px] text-claimondo-ondo/70 mt-0.5">{timeAgo(e.ts)}</p>
                  </div>
                </div>
              )
              return (
                <li key={e.key}>
                  {e.href ? <Link href={e.href}>{content}</Link> : content}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
