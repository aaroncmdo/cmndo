// Admin-Übersicht aller DSGVO-Lösch-Anträge.
// Liste mit Aktionen (Bestätigen / Direkt-Ausführen / Stornieren).

import { redirect } from 'next/navigation'
import { ShieldAlertIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/shared/PageHeader'
import DsgvoLoeschAdminActions from '@/components/admin/DsgvoLoeschAdminActions'

export const dynamic = 'force-dynamic'

type AuftragRow = {
  id: string
  user_id: string | null
  email: string
  status: 'eingereicht' | 'bestaetigt' | 'ausgefuehrt' | 'abgelehnt' | 'storniert'
  grund: string | null
  eingereicht_am: string
  eingereicht_von: string
  bestaetigt_am: string | null
  ausgefuehrt_am: string | null
}

const STATUS_META: Record<AuftragRow['status'], { label: string; color: string; icon: typeof ClockIcon }> = {
  eingereicht: { label: 'Eingereicht', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: ClockIcon },
  bestaetigt: { label: '14d Karenz', color: 'bg-claimondo-ondo/10 text-claimondo-ondo border-claimondo-ondo/30', icon: ClockIcon },
  ausgefuehrt: { label: 'Ausgeführt', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircleIcon },
  abgelehnt: { label: 'Abgelehnt', color: 'bg-claimondo-navy/[0.06] text-claimondo-shield border-claimondo-border', icon: XCircleIcon },
  storniert: { label: 'Storniert', color: 'bg-claimondo-navy/[0.06] text-claimondo-shield border-claimondo-border', icon: XCircleIcon },
}

export default async function AdminDsgvoLoeschauftraegePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  // Admin-Client für Sicht auf alle Anträge (RLS limit auf self)
  const admin = createAdminClient()
  const { data: auftraege } = await admin
    .from('dsgvo_loeschauftraege')
    .select('id, user_id, email, status, grund, eingereicht_am, eingereicht_von, bestaetigt_am, ausgefuehrt_am')
    .order('eingereicht_am', { ascending: false })
    .limit(200)

  const offene = (auftraege ?? []).filter(
    (a): a is AuftragRow => ['eingereicht', 'bestaetigt'].includes(a.status as string)
  )
  const archiv = (auftraege ?? []).filter(
    (a): a is AuftragRow => ['ausgefuehrt', 'abgelehnt', 'storniert'].includes(a.status as string)
  )

  return (
    <div className="w-full max-w-5xl px-4 py-6 mx-auto space-y-6">
      <PageHeader title="DSGVO Lösch-Anträge" size="lg" />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlertIcon width={18} height={18} className="text-amber-700 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-amber-900">
            <p className="font-semibold">DSGVO Art. 17 — Recht auf Vergessenwerden.</p>
            <p className="mt-1">
              Bestätigung startet 14-Tage-Karenz. Direkt-Ausführen ohne Karenz nur in
              begründeten Fällen (z.B. wiederholter Antrag). Anonymisierung wirkt auf
              profiles, claims, faelle, leads, gutachter_finder_anfragen, claim_parties,
              airdrop_invitations.
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-claimondo-ondo mb-3">
          Offen ({offene.length})
        </h2>
        {offene.length === 0 ? (
          <div className="rounded-xl border border-claimondo-border bg-white p-6 text-center text-sm text-claimondo-ondo">
            Keine offenen Anträge.
          </div>
        ) : (
          <ul className="space-y-2">
            {offene.map((a) => (
              <AntragRow key={a.id} auftrag={a} aktiv />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-claimondo-ondo mb-3">
          Archiv ({archiv.length})
        </h2>
        {archiv.length === 0 ? (
          <div className="rounded-xl border border-claimondo-border bg-white p-6 text-center text-sm text-claimondo-ondo">
            Noch keine archivierten Anträge.
          </div>
        ) : (
          <ul className="space-y-2">
            {archiv.slice(0, 50).map((a) => (
              <AntragRow key={a.id} auftrag={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AntragRow({ auftrag, aktiv = false }: { auftrag: AuftragRow; aktiv?: boolean }) {
  const meta = STATUS_META[auftrag.status]
  const Icon = meta.icon
  return (
    <li className="rounded-xl border border-claimondo-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}
            >
              <Icon width={11} height={11} />
              {meta.label}
            </span>
            <span className="text-[10px] text-claimondo-ondo/70">
              {auftrag.eingereicht_von === 'self_service'
                ? 'Self-Service'
                : auftrag.eingereicht_von === 'email_anfrage'
                ? 'Email-Anfrage'
                : 'Admin manuell'}
            </span>
          </div>
          <p className="mt-2 text-sm font-mono text-claimondo-navy">
            {auftrag.email}
          </p>
          {auftrag.grund && (
            <p className="mt-1 text-xs italic text-claimondo-ondo">
              „{auftrag.grund}"
            </p>
          )}
          <p className="mt-2 text-[11px] text-claimondo-ondo/70">
            Eingereicht{' '}
            {new Date(auftrag.eingereicht_am).toLocaleString('de-DE', {
              day: '2-digit', month: '2-digit', year: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
            {auftrag.bestaetigt_am && (
              <> · Bestätigt{' '}
              {new Date(auftrag.bestaetigt_am).toLocaleDateString('de-DE')}</>
            )}
            {auftrag.ausgefuehrt_am && (
              <> · Ausgeführt{' '}
              {new Date(auftrag.ausgefuehrt_am).toLocaleDateString('de-DE')}</>
            )}
          </p>
        </div>

        {aktiv && (
          <DsgvoLoeschAdminActions
            auftragId={auftrag.id}
            status={auftrag.status as 'eingereicht' | 'bestaetigt'}
          />
        )}
      </div>
    </li>
  )
}
