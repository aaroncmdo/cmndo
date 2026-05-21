import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { WalletIcon, PackageIcon, FileTextIcon, DownloadIcon, InfoIcon } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard (10 Fälle/Monat)', 'starter-10': 'Standard (10 Fälle/Monat)',
  pro: 'Pro (25 Fälle/Monat)', 'standard-25': 'Pro (25 Fälle/Monat)',
  premium: 'Premium (50 Fälle/Monat)', 'premium-50': 'Premium (50 Fälle/Monat)',
}

const COMPLETED_STATUSES = [
  'gutachten-eingegangen',
  'filmcheck',
  'kanzlei-uebergeben',
  'regulierung',
  'abgeschlossen',
]

export default async function AbrechnungPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Get the SV record
  const sv = await getGutachterForUser<{
    id: string
    paket: string | null
    offene_faelle: number | null
    paket_faelle_genutzt: number | null
    paket_faelle_gesamt: number | null
    paket_umkreis_km: number | null
    anzahlung_betrag: number | null
    anzahlung_status: string | null
    onboarding_anzahlung_betrag: number | null
    stripe_anzahlung_bezahlt_am: string | null
  }>(supabase, user.id, 'id, paket, offene_faelle, paket_faelle_genutzt, paket_faelle_gesamt, paket_umkreis_km, anzahlung_betrag, anzahlung_status, onboarding_anzahlung_betrag, stripe_anzahlung_bezahlt_am')

  if (!sv) {
    return (
      <div className="h-full flex flex-col">
        <div className="w-full">
          <EmptyState title="Kein Sachverständigen-Profil gefunden." />
        </div>
      </div>
    )
  }

  // ARCH-1 POLISH Befund 2: SV sieht NICHT mehr seinen Live-Werbebudget-Stand,
  // sondern lediglich die einmalig geleistete Anzahlung als Info.
  // AAR-243: Mehrere Spalten möglich für Betrag + Status. Fallback-Kette:
  // - onboarding_anzahlung_betrag (neuer Standard seit Stripe-Integration)
  // - anzahlung_betrag (legacy)
  // Status: anzahlung_status='bezahlt' ODER stripe_anzahlung_bezahlt_am gesetzt.
  const anzahlungBetrag = Number(sv.onboarding_anzahlung_betrag ?? sv.anzahlung_betrag ?? 0)
  const anzahlungBezahlt =
    sv.anzahlung_status === 'bezahlt' ||
    !!sv.stripe_anzahlung_bezahlt_am

  // Fetch abrechnungen from the real billing table
  const { data: abrechnungen } = await supabase
    .from('gutachter_abrechnungen')
    .select('id, fall_id, schadenhoehe, leadpreis, preistyp, abgerechnet_am')
    .eq('sv_id', sv.id)
    .order('abgerechnet_am', { ascending: false })

  // Build a lookup: fall_id → abrechnung
  const abrMap: Record<string, { leadpreis: number; preistyp: string }> = {}
  for (const a of abrechnungen ?? []) {
    if (a.fall_id) abrMap[a.fall_id] = { leadpreis: Number(a.leadpreis), preistyp: a.preistyp ?? '' }
  }

  // Fetch completed cases
  // CMM-44 SP-G PR2: gutachten_betrag/gutachten_eingegangen_am → gutachten.gesamt_schadensbetrag/fertiggestellt_am.
  const { data: completedFaelle } = await supabase
    .from('faelle')
    .select('id, status, created_at, lead_id, claims:claim_id(claim_nummer, gutachten(gesamt_schadensbetrag, fertiggestellt_am))')
    .eq('sv_id', sv.id)
    .in('status', COMPLETED_STATUSES)
    .order('created_at', { ascending: false })

  // Fetch einzahlungen
  const { data: einzahlungen } = await supabase
    .from('gutachter_einzahlungen')
    .select('id, betrag, typ, beschreibung, eingezahlt_am')
    .eq('sv_id', sv.id)
    .order('eingezahlt_am', { ascending: false })

  // AAR-559 (C10): Technische Stellungnahmen — Aufträge + Status für diesen SV.
  // Kein separates Honorar-Feld in der DB, daher nur Status-Übersicht.
  const { data: stellungnahmen } = await supabase
    .from('faelle')
    .select(
      'id, technische_stellungnahme_status, technische_stellungnahme_beauftragt_am, technische_stellungnahme_hochgeladen_am, technische_stellungnahme_freigabe_am, vs_kuerzungs_typ, claims:claim_id(claim_nummer)',
    )
    .eq('sv_id', sv.id)
    .not('technische_stellungnahme_status', 'is', null)
    .order('technische_stellungnahme_beauftragt_am', { ascending: false })

  // Fetch lead names
  const leadIds = [...new Set((completedFaelle ?? []).map((f) => f.lead_id).filter(Boolean))] as string[]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }

  const leadMap: Record<string, { vorname: string | null; nachname: string | null }> = {}
  for (const l of leads ?? []) {
    leadMap[l.id] = l
  }

  const paketLabel = PAKET_LABELS[sv.paket ?? ''] ?? sv.paket ?? 'Kein Paket'
  const offeneFaelle = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
  const maxFaelle = sv.paket_faelle_gesamt ?? 10
  const auslastungProzent = maxFaelle > 0 ? Math.min(Math.round((offeneFaelle / maxFaelle) * 100), 100) : 0

  // Progress bar color based on utilization
  let progressColor = 'bg-[var(--brand-secondary)]'
  if (auslastungProzent >= 90) {
    progressColor = 'bg-red-500'
  } else if (auslastungProzent >= 70) {
    progressColor = 'bg-amber-500'
  }

  // Einnahmen-Dashboard Daten (KFZ-88)
  const totalLeadpreise = (abrechnungen ?? []).reduce((s, a) => s + Number(a.leadpreis ?? 0), 0)
  // CMM-44 SP-G PR2: gesamt_schadensbetrag + fertiggestellt_am aus gutachten-Embed (SSoT).
  type CompletedFall = NonNullable<typeof completedFaelle>[number]
  function getGutachtenBetrag(fall: CompletedFall): number | null {
    const c = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
    const g = Array.isArray((c as { gutachten?: unknown } | null)?.gutachten)
      ? ((c as { gutachten: unknown[] }).gutachten)[0]
      : (c as { gutachten?: unknown } | null)?.gutachten
    const v = (g as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag
    return v != null ? Number(v) : null
  }
  function getGutachtenDatum(fall: CompletedFall): string | null {
    const c = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
    const g = Array.isArray((c as { gutachten?: unknown } | null)?.gutachten)
      ? ((c as { gutachten: unknown[] }).gutachten)[0]
      : (c as { gutachten?: unknown } | null)?.gutachten
    return (g as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am ?? null
  }
  const faelleAbgerechnet = (completedFaelle ?? []).filter(f => getGutachtenBetrag(f) != null).length
  const totalEingegangen = (completedFaelle ?? []).filter(f => ['abgeschlossen', 'regulierung'].includes(f.status)).reduce((s, f) => s + (getGutachtenBetrag(f) ?? 0) * 0.12, 0) // ~12% Gutachterhonorar
  const totalOffen = (completedFaelle ?? []).filter(f => !['abgeschlossen', 'storniert'].includes(f.status) && getGutachtenBetrag(f) != null).reduce((s, f) => s + (getGutachtenBetrag(f) ?? 0) * 0.12, 0)
  const faelleOffen = (completedFaelle ?? []).filter(f => !['abgeschlossen', 'storniert'].includes(f.status) && getGutachtenBetrag(f) != null).length

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 bg-white border-b border-claimondo-border px-4 py-2">
        <PageHeader
          title="Abrechnung"
          description="Übersicht Ihrer Abrechnungen und Pakete"
          actions={
            <Link
              href="/gutachter/leadpreise"
              className="text-xs font-medium text-[var(--brand-secondary)] hover:text-[var(--brand-primary)] underline underline-offset-2 whitespace-nowrap"
            >
              Aktuelle Lead-Preis-Tabelle einsehen
            </Link>
          }
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Einnahmen-Dashboard (KFZ-88) */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-green-200 rounded-ios-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalEingegangen)}</p>
            <p className="text-[10px] text-claimondo-ondo mt-1">Eingegangen</p>
            <p className="text-[9px] text-claimondo-ondo/70">{faelleAbgerechnet} Fälle</p>
          </div>
          <div className="bg-white border border-amber-200 rounded-ios-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalOffen)}</p>
            <p className="text-[10px] text-claimondo-ondo mt-1">Offen</p>
            <p className="text-[9px] text-claimondo-ondo/70">{faelleOffen} Fälle in Regulierung</p>
          </div>
          <div className="bg-white border border-[var(--brand-secondary)]/20 rounded-ios-xl p-4 text-center">
            <p className="text-2xl font-bold text-[var(--brand-secondary)]">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalEingegangen - totalLeadpreise)}</p>
            <p className="text-[10px] text-claimondo-ondo mt-1">Netto-Verdienst</p>
            <p className="text-[9px] text-claimondo-ondo/70">Ø {faelleAbgerechnet > 0 ? Math.round(totalEingegangen / faelleAbgerechnet) : 0}€/Fall</p>
          </div>
        </div>

        {/* Top cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Anzahlung (Initial-Wert, KEIN Live-Stand) — ARCH-1 POLISH Befund 2 */}
          <div className="bg-white rounded-2xl border border-claimondo-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-ios-xl bg-emerald-50 flex items-center justify-center">
                <WalletIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-claimondo-ondo text-sm font-medium">Anzahlung</p>
                <p className="text-claimondo-ondo/70 text-[11px]">Einmalig geleistet</p>
              </div>
            </div>
            {anzahlungBezahlt && anzahlungBetrag > 0 ? (
              <>
                <p className="text-3xl font-bold text-claimondo-navy tabular-nums">
                  {anzahlungBetrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                </p>
                <p className="text-claimondo-ondo text-xs mt-1">Du hast einmalig diesen Betrag als Anzahlung geleistet.</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-bold text-claimondo-ondo/70 tabular-nums">— EUR</p>
                <p className="text-claimondo-ondo/70 text-xs mt-1">Noch keine Anzahlung eingegangen.</p>
              </>
            )}
            <p className="text-claimondo-ondo/70 text-[10px] mt-3 flex items-start gap-1">
              <InfoIcon className="w-3 h-3 mt-0.5 shrink-0" />
              <span>Die Verrechnung deiner Lead-Preise findest du in der Monatsabrechnung.</span>
            </p>
          </div>

          {/* Paket-Auslastung */}
          <div className="bg-white rounded-2xl border border-claimondo-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-ios-xl bg-[var(--brand-secondary)]/5 flex items-center justify-center">
                <PackageIcon className="w-5 h-5 text-[var(--brand-accent)]" />
              </div>
              <div>
                <p className="text-claimondo-ondo text-sm font-medium">Paket-Auslastung</p>
                <p className="text-claimondo-ondo/70 text-xs">{paketLabel}</p>
              </div>
            </div>
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-bold text-claimondo-navy tabular-nums">
                {offeneFaelle} / {maxFaelle}
              </p>
              <p className="text-claimondo-ondo text-sm tabular-nums">{auslastungProzent}%</p>
            </div>
            <div className="w-full h-2 bg-claimondo-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressColor}`}
                style={{ width: `${auslastungProzent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Abgerechnete Fälle */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <FileTextIcon className="w-5 h-5 text-claimondo-ondo" />
            <h2 className="text-lg font-semibold text-claimondo-navy">Abgerechnete Fälle</h2>
            <span className="text-claimondo-ondo/70 text-sm ml-auto">{completedFaelle?.length ?? 0} Fälle</span>
          </div>

          {!completedFaelle?.length ? (
            <EmptyState title="Noch keine abgerechneten Fälle vorhanden." />
          ) : (
            <>
              {/* Desktop table */}
              <DataTableContainer variant="plain" className="hidden sm:block bg-white rounded-2xl overflow-hidden border border-claimondo-border">
                <Table>
                    <Thead className="!bg-transparent !text-sm !normal-case !tracking-normal">
                      <Tr className="border-b border-claimondo-border">
                        <Th className="text-claimondo-ondo whitespace-nowrap">Fall-Nr.</Th>
                        <Th className="text-claimondo-ondo">Kunde</Th>
                        <Th className="text-right text-claimondo-ondo whitespace-nowrap">Schadenhöhe</Th>
                        <Th className="text-right text-claimondo-ondo whitespace-nowrap">Leadpreis</Th>
                        <Th className="text-claimondo-ondo">Datum</Th>
                      </Tr>
                    </Thead>
                    <Tbody className="!divide-y-0">
                      {completedFaelle.map((fall) => {
                        const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                        const name = lead
                          ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                          : '—'
                        const gutachtenBetrag = getGutachtenBetrag(fall)
                        const betrag = gutachtenBetrag != null
                          ? gutachtenBetrag.toLocaleString('de-DE', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }) + ' EUR'
                          : '—'
                        const abr = abrMap[fall.id]
                        const leadpreisStr = abr
                          ? abr.leadpreis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
                          : '—'
                        const gutachtenDatum = getGutachtenDatum(fall)
                        const datum = gutachtenDatum
                          ? new Date(gutachtenDatum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : fall.created_at
                            ? new Date(fall.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                            : '—'

                        return (
                          <Tr
                            key={fall.id}
                            className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40 transition-colors"
                          >
                            <Td>
                              <span className="text-[var(--brand-accent)] font-mono text-xs">
                                {(Array.isArray(fall.claims) ? fall.claims[0] : fall.claims)?.claim_nummer ?? fall.id.slice(0, 8)}
                              </span>
                            </Td>
                            <Td>{name}</Td>
                            <Td className="text-right tabular-nums">{betrag}</Td>
                            <Td className="text-right tabular-nums">
                              {abr ? (
                                <span className={abr.preistyp === 'einzel' ? 'text-amber-400' : 'text-claimondo-navy'}>
                                  {leadpreisStr}
                                  {abr.preistyp === 'einzel' && <span className="text-amber-500 text-[10px] ml-1">Einzel</span>}
                                </span>
                              ) : (
                                <span className="text-claimondo-ondo text-xs">—</span>
                              )}
                            </Td>
                            <Td className="!text-claimondo-ondo text-xs whitespace-nowrap">{datum}</Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
              </DataTableContainer>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {completedFaelle.map((fall) => {
                  const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                  const name = lead
                    ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                    : '—'
                  const gutachtenBetrag2 = getGutachtenBetrag(fall)
                  const betrag = gutachtenBetrag2 != null
                    ? gutachtenBetrag2.toLocaleString('de-DE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }) + ' EUR'
                    : '—'
                  const abr = abrMap[fall.id]
                  const leadpreisStr = abr
                    ? abr.leadpreis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
                    : '—'
                  const gutachtenDatum2 = getGutachtenDatum(fall)
                  const datum = gutachtenDatum2
                    ? new Date(gutachtenDatum2).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : fall.created_at
                      ? new Date(fall.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'

                  return (
                    <div
                      key={fall.id}
                      className="bg-white rounded-2xl p-4 border border-claimondo-border"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-[var(--brand-accent)] font-mono text-xs">
                            {(Array.isArray(fall.claims) ? fall.claims[0] : fall.claims)?.claim_nummer ?? fall.id.slice(0, 8)}
                          </span>
                          <p className="text-claimondo-navy text-sm font-medium mt-0.5">{name}</p>
                        </div>
                        <span className="text-claimondo-ondo text-xs">{datum}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="text-claimondo-ondo text-xs">Schadenhöhe</span>
                          <p className="text-claimondo-navy tabular-nums">{betrag}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-claimondo-ondo text-xs">Leadpreis</span>
                          <p className={abr ? (abr.preistyp === 'einzel' ? 'text-amber-400' : 'text-claimondo-navy') : 'text-claimondo-ondo'}>
                            {leadpreisStr}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* AAR-559 (C10): Technische Stellungnahmen — Status-Übersicht.
            Kein Honorar-Feld vorhanden, daher rein informativ. */}
        {(stellungnahmen?.length ?? 0) > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <FileTextIcon className="w-5 h-5 text-claimondo-ondo" />
              <h2 className="text-lg font-semibold text-claimondo-navy">Technische Stellungnahmen</h2>
              <span className="text-claimondo-ondo/70 text-sm ml-auto">{stellungnahmen?.length ?? 0} Aufträge</span>
            </div>

            {/* Desktop table */}
            <DataTableContainer variant="plain" className="hidden sm:block bg-white rounded-2xl overflow-hidden border border-claimondo-border">
              <Table>
                <Thead className="!bg-transparent !text-sm !normal-case !tracking-normal">
                  <Tr className="border-b border-claimondo-border">
                    <Th className="text-claimondo-ondo whitespace-nowrap">Fall-Nr.</Th>
                    <Th className="text-claimondo-ondo">Anlass</Th>
                    <Th className="text-claimondo-ondo">Status</Th>
                    <Th className="text-claimondo-ondo whitespace-nowrap">Beauftragt</Th>
                    <Th className="text-claimondo-ondo whitespace-nowrap">Hochgeladen</Th>
                    <Th className="text-claimondo-ondo whitespace-nowrap">Freigegeben</Th>
                  </Tr>
                </Thead>
                <Tbody className="!divide-y-0">
                  {stellungnahmen!.map((s) => {
                    const status = (s.technische_stellungnahme_status ?? '') as string
                    const statusLabel =
                      status === 'beauftragt' ? 'Beauftragt' :
                      status === 'hochgeladen' ? 'Hochgeladen' :
                      status === 'freigegeben' ? 'Freigegeben' : status
                    const statusColor =
                      status === 'beauftragt' ? 'bg-amber-50 text-amber-700' :
                      status === 'hochgeladen' ? 'bg-claimondo-bg text-claimondo-ondo' :
                      status === 'freigegeben' ? 'bg-emerald-50 text-emerald-700' :
                      'bg-claimondo-bg text-claimondo-navy'
                    const fmt = (iso: string | null) =>
                      iso
                        ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '—'
                    return (
                      <Tr key={s.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40 transition-colors">
                        <Td>
                          <Link
                            href={`/gutachter/faelle/${s.id}`}
                            className="text-[var(--brand-accent)] font-mono text-xs hover:underline"
                          >
                            {(Array.isArray(s.claims) ? s.claims[0] : s.claims)?.claim_nummer ?? (s.id as string).slice(0, 8)}
                          </Link>
                        </Td>
                        <Td className="text-xs">
                          {((s.vs_kuerzungs_typ as string | null) ?? 'technisch')}
                        </Td>
                        <Td>
                          <span className={`px-2 py-0.5 rounded-ios-md text-xs font-medium ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </Td>
                        <Td className="!text-claimondo-ondo text-xs whitespace-nowrap">{fmt(s.technische_stellungnahme_beauftragt_am as string | null)}</Td>
                        <Td className="!text-claimondo-ondo text-xs whitespace-nowrap">{fmt(s.technische_stellungnahme_hochgeladen_am as string | null)}</Td>
                        <Td className="!text-claimondo-ondo text-xs whitespace-nowrap">{fmt(s.technische_stellungnahme_freigabe_am as string | null)}</Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </DataTableContainer>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {stellungnahmen!.map((s) => {
                const status = (s.technische_stellungnahme_status ?? '') as string
                const statusLabel =
                  status === 'beauftragt' ? 'Beauftragt' :
                  status === 'hochgeladen' ? 'Hochgeladen' :
                  status === 'freigegeben' ? 'Freigegeben' : status
                const statusColor =
                  status === 'beauftragt' ? 'bg-amber-50 text-amber-700' :
                  status === 'hochgeladen' ? 'bg-claimondo-bg text-claimondo-ondo' :
                  status === 'freigegeben' ? 'bg-emerald-50 text-emerald-700' :
                  'bg-claimondo-bg text-claimondo-navy'
                const fmt = (iso: string | null) =>
                  iso
                    ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '—'
                return (
                  <div key={s.id} className="bg-white rounded-2xl p-4 border border-claimondo-border">
                    <div className="flex items-start justify-between mb-2">
                      <Link href={`/gutachter/faelle/${s.id}`} className="text-[var(--brand-accent)] font-mono text-xs hover:underline">
                        {(Array.isArray(s.claims) ? s.claims[0] : s.claims)?.claim_nummer ?? (s.id as string).slice(0, 8)}
                      </Link>
                      <span className={`px-2 py-0.5 rounded-ios-md text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <p className="text-claimondo-ondo/70">Beauftragt</p>
                        <p className="text-claimondo-navy">{fmt(s.technische_stellungnahme_beauftragt_am as string | null)}</p>
                      </div>
                      <div>
                        <p className="text-claimondo-ondo/70">Hochgeladen</p>
                        <p className="text-claimondo-navy">{fmt(s.technische_stellungnahme_hochgeladen_am as string | null)}</p>
                      </div>
                      <div>
                        <p className="text-claimondo-ondo/70">Freigegeben</p>
                        <p className="text-claimondo-navy">{fmt(s.technische_stellungnahme_freigabe_am as string | null)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Einzahlungen */}
        {(einzahlungen?.length ?? 0) > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-claimondo-navy mb-4">Einzahlungen</h2>
            <DataTableContainer variant="plain" className="bg-white rounded-2xl overflow-hidden border border-claimondo-border">
              <Table>
                <Thead className="!bg-transparent !text-sm !normal-case !tracking-normal">
                  <Tr className="border-b border-claimondo-border">
                    <Th className="text-claimondo-ondo">Typ</Th>
                    <Th className="text-right text-claimondo-ondo">Betrag</Th>
                    <Th className="text-claimondo-ondo">Beschreibung</Th>
                    <Th className="text-claimondo-ondo">Datum</Th>
                  </Tr>
                </Thead>
                <Tbody className="!divide-y-0">
                  {einzahlungen!.map(e => (
                    <Tr key={e.id} className="border-b border-claimondo-border/50">
                      <Td>
                        <span className="px-2 py-0.5 rounded-ios-md text-xs font-medium bg-emerald-50 text-emerald-400">
                          {e.typ === 'anzahlung' ? 'Anzahlung' : e.typ === 'nachzahlung' ? 'Nachzahlung' : 'Paketwechsel'}
                        </span>
                      </Td>
                      <Td className="!text-emerald-400 text-right tabular-nums font-medium">
                        +{Number(e.betrag).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                      </Td>
                      <Td className="!text-claimondo-ondo text-xs">{e.beschreibung ?? '—'}</Td>
                      <Td className="!text-claimondo-ondo text-xs whitespace-nowrap">
                        {new Date(e.eingezahlt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          </div>
        )}

        {/* Monatsabrechnung */}
        <div className="bg-white rounded-2xl border border-claimondo-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-claimondo-navy font-semibold">Monatsabrechnung</h2>
              <p className="text-claimondo-ondo text-sm mt-0.5">PDF-Export Ihrer monatlichen Abrechnung</p>
            </div>
            <button
              disabled
              className="flex items-center gap-2 bg-claimondo-bg text-claimondo-ondo text-sm font-medium py-2.5 px-4 rounded-ios-xl cursor-not-allowed opacity-50"
            >
              <DownloadIcon className="w-4 h-4" />
              PDF Download
            </button>
          </div>
          <p className="text-claimondo-ondo/70 text-xs mt-3">Coming soon — PDF-Abrechnungen werden in Kürze verfügbar sein.</p>
        </div>
      </div>
    </div>
  )
}
