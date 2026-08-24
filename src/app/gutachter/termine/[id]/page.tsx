import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TerminDetailActions from './TerminDetailActions'
import BesichtigungsortKorrektur from './BesichtigungsortKorrektur'
import { SvPageChrome } from '@/app/gutachter/_shell/SvPageChrome'
import PolizeiberichtUpload from './PolizeiberichtUpload'
import PhoneButton from '@/components/shared/PhoneButton'
import { SectionCard } from '@/components/shared/SectionCard'

// KFZ-200: Termin-Detail-Seite mit "Navigation starten"-Button.
// AAR-126: Vor-Ort-Polizeibericht-Upload wenn polizei_vor_ort=true und Bericht fehlt.

export const dynamic = 'force-dynamic'

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  const db = (await import('@/lib/supabase/admin')).createAdminClient()

  // AAR-133: lead_id mitlesen — Termin kann pre-FlowLink sein (lead_id ohne fall_id)
  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    // CMM-49 sv_id-Drop (Termin-Engine-Handoff): sv_id aus Select entfernt (unused) + Filter -> assignee
    .select('id, fall_id, lead_id, start_zeit, end_zeit, status, navigation_started_at, sv_angekommen_am, durchgefuehrt_am, sv_eta_minuten, sv_unterwegs_seit, kanal')
    .eq('id', id)
    .eq('typ', 'sv_begutachtung')
    .eq('assignee_id', sv.id)
    .eq('assignee_typ', 'sachverstaendiger')
    .single()

  if (tErr || !termin) redirect('/gutachter/termine')

  // AAR-133: zwei Code-Pfade — Fall-Termin (klassisch) vs. Pre-FlowLink-Reservierung
  type FallRow = {
    id: string
    claim_nummer: string | null
    lead_id: string | null
    besichtigungsort_adresse: string | null
    schadens_adresse: string | null
    schadens_plz: string | null
    schadens_ort: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    kennzeichen: string | null
    polizei_vor_ort: boolean | null
    polizei_aktenzeichen: string | null
  }
  type LeadRow = {
    vorname: string | null
    nachname: string | null
    telefon: string | null
    email: string | null
    kunde_strasse?: string | null
    kunde_plz?: string | null
    unfallort?: string | null
    fahrzeug_hersteller?: string | null
    fahrzeug_modell?: string | null
    kennzeichen?: string | null
  }

  let fall: FallRow | null = null
  let lead: LeadRow | null = null
  // AAR-939 3c: service_typ aus dem claims-Embed — steuert den nur_gutachter-
  // Abschluss-Button in TerminDetailActions (statt Navigation/Vor-Ort).
  let serviceTyp: string | null = null
  // AAR-939 termin-engine: Besichtigungsort-Bestätigungs-Status (Kunde/SV/null).
  let besichtigungsortBestaetigtVon: string | null = null
  const istVorreservierung = !termin.fall_id && !!termin.lead_id
  // AAR-939 termin-engine: Besichtigungsort-Korrektur nur bei Vor-Ort-Terminen
  // (nicht Video/Telefon) — spiegelt die Kunde-Seite (istVorOrt).
  const istVorOrt = termin.kanal !== 'video' && termin.kanal !== 'telefon'

  if (termin.fall_id) {
    // CMM-44 SP-A: polizei_vor_ort + polizei_aktenzeichen sind faelle<->claims-
    // Duplikat-Spalten → aus dem claims-Embed lesen (SSoT). Restliche Felder
    // bleiben faelle-only. Embed wird unten auf die flache FallRow normalisiert.
    // CMM-44 SP-A2 (Cluster 1): schadenort_* ebenfalls aus dem claims-Embed (SSoT).
    // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (Termin selbst, SSoT).
    // CMM-49 (Entity-Sweep): faelle -> v_claim_full. fahrzeug_*/kennzeichen flach
    // (value-identisch, div=0); polizei_*/schadenort_*/claim_nummer/service_typ flach
    // (claims-SSoT) statt claims-Embed. id:fall_id-Alias hält f.id == frühere faelle.id.
    const { data: f } = await db
      .from('v_claim_full')
      .select('id:fall_id, lead_id, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, polizei_vor_ort, polizei_aktenzeichen, schadenort_adresse, schadenort_plz, schadenort_ort, claim_nummer, service_typ')
      .eq('fall_id', termin.fall_id)
      .single()
    // Dieser Termin IST die gutachter_termine-Zeile — besichtigungsort_adresse direkt laden.
    const { data: terminDetail } = await db
      .from('gutachter_termine')
      .select('besichtigungsort_adresse, besichtigungsort_bestaetigt_von')
      .eq('id', id)
      .maybeSingle()
    if (f) {
      const fClaim = f
      serviceTyp = (fClaim?.service_typ as string | null) ?? null
      // AAR-939 termin-engine: besichtigungsort_bestaetigt_von ist noch nicht in
      // database.types → as-cast. Wert 'kunde'|'sv'|null.
      besichtigungsortBestaetigtVon = (terminDetail?.besichtigungsort_bestaetigt_von as string | null) ?? null
      fall = {
        id: f.id as string,
        claim_nummer: (fClaim?.claim_nummer as string | null) ?? null,
        lead_id: (f.lead_id as string | null) ?? null,
        besichtigungsort_adresse: (terminDetail?.besichtigungsort_adresse as string | null) ?? null,
        schadens_adresse: (fClaim?.schadenort_adresse as string | null) ?? null,
        schadens_plz: (fClaim?.schadenort_plz as string | null) ?? null,
        schadens_ort: (fClaim?.schadenort_ort as string | null) ?? null,
        fahrzeug_hersteller: (f.fahrzeug_hersteller as string | null) ?? null,
        fahrzeug_modell: (f.fahrzeug_modell as string | null) ?? null,
        kennzeichen: (f.kennzeichen as string | null) ?? null,
        polizei_vor_ort: (fClaim?.polizei_vor_ort as boolean | null) ?? null,
        polizei_aktenzeichen: (fClaim?.polizei_aktenzeichen as string | null) ?? null,
      }
    }
    if (f?.lead_id) {
      const { data: l } = await db
        .from('leads')
        .select('vorname, nachname, telefon, email')
        .eq('id', f.lead_id)
        .single()
      lead = l
    }
  } else if (termin.lead_id) {
    // Pre-FlowLink: nur Lead, kein Fall
    const { data: l } = await db
      .from('leads')
      .select('vorname, nachname, telefon, email, kunde_strasse, kunde_plz, unfallort, fahrzeug_hersteller, fahrzeug_modell, kennzeichen')
      .eq('id', termin.lead_id)
      .single()
    lead = l
  }

  // AAR-126: Polizeibericht-Status nur prüfen wenn Fall existiert
  let polizeiberichtHochgeladen = false
  if (fall?.polizei_vor_ort === true) {
    const { data: docs } = await db
      .from('pflichtdokumente')
      .select('dokument_url')
      .eq('fall_id', fall.id)
      .eq('dokument_typ', 'polizeibericht')
      .limit(1)
    polizeiberichtHochgeladen = !!docs?.[0]?.dokument_url
  }

  // Adresse-Fallback-Kette: Fall-Adresse → Lead-Adresse → "—"
  // joinNonEmpty: leeres Array → undefined statt '' damit ?? korrekt fällt.
  const joinNonEmpty = (parts: (string | null | undefined)[]) => {
    const s = parts.filter(Boolean).join(', ')
    return s || undefined
  }
  const adresse =
    fall?.besichtigungsort_adresse ??
    (fall ? joinNonEmpty([fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort]) : undefined) ??
    (lead ? lead.unfallort ?? joinNonEmpty([lead.kunde_strasse, lead.kunde_plz]) : undefined) ??
    '—'

  // Fahrzeug-Info kann auch vom Lead kommen
  const fahrzeugHersteller = fall?.fahrzeug_hersteller ?? lead?.fahrzeug_hersteller ?? null
  const fahrzeugModell = fall?.fahrzeug_modell ?? lead?.fahrzeug_modell ?? null
  const kennzeichen = fall?.kennzeichen ?? lead?.kennzeichen ?? null

  const datum = new Date(termin.start_zeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const uhrzeit = new Date(termin.start_zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/gutachter/termine" className="text-sm text-[var(--brand-secondary)] hover:underline">← Alle Termine</Link>
      </div>

      <SvPageChrome title={`${datum} · ${uhrzeit}`} />

      {/* AAR-133: Vorreservierung-Badge wenn Pre-FlowLink (kein Fall) */}
      {istVorreservierung && (
        <div className="bg-warning-soft border border-warning rounded-ios-lg p-3">
          <p className="text-sm font-semibold text-amber-900">Vorreservierung</p>
          <p className="text-xs text-amber-700 mt-1">
            Der Kunde hat die Sicherungsabtretung noch nicht unterschrieben. Bitte warten bis der Termin
            offiziell bestätigt wird — du erhältst dann eine zweite Mail. Bis dahin: nicht anfahren.
          </p>
        </div>
      )}

      {/* Kunden-Info-Card */}
      <SectionCard bodyClassName="space-y-3">
        <h2 className="text-sm font-semibold text-claimondo-navy uppercase tracking-wide text-[11px]">Kunden-Infos</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-claimondo-ondo/70">Name</p>
            <p className="font-medium text-claimondo-navy">
              {[lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || '—'}
            </p>
          </div>
          {lead?.telefon && (
            <div>
              <p className="text-xs text-claimondo-ondo/70">Telefon</p>
              <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} className="!font-medium !text-[var(--brand-secondary)] hover:!underline" />
            </div>
          )}
          {lead?.email && (
            <div className="col-span-2">
              <p className="text-xs text-claimondo-ondo/70">E-Mail</p>
              <p className="font-medium text-claimondo-navy">{lead.email}</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Vorab-Infos-Card */}
      <SectionCard bodyClassName="space-y-3">
        <h2 className="text-sm font-semibold text-claimondo-navy uppercase tracking-wide text-[11px]">Vorab-Infos</h2>
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-claimondo-ondo/70">Adresse</p>
            <p className="font-medium text-claimondo-navy">{adresse}</p>
            {/* AAR-939 termin-engine: Trust-Badge + Korrektur-Affordance (SV-Seite) — nur Vor-Ort */}
            {istVorOrt && (
              <BesichtigungsortKorrektur
                terminId={id}
                bestaetigtVon={besichtigungsortBestaetigtVon}
              />
            )}
          </div>
          {(fahrzeugHersteller || fahrzeugModell) && (
            <div>
              <p className="text-xs text-claimondo-ondo/70">Fahrzeug</p>
              <p className="font-medium text-claimondo-navy">
                {[fahrzeugHersteller, fahrzeugModell].filter(Boolean).join(' ')}
                {kennzeichen ? ` · ${kennzeichen}` : ''}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-claimondo-ondo/70">Termin-Status</p>
            <p className="font-medium text-claimondo-navy capitalize">{termin.status}</p>
          </div>
        </div>
      </SectionCard>

      {/* AAR-126: Vor-Ort einzuholen — Polizeibericht wenn polizei_vor_ort=true und Kunde noch nicht hochgeladen */}
      {fall?.polizei_vor_ort === true && !polizeiberichtHochgeladen && (
        <PolizeiberichtUpload
          fallId={fall.id}
          bereitsBekanntesAktenzeichen={fall.polizei_aktenzeichen ?? null}
        />
      )}

      {/* Navigation / Vor-Ort Actions + AAR-134 Ablehnen/Gegenvorschlag */}
      <TerminDetailActions
        terminId={id}
        navigationStartedAt={termin.navigation_started_at ?? null}
        svAngekommen={!!termin.sv_angekommen_am}
        durchgefuehrt={!!termin.durchgefuehrt_am}
        adresse={adresse}
        status={termin.status}
        serviceTyp={serviceTyp}
      />

    </div>
  )
}
