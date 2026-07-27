// Werkstatt-Einstellungen-Seite: Profil, Bankdaten, Passwort, Account.
// Der (shell)-Layout-Guard (requirePortalAccess(['werkstatt']) + werkstatt.status=aktiv)
// ist bereits aktiv — kein Doppel-Guard hier noetig.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WerkstattSettings } from '@/components/werkstatt/WerkstattSettings'
import DsgvoLoeschSection from '@/components/shared/DsgvoLoeschSection'

export const dynamic = 'force-dynamic'

export default async function WerkstattEinstellungenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: werkstatt } = await supabase
    .from('werkstaetten')
    .select(
      'name, ansprechpartner_name, adresse_strasse, adresse_plz, adresse_ort, telefon, email, website, ust_id, ist_kleinunternehmer, bank_iban, bank_bic, bank_kontoinhaber, faehigkeiten, marken, ist_freie_werkstatt, fahrzeug_gruppen',
    )
    .eq('user_id', user.id)
    .maybeSingle()

  if (!werkstatt) redirect('/werkstatt/pending')

  return (
    <>
    <WerkstattSettings
      name={(werkstatt as unknown as { name: string | null }).name ?? null}
      ansprechpartner_name={(werkstatt as unknown as { ansprechpartner_name: string | null }).ansprechpartner_name ?? null}
      adresse_strasse={(werkstatt as unknown as { adresse_strasse: string | null }).adresse_strasse ?? null}
      adresse_plz={(werkstatt as unknown as { adresse_plz: string | null }).adresse_plz ?? null}
      adresse_ort={(werkstatt as unknown as { adresse_ort: string | null }).adresse_ort ?? null}
      telefon={(werkstatt as unknown as { telefon: string | null }).telefon ?? null}
      email={(werkstatt as unknown as { email: string | null }).email ?? null}
      website={(werkstatt as unknown as { website: string | null }).website ?? null}
      ust_id={(werkstatt as unknown as { ust_id: string | null }).ust_id ?? null}
      ist_kleinunternehmer={(werkstatt as unknown as { ist_kleinunternehmer: boolean | null }).ist_kleinunternehmer ?? null}
      bank_iban={(werkstatt as unknown as { bank_iban: string | null }).bank_iban ?? null}
      bank_bic={(werkstatt as unknown as { bank_bic: string | null }).bank_bic ?? null}
      bank_kontoinhaber={(werkstatt as unknown as { bank_kontoinhaber: string | null }).bank_kontoinhaber ?? null}
      faehigkeiten={(werkstatt as unknown as { faehigkeiten: string[] | null }).faehigkeiten ?? null}
      marken={(werkstatt as unknown as { marken: string[] | null }).marken ?? null}
      ist_freie_werkstatt={(werkstatt as unknown as { ist_freie_werkstatt: boolean | null }).ist_freie_werkstatt ?? null}
      fahrzeug_gruppen={(werkstatt as unknown as { fahrzeug_gruppen: string[] | null }).fahrzeug_gruppen ?? null}
    />
      <div className="mx-auto max-w-2xl px-4 pb-8">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo/70">
          Konto &amp; Datenschutz
        </p>
        <DsgvoLoeschSection />
      </div>
    </>
  )
}
