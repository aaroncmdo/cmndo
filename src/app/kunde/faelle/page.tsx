// AAR-103: Kunden-Faelle-Liste (Multi-Fall Trennung)
// AAR-449: Karten-Upgrade mit nächstem Termin, Action-Hint, „zuletzt aktualisiert"
// CMM-28: claim-zentrierter Loader ersetzt direkten View-Read.
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { FolderOpenIcon } from 'lucide-react'
import FallKarte from '@/components/kunde/FallKarte'
import { ladeFallKartenMeta } from '@/lib/kunde/fall-karte-loader'
import { getKundeFaelle } from '@/lib/claims/get-kunde-faelle'
import EmptyState from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

export default async function KundeFaelleListe() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const faelleTyped = await getKundeFaelle(admin, user.id, user.email ?? null)
  const faelle = faelleTyped as unknown as Record<string, unknown>[]

  // CMM-28: Auto-Redirect bei Single-Fall — wird in der Praxis selten
  // erreicht, weil KundeNav bei Single-Fall direkt auf die Detail-Page linkt.
  // Bleibt als Fallback für Bookmarks / direkte URL-Eingabe.
  if (faelle && faelle.length === 1) {
    redirect(`/kunde/faelle/${faelle[0].id}`)
  }

  if (!faelle || faelle.length === 0) {
    return (
      <div className="p-5 max-w-2xl mx-auto space-y-3">
        <h1
          className="text-xl font-bold"
          style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
        >
          Meine Fälle
        </h1>
        <EmptyState
          icon={FolderOpenIcon}
          title="Noch kein Schadensfall"
          description="Sobald Sie einen Schaden melden, erscheint er hier mit Live-Status — Sie sehen jeden Schritt von der Termin-Vereinbarung bis zur Auszahlung."
          actions={[
            { label: 'Schaden melden', href: '/schaden-melden/schritt-1' },
          ]}
        />
      </div>
    )
  }

  const metaByFall = await ladeFallKartenMeta(
    faelle.map((f) => ({
      id: f.id as string,
      onboarding_complete: f.onboarding_complete as boolean | null,
      sa_unterschrieben: f.sa_unterschrieben as boolean | null,
      vollmacht_status: f.vollmacht_status as string | null,
      vollmacht_signiert_am: f.vollmacht_signiert_am as string | null,
      gutachter_termin_status: f.gutachter_termin_status as string | null,
      sv_termin: f.sv_termin as string | null,
      gutachter_termin_bestaetigt_am: f.gutachter_termin_bestaetigt_am as string | null,
      anschlussschreiben_am: f.anschlussschreiben_am as string | null,
      regulierung_am: f.regulierung_am as string | null,
      polizei_vor_ort: f.polizei_vor_ort as boolean | null,
      status: f.status as string | null,
      abgeschlossen_am: f.abgeschlossen_am as string | null,
      besichtigungsort_adresse: f.besichtigungsort_adresse as string | null,
      schadens_adresse: f.schadens_adresse as string | null,
      schadens_plz: f.schadens_plz as string | null,
      schadens_ort: f.schadens_ort as string | null,
    })),
  )

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-4">
      <div>
        <h1
          className="text-xl font-bold"
          style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
        >
          Meine Fälle
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--brand-text-secondary, #6b7280)' }}
        >
          Sie haben {faelle.length} aktive Fälle bei uns.
        </p>
      </div>
      <div className="space-y-3">
        {faelle.map((f) => {
          const meta = metaByFall[f.id as string] ?? {
            aktion: null,
            nextTermin: null,
            lastUpdate: null,
          }
          return (
            <FallKarte
              key={f.id as string}
              fall={{
                id: f.id as string,
                fall_nummer: f.fall_nummer as string | null,
                status: f.status as string | null,
                kennzeichen: f.kennzeichen as string | null,
                fahrzeug_hersteller: f.fahrzeug_hersteller as string | null,
                fahrzeug_modell: f.fahrzeug_modell as string | null,
                schadens_datum: f.schadens_datum as string | null,
                sa_unterschrieben: f.sa_unterschrieben as boolean | null,
                gutachten_eingegangen_am: f.gutachten_eingegangen_am as string | null,
                regulierung_am: f.regulierung_am as string | null,
                abgeschlossen_am: f.abgeschlossen_am as string | null,
                vollmacht_signiert_am: f.vollmacht_signiert_am as string | null,
                kanzlei_wunsch: f.kanzlei_wunsch as string | null,
              }}
              aktion={meta.aktion}
              nextTermin={meta.nextTermin}
              lastUpdate={meta.lastUpdate}
            />
          )
        })}
      </div>
    </div>
  )
}
