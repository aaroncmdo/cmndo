import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/shared/PageHeader'
import KanzleiAbrechnungenClient, { type AbrechnungRow } from './KanzleiAbrechnungenClient'

export const dynamic = 'force-dynamic'

/**
 * KFZ-188: Admin-Listing aller Kanzlei-Monatsabrechnungen.
 * Nur fuer Admin-Rolle zugaenglich.
 * Task-11: Split in Server (Daten) + Client (Billing-Drawer).
 */

export default async function KanzleiAbrechnungenPage() {
  // Auth pruefen
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // Daten laden mit Kanzlei-Join
  const db = createAdminClient()
  const { data, error } = await db
    .from('kanzlei_abrechnungen')
    .select(`
      id,
      rechnungsnummer,
      abrechnungsmonat,
      abrechnungsjahr,
      kanzlei_id,
      anzahl_vollmachten,
      endbetrag_brutto,
      status,
      faelligkeitsdatum,
      bezahlt_am,
      versendet_am,
      kanzleien ( name )
    `)
    .order('abrechnungsjahr', { ascending: false })
    .order('abrechnungsmonat', { ascending: false })
    .limit(300)

  if (error) {
    console.error('[KFZ-188 admin] Query-Fehler:', error.message)
  }

  const heute = new Date()
  const rows: AbrechnungRow[] = (data ?? []).map((r) => {
    const faellig = r.faelligkeitsdatum ? new Date(r.faelligkeitsdatum as string) : null
    let status = (r.status as string) ?? 'offen'
    // Dynamisch ueberfaellig markieren
    if (status === 'versendet' && faellig && heute > faellig) {
      status = 'ueberfaellig'
    }
    const kanzleiRaw = r.kanzleien as unknown
    const kanzleiName =
      kanzleiRaw && typeof kanzleiRaw === 'object' && 'name' in (kanzleiRaw as Record<string, unknown>)
        ? String((kanzleiRaw as Record<string, unknown>).name)
        : '—'
    return {
      id: r.id as string,
      rechnungsnummer: (r.rechnungsnummer as string) ?? '—',
      abrechnungsmonat: Number(r.abrechnungsmonat),
      abrechnungsjahr: Number(r.abrechnungsjahr),
      kanzlei_id: (r.kanzlei_id as string) ?? null,
      kanzlei_name: kanzleiName,
      anzahl_vollmachten: Number(r.anzahl_vollmachten ?? 0),
      endbetrag_brutto: Number(r.endbetrag_brutto ?? 0),
      status,
      faelligkeitsdatum: (r.faelligkeitsdatum as string) ?? null,
      bezahlt_am: (r.bezahlt_am as string) ?? null,
      versendet_am: (r.versendet_am as string) ?? null,
    }
  })

  // KPI
  const offen = rows.filter((r) => r.status === 'offen' || r.status === 'versendet').length
  const bezahlt = rows.filter((r) => r.status === 'bezahlt').length
  const ueberfaellig = rows.filter((r) => r.status === 'ueberfaellig').length
  const gesamtOffen = rows
    .filter((r) => r.status !== 'bezahlt' && r.status !== 'storniert')
    .reduce((acc, r) => acc + r.endbetrag_brutto, 0)

  return (
    <div className="py-6 space-y-6">
      <PageHeader title="Kanzlei-Abrechnungen" description="Monatsabrechnungen für alle aktiven Kanzleien" size="lg" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Offen</p>
          <p className="text-2xl font-bold text-warning mt-1">{offen}</p>
        </div>
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Bezahlt</p>
          <p className="text-2xl font-bold text-success mt-1">{bezahlt}</p>
        </div>
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Überfällig</p>
          <p className="text-2xl font-bold text-danger mt-1">{ueberfaellig}</p>
        </div>
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Offen gesamt</p>
          <p className="text-2xl font-bold text-claimondo-navy mt-1">{gesamtOffen.toFixed(2).replace('.', ',')} €</p>
        </div>
      </div>

      {/* Tabelle + Drawer (Client) */}
      <KanzleiAbrechnungenClient rows={rows} />
    </div>
  )
}
