import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeStaff, type StaffDb } from '@/lib/levelup/staff'
import { ordneFuerVertrieb, type VertriebsZeile } from '@/lib/levelup/auswertung'
import type { Db } from '@/lib/anreicherung/schreiben'
import { abmelden } from '../anmelden/actions'
import { LinkKnopf } from './LinkKnopf'

export const dynamic = 'force-dynamic'

type CheckZeile = {
  id: string
  token: string
  firmenname: string | null
  standort_ort: string | null
  erhoben_am: string | null
  score: number | null
  kein_score: boolean
  sv_lead_id: string | null
}

export default async function UebersichtSeite() {
  // Schranke 1: Mitarbeiter? Sonst gibt es hier nichts zu sehen.
  const sitzung = await createClient()
  const staff = await pruefeStaff(sitzung as unknown as StaffDb)
  if (!staff.ok) redirect('/anmelden')

  // Gelesen wird mit dem Dienst-Client: die Uebersicht verbindet drei Tabellen,
  // und `levelup_checks` ist bewusst ohne Lese-Policy fuer angemeldete Nutzer.
  const db = createAdminClient() as unknown as Db

  const { data: checks } = await db
    .from('levelup_checks')
    .select('id,token,firmenname,standort_ort,erhoben_am,score,kein_score,sv_lead_id')
    .eq('status', 'fertig')
    .order('erhoben_am', { ascending: false })
    .limit(200)

  const liste = (checks ?? []) as CheckZeile[]
  const ids = liste.map((c) => c.id)

  // Termine und Lead-Status in je einem Zug — nicht je Zeile einzeln.
  //
  // ⚠ Die Fehler werden GEPRUEFT. Beim Durchlauf am 20.08. stand hier
  // `start_am` statt `slot_start`; supabase-js gibt bei einer unbekannten
  // Spalte einen Fehler zurueck, ohne zu werfen — die Liste zeigte danach bei
  // jedem Vorgang „kein Termin", obwohl zwei vorlagen. Ein verworfener
  // `error` ist eine Nachricht, die niemand liest.
  const [terminAntwort, leadAntwort] = await Promise.all([
    ids.length
      ? db.from('levelup_termine').select('check_id,slot_start').in('check_id', ids)
      : Promise.resolve({ data: [], error: null }),
    liste.some((c) => c.sv_lead_id)
      ? db.from('sv_leads').select('id,claim_status')
          .in('id', liste.map((c) => c.sv_lead_id).filter((x): x is string => Boolean(x)))
      : Promise.resolve({ data: [], error: null }),
  ])
  if (terminAntwort.error) console.error('Termine nicht lesbar:', terminAntwort.error.message)
  if (leadAntwort.error) console.error('Leads nicht lesbar:', leadAntwort.error.message)

  const termine = terminAntwort.data
  const leads = leadAntwort.data

  const terminNach = new Map(
    ((termine ?? []) as { check_id: string; slot_start: string }[]).map((t) => [t.check_id, t.slot_start]),
  )
  const claimNach = new Map(
    ((leads ?? []) as { id: string; claim_status: string | null }[]).map((l) => [l.id, l.claim_status]),
  )

  const zeilen: VertriebsZeile[] = liste.map((c) => ({
    checkId: c.id,
    token: c.token,
    firmenname: c.firmenname,
    ort: c.standort_ort,
    erhobenAm: c.erhoben_am,
    score: c.score,
    keinScore: c.kein_score,
    terminAm: terminNach.get(c.id) ?? null,
    svLeadId: c.sv_lead_id,
    claimStatus: c.sv_lead_id ? (claimNach.get(c.sv_lead_id) ?? null) : null,
  }))

  const geordnet = ordneFuerVertrieb(zeilen)
  const mitTermin = geordnet.filter((z) => z.terminAm).length

  return (
    <main className="min-h-dvh bg-nacht text-chrom">
      <div className="mx-auto max-w-[1180px] px-[26px] py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="display text-sm tracking-[0.16em] text-signal">Vertriebsansicht</p>
            <h1 className="display mt-2 text-white" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.8rem)' }}>
              {geordnet.length} {geordnet.length === 1 ? 'Auswertung' : 'Auswertungen'}
            </h1>
          </div>
          <form action={abmelden}>
            <button type="submit" className="text-sm text-white/50 underline underline-offset-4 hover:text-white/80">
              Abmelden
            </button>
          </form>
        </div>

        <p className="mt-3 max-w-[64ch] text-[1.02rem] leading-relaxed text-white/75">
          {mitTermin > 0
            ? `${mitTermin} ${mitTermin === 1 ? 'Vorgang wartet' : 'Vorgänge warten'} auf einen Rückruf — sie stehen oben, unabhängig vom Alter des Checks.`
            : 'Zurzeit wartet kein Vorgang auf einen Rückruf. Die neuesten Checks stehen oben.'}
        </p>

        {geordnet.length === 0 ? (
          <p className="mt-12 text-white/60">
            Noch keine abgeschlossene Messung. Sobald ein Check durchgelaufen ist, erscheint er hier.
          </p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/15 text-left text-xs uppercase tracking-wider text-white/45">
                  <th className="px-3 py-3 font-normal">Büro</th>
                  <th className="px-3 py-3 font-normal">Ort</th>
                  <th className="px-3 py-3 font-normal">Gemessen</th>
                  <th className="px-3 py-3 font-normal">Ergebnis</th>
                  <th className="px-3 py-3 font-normal">Termin</th>
                  <th className="px-3 py-3 font-normal">Lead</th>
                  <th className="px-3 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {geordnet.map((z) => (
                  <tr key={z.checkId} className="border-b border-white/8 hover:bg-white/[0.03]">
                    <td className="px-3 py-3.5 text-white">{z.firmenname ?? <span className="text-white/40">ohne Namen</span>}</td>
                    <td className="px-3 py-3.5 text-white/70">{z.ort ?? '—'}</td>
                    <td className="px-3 py-3.5 text-white/70">
                      {z.erhobenAm ? new Date(z.erhobenAm).toLocaleDateString('de-DE') : '—'}
                    </td>
                    <td className="px-3 py-3.5">
                      {z.keinScore || z.score === null
                        ? <span className="text-white/50">Teilbefund</span>
                        : <span className="text-white">{z.score} von 100</span>}
                    </td>
                    <td className="px-3 py-3.5">
                      {z.terminAm
                        ? <span className="text-signal">{new Date(z.terminAm).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        : <span className="text-white/35">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-white/70">
                      {!z.svLeadId ? <span className="text-white/35">—</span>
                        : z.claimStatus === 'offen' ? 'konvertierbar'
                        : (z.claimStatus ?? 'verknüpft')}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/check/${z.token}`}
                          target="_blank"
                          className="text-xs text-white/45 underline underline-offset-4 hover:text-white/80"
                        >
                          Kundensicht
                        </Link>
                        <LinkKnopf checkId={z.checkId} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
