import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KundeJetztZuTunCard from '@/components/kunde/KundeJetztZuTunCard'
// AAR-449: Neue FallKarte + Shared-Loader für Termin/Aktion/LastUpdate
import FallKarte from '@/components/kunde/FallKarte'
import { ladeFallKartenMeta, type FallKarteMetaInput } from '@/lib/kunde/fall-karte-loader'
import { type KundeAktion } from '@/lib/kunde/jetzt-zu-tun'

const AKTION_PRIO: Record<KundeAktion['prioritaet'], number> = { hoch: 3, mittel: 2, niedrig: 1 }

export default async function KundeStartseite() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  try {
  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname')
    .eq('id', user.id)
    .single()

  // Alle Faelle des Kunden — inkl. der Felder, die FallKarte + getKundenJetztZuTun benötigen.
  const FALL_SELECT =
    'id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadens_datum, sa_unterschrieben, sv_id, sv_termin, gutachten_eingegangen_am, gutachter_termin_status, gutachter_termin_bestaetigt_am, regulierung_am, anschlussschreiben_am, szenario, onboarding_complete, kunde_id, kundenbetreuer_id, polizei_vor_ort, vollmacht_status, vollmacht_signiert_am, abgeschlossen_am, besichtigungsort_adresse, schadens_adresse, schadens_plz, schadens_ort, nachbesichtigung_status, created_at'

  let faelle: Record<string, unknown>[] = []

  const { data: directFaelle } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(FALL_SELECT)
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })

  faelle = directFaelle ?? []

  // Fallback via Lead-Email
  if (faelle.length === 0) {
    const { data: leads } = await supabase.from('leads').select('id').eq('email', user.email!)
    const leadIds = (leads ?? []).map((l) => l.id)
    if (leadIds.length) {
      const { data } = await supabase
        .from('faelle')
        .select(FALL_SELECT)
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
      faelle = data ?? []
    }
  }

  // KFZ-207: Auto-Reaktivierung kalt-Lead wenn Kunde Portal öffnet
  try {
    const { createAdminClient: createAdmin } = await import('@/lib/supabase/admin')
    const admin = createAdmin()
    const { data: kaltLeads } = await admin
      .from('leads')
      .select('id, vorname, nachname')
      .eq('email', user.email!)
      .eq('qualifizierungs_phase', 'kalt')
    for (const lead of kaltLeads ?? []) {
      await admin
        .from('leads')
        .update({ qualifizierungs_phase: 'in-qualifizierung', updated_at: new Date().toISOString() })
        .eq('id', lead.id)
      // Fall-ID für Task + Timeline ermitteln
      const { data: linkedFall } = await admin.from('faelle').select('id').eq('lead_id', lead.id).limit(1).maybeSingle()
      const fallId = linkedFall?.id ?? null
      await admin.from('tasks').insert({
        fall_id: fallId,
        titel: `Lead reaktiviert: ${lead.vorname ?? ''} ${lead.nachname ?? ''} (Portal geöffnet)`,
        typ: 'dispatch',
        prioritaet: 'dringend',
        status: 'offen',
      })
      if (fallId) {
        await admin.from('timeline').insert({
          fall_id: fallId,
          typ: 'system',
          titel: 'Lead reaktiviert (Kunde hat Portal geöffnet)',
          beschreibung: `${lead.vorname ?? ''} ${lead.nachname ?? ''} war kalt, hat sich selbst reaktiviert.`,
        })
      }
    }
  } catch {
    /* non-critical */
  }

  // Onboarding-Redirect
  const needsOnboarding = faelle.find((f) => f.onboarding_complete === false)
  if (needsOnboarding) redirect('/kunde/onboarding')

  // KFZ-128: Ungelesene Nachrichten pro Fall zählen (non-critical)
  const ungeleseneByFall = new Map<string, number>()
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    await Promise.all(
      faelle.map(async (f) => {
        const { count } = await admin
          .from('nachrichten')
          .select('id', { count: 'exact', head: true })
          .eq('fall_id', f.id as string)
          .eq('gelesen', false)
          .neq('sender_id', user.id)
        ungeleseneByFall.set(f.id as string, count ?? 0)
      }),
    )
    // Sortierung: Fälle mit ungelesenen Nachrichten oben
    faelle.sort((a, b) => (ungeleseneByFall.get(b.id as string) ?? 0) - (ungeleseneByFall.get(a.id as string) ?? 0))
  } catch (e) {
    console.error('[KundeStartseite] Ungelesene Nachrichten Fehler:', e)
  }

  // AAR-449: Zentrale Metadaten (Termin, Aktion, LastUpdate) via Shared-Loader.
  const metaInput: FallKarteMetaInput[] = faelle.map((f) => ({
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
    nachbesichtigung_status: f.nachbesichtigung_status as string | null,
  }))
  const metaByFall = await ladeFallKartenMeta(metaInput)

  // Höchst-priorisierte Aktion über alle Fälle hinweg — speist die Jetzt-zu-tun-Card oben.
  const aktionen: KundeAktion[] = []
  for (const fid of Object.keys(metaByFall)) {
    const a = metaByFall[fid]?.aktion
    if (a) aktionen.push(a)
  }
  aktionen.sort((a, b) => AKTION_PRIO[b.prioritaet] - AKTION_PRIO[a.prioritaet])
  const topAktion = aktionen[0] ?? null

  const vorname = profile?.vorname ?? user.email?.split('@')[0] ?? 'Kunde'

  return (
    <div className="w-full px-4 md:px-8 py-6 max-w-xl md:max-w-none mx-auto">
      <h1
        className="mb-1 text-xl font-bold"
        style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
      >
        Hallo {vorname}
      </h1>
      <p
        className="mb-6 text-sm"
        style={{ color: 'var(--brand-text-secondary, #6b7280)' }}
      >
        Hier sehen Sie den Stand Ihrer Fälle.
      </p>

      {/* AAR-432: Jetzt-zu-tun-Matrix */}
      <KundeJetztZuTunCard aktion={topAktion} />

      {faelle.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center shadow-sm"
          style={{
            background: 'var(--brand-surface, #ffffff)',
            borderColor: 'var(--brand-border, #e5e7eb)',
          }}
        >
          <p
            className="font-semibold"
            style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
          >
            Noch kein Schadensfall
          </p>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--brand-text-secondary, #6b7280)' }}
          >
            Sobald ein Fall für Sie angelegt wird, erscheint er hier.
          </p>
        </div>
      ) : (
        <div className="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">
          {faelle.map((fall) => {
            const meta = metaByFall[fall.id as string] ?? { aktion: null, nextTermin: null, lastUpdate: null }
            return (
              <FallKarte
                key={fall.id as string}
                fall={{
                  id: fall.id as string,
                  fall_nummer: fall.fall_nummer as string | null,
                  status: fall.status as string | null,
                  kennzeichen: fall.kennzeichen as string | null,
                  fahrzeug_hersteller: fall.fahrzeug_hersteller as string | null,
                  fahrzeug_modell: fall.fahrzeug_modell as string | null,
                  schadens_datum: fall.schadens_datum as string | null,
                }}
                aktion={meta.aktion}
                nextTermin={meta.nextTermin}
                lastUpdate={meta.lastUpdate}
                ungeleseneNachrichten={ungeleseneByFall.get(fall.id as string)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
  } catch (err) {
    console.error('[KundeStartseite] Error:', err)
    return (
      <div className="w-full px-4 md:px-8 py-6">
        <div
          className="rounded-xl border p-8 text-center shadow-sm"
          style={{
            background: 'var(--brand-surface, #ffffff)',
            borderColor: 'var(--brand-border, #e5e7eb)',
          }}
        >
          <p
            className="font-semibold"
            style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
          >
            Fehler beim Laden
          </p>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--brand-text-secondary, #6b7280)' }}
          >
            Bitte versuchen Sie es erneut.
          </p>
        </div>
      </div>
    )
  }
}
