import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AbrechnungenListClient from './AbrechnungenListClient'
import { letzterReminderAm } from '@/lib/abrechnungen/reminder-recency'

// KFZ-149 Hund-D: Admin-Listing aller (SV) Monatsabrechnungen mit Filter
// (Offen / Faellig / Bezahlt / Fehlgeschlagen / Alle), Detail-Drilldown auf
// Stripe-Link, Retry-Einzug-Button und Manuell-bezahlt-Button.

export const dynamic = 'force-dynamic'

export default async function AbrechnungenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // Letzte 200 Abrechnungen laden — fuer den Anfang reicht das, spaeter
  // Pagination wenn Aaron 1000+ pro Monat erreicht.
  // FG5 C5b: reminder_gesendet_am wird NICHT mehr aus abrechnungen gelesen —
  // stattdessen embed abrechnung_reminders(versendet_am) und derive via letzterReminderAm().
  const { data, error } = await supabase
    .from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_typ, empfaenger_id, empfaenger_name, empfaenger_email, summe_netto, summe_brutto, status, faellig_am, versand_datum, bezahlt_am, bezahlt_betrag, einzug_versucht_am, einzug_fehler, stripe_payment_intent_id, storniert_am, storniert_grund, ersetzt_durch_abrechnung_id, positionen, created_at, notiz, abrechnung_reminders(versendet_am)')
    .order('faellig_am', { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) {
    console.error('[KFZ-149 admin/abrechnungen] Query-Fehler:', error.message)
  }

  const rows = (data ?? []).map(r => {
    // Normalize nested FK: Supabase can return Array or single object depending on cardinality.
    // abrechnung_reminders has a FK to abrechnungen (many-to-one from reminders side),
    // so from the abrechnungen side this is a one-to-many => always an array.
    const reminders = Array.isArray(r.abrechnung_reminders)
      ? r.abrechnung_reminders
      : r.abrechnung_reminders != null
        ? [r.abrechnung_reminders]
        : []
    return {
      id: r.id as string,
      abrechnungs_nr: r.abrechnungs_nr as string,
      empfaenger_typ: (r.empfaenger_typ as string) ?? null,
      empfaenger_name: (r.empfaenger_name as string) ?? null,
      empfaenger_email: (r.empfaenger_email as string) ?? null,
      summe_netto: Number(r.summe_netto ?? 0),
      summe_brutto: Number(r.summe_brutto ?? 0),
      status: (r.status as string) ?? 'entwurf',
      faellig_am: (r.faellig_am as string) ?? null,
      versand_datum: (r.versand_datum as string) ?? null,
      bezahlt_am: (r.bezahlt_am as string) ?? null,
      bezahlt_betrag: r.bezahlt_betrag != null ? Number(r.bezahlt_betrag) : null,
      einzug_versucht_am: (r.einzug_versucht_am as string) ?? null,
      einzug_fehler: (r.einzug_fehler as string) ?? null,
      stripe_payment_intent_id: (r.stripe_payment_intent_id as string) ?? null,
      // FG5 C5b: derived from abrechnung_reminders — replaces stored reminder_gesendet_am
      reminder_gesendet_am: letzterReminderAm(
        reminders.map((rem: { versendet_am: string | null }) => ({ versendet_am: rem.versendet_am }))
      ),
      storniert_am: (r.storniert_am as string) ?? null,
      storniert_grund: (r.storniert_grund as string) ?? null,
      ersetzt_durch_abrechnung_id: (r.ersetzt_durch_abrechnung_id as string) ?? null,
      positionen: (r.positionen as Record<string, unknown>[]) ?? null,
      created_at: (r.created_at as string) ?? null,
      notiz: (r.notiz as string) ?? null,
    }
  })

  return <AbrechnungenListClient rows={rows} />
}
