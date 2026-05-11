import { createAdminClient } from '@/lib/supabase/admin'
import { createKanzleiCheckoutSession } from '@/lib/stripe/kanzlei-checkout'
import KanzleiCheckoutClient from './KanzleiCheckoutClient'

export const dynamic = 'force-dynamic'

// KFZ-188: Oeffentliche Magic-Link Seite fuer Kanzlei-Monatsabrechnung.
// Keine Authentifizierung erforderlich — Zugriff nur via Token.

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ payment?: string }>
}

export default async function KanzleiAbrechnungPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const { payment } = await searchParams

  const db = createAdminClient()

  // Abrechnung per Token laden
  const { data: abrechnung } = await db
    .from('kanzlei_abrechnungen')
    .select(`
      id,
      rechnungsnummer,
      abrechnungsmonat,
      abrechnungsjahr,
      anzahl_vollmachten,
      betrag_pro_vollmacht_netto,
      endbetrag_netto,
      mwst_betrag,
      endbetrag_brutto,
      status,
      faelligkeitsdatum,
      magic_link_expires_at,
      versendet_am,
      bezahlt_am,
      stripe_checkout_session_id,
      kanzlei_id
    `)
    .eq('magic_link_token', token)
    .limit(1)
    .maybeSingle()

  // Token nicht gefunden
  if (!abrechnung) {
    return (
      <main className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-claimondo-navy mb-2">Link ungueltig</h1>
          <p className="text-claimondo-ondo">Dieser Abrechnungslink ist nicht gueltig oder wurde bereits verwendet. Bitte kontaktieren Sie uns unter <a href="mailto:aaron.sprafke@claimondo.de" className="text-claimondo-ondo underline">aaron.sprafke@claimondo.de</a>.</p>
        </div>
      </main>
    )
  }

  // Token abgelaufen?
  const now = new Date()
  const expires = abrechnung.magic_link_expires_at ? new Date(abrechnung.magic_link_expires_at as string) : null
  if (expires && now > expires && abrechnung.status !== 'bezahlt') {
    return (
      <main className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-bold text-claimondo-navy mb-2">Link abgelaufen</h1>
          <p className="text-claimondo-ondo">Dieser Link ist nicht mehr gueltig. Bitte kontaktieren Sie uns unter <a href="mailto:aaron.sprafke@claimondo.de" className="text-claimondo-ondo underline">aaron.sprafke@claimondo.de</a> fuer einen neuen Link.</p>
        </div>
      </main>
    )
  }

  // Kanzlei-Daten laden
  const { data: kanzlei } = await db
    .from('kanzleien')
    .select('name, email, adresse, ust_id, iban, ansprechpartner')
    .eq('id', abrechnung.kanzlei_id)
    .single()

  // Positionen laden
  const { data: positionen } = await db
    .from('kanzlei_abrechnung_positionen')
    .select('id, fall_nr, kunde_name, vollmacht_unterschrieben_am, betrag_netto, position_nr')
    .eq('kanzlei_abrechnung_id', abrechnung.id)
    .order('position_nr', { ascending: true })

  const monatName = new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(
    new Date(Number(abrechnung.abrechnungsjahr), Number(abrechnung.abrechnungsmonat) - 1, 1),
  )

  // Bereits bezahlt
  if (abrechnung.status === 'bezahlt') {
    return (
      <main className="min-h-screen bg-claimondo-bg p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-3xl">✅</span>
              <div>
                <h1 className="text-2xl font-bold text-claimondo-navy">Bereits bezahlt</h1>
                <p className="text-claimondo-ondo">Diese Rechnung wurde am {abrechnung.bezahlt_am ? new Date(abrechnung.bezahlt_am as string).toLocaleDateString('de-DE') : '—'} bezahlt.</p>
              </div>
            </div>
            <div className="border rounded-xl p-4 bg-green-50 border-green-200">
              <p className="text-sm text-green-800">Rechnungsnummer: <strong>{abrechnung.rechnungsnummer}</strong></p>
              <p className="text-sm text-green-800">Betrag: <strong>{Number(abrechnung.endbetrag_brutto).toFixed(2).replace('.', ',')} €</strong> (brutto)</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  // Normale Rechnungsansicht
  return (
    <main className="min-h-screen bg-claimondo-bg p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-claimondo-navy rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-claimondo-light-blue text-sm">Claimondo GmbH</p>
              <h1 className="text-2xl font-bold mt-1">Monatsabrechnung</h1>
              <p className="text-claimondo-light-blue text-sm mt-1">{monatName} {abrechnung.abrechnungsjahr}</p>
            </div>
            <div className="text-right">
              <p className="text-claimondo-light-blue text-xs">Rechnungsnummer</p>
              <p className="font-mono font-bold">{abrechnung.rechnungsnummer}</p>
            </div>
          </div>
        </div>

        {/* Empfaenger */}
        {kanzlei && (
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider mb-3">Rechnungsempfaenger</h2>
            <p className="font-bold text-claimondo-navy">{kanzlei.name}</p>
            {kanzlei.ansprechpartner && <p className="text-claimondo-ondo">{kanzlei.ansprechpartner}</p>}
            {kanzlei.adresse && <p className="text-claimondo-ondo text-sm">{kanzlei.adresse}</p>}
            {kanzlei.ust_id && <p className="text-claimondo-ondo text-sm">USt-ID: {kanzlei.ust_id}</p>}
          </div>
        )}

        {payment === 'success' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-green-800">
            ✅ Zahlung eingegangen! Vielen Dank. Die Bestaetigung erhalten Sie per Email.
          </div>
        )}

        {/* Positionen */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">Positionen</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-claimondo-bg">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-claimondo-ondo">Nr.</th>
                  <th className="text-left px-4 py-3 font-medium text-claimondo-ondo">Fall-Nr.</th>
                  <th className="text-left px-4 py-3 font-medium text-claimondo-ondo">Kunde</th>
                  <th className="text-left px-4 py-3 font-medium text-claimondo-ondo">Vollmacht unterz.</th>
                  <th className="text-right px-4 py-3 font-medium text-claimondo-ondo">Netto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-claimondo-border">
                {(positionen ?? []).map((pos) => (
                  <tr key={pos.id} className="hover:bg-claimondo-bg">
                    <td className="px-4 py-3 text-claimondo-ondo">{pos.position_nr}</td>
                    <td className="px-4 py-3 font-mono text-xs text-claimondo-navy">{pos.fall_nr ?? '—'}</td>
                    <td className="px-4 py-3 text-claimondo-navy">{pos.kunde_name}</td>
                    <td className="px-4 py-3 text-claimondo-ondo">
                      {pos.vollmacht_unterschrieben_am
                        ? new Date(pos.vollmacht_unterschrieben_am as string).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-claimondo-navy">
                      {Number(pos.betrag_netto).toFixed(2).replace('.', ',')} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summen */}
          <div className="p-6 border-t bg-claimondo-bg space-y-2">
            <div className="flex justify-between text-sm text-claimondo-ondo">
              <span>Zwischensumme netto ({abrechnung.anzahl_vollmachten} Vollmachten)</span>
              <span>{Number(abrechnung.endbetrag_netto).toFixed(2).replace('.', ',')} €</span>
            </div>
            <div className="flex justify-between text-sm text-claimondo-ondo">
              <span>MwSt. 19 %</span>
              <span>{Number(abrechnung.mwst_betrag).toFixed(2).replace('.', ',')} €</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-claimondo-navy pt-2 border-t">
              <span>Gesamtbetrag brutto</span>
              <span>{Number(abrechnung.endbetrag_brutto).toFixed(2).replace('.', ',')} €</span>
            </div>
            <p className="text-xs text-claimondo-ondo/70 pt-1">
              Faellig am: {abrechnung.faelligkeitsdatum ? new Date(abrechnung.faelligkeitsdatum as string).toLocaleDateString('de-DE') : '—'}
            </p>
          </div>
        </div>

        {/* Checkout Client */}
        <KanzleiCheckoutClient
          abrechnungId={abrechnung.id as string}
          token={token}
          endbetragBrutto={Number(abrechnung.endbetrag_brutto)}
          status={abrechnung.status as string}
          checkoutAction={async (id: string, tok: string) => {
            'use server'
            try {
              const url = await createKanzleiCheckoutSession(id, tok)
              return { url }
            } catch (err) {
              return { error: err instanceof Error ? err.message : String(err) }
            }
          }}
        />
      </div>
    </main>
  )
}
