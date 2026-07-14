import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderToBuffer } from '@react-pdf/renderer'
import { KanzleiPaketPDF, type KanzleiPaketData } from '@/lib/pdf/kanzlei-paket'
import { getStorageUrl } from '@/lib/storage/url'
import { resolveGegnerVersicherung } from '@/lib/claims/gegner-versicherung'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  // Storage-RLS-Rest: Die Doku-URLs im PDF werden unten mit dem Service-Client
  // signiert — der private Bucket 'fall-dokumente' laesst den User-Client nicht
  // signieren (createSignedUrl -> null), das PDF ging bisher komplett OHNE
  // Doku-Links raus. Der Service-Client bypassed Storage-RLS, deshalb hier ein
  // explizites Rollen-Gate (deny-by-default) auf die vier internen Rollen —
  // spiegelt src/app/faelle/layout.tsx:47. Die Route hatte bisher NUR einen
  // Login-Check: sie ist an keine UI gebunden, sondern wird per Email-Link
  // geoeffnet. Das Fall-Scoping bleibt bei RLS (faelle_claim_bridge +
  // fall_dokumente laufen weiter auf dem User-Client).
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  const rolle = profile?.rolle as string | undefined
  if (!rolle || !['admin', 'kundenbetreuer', 'kanzlei', 'dispatch'].includes(rolle)) {
    return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 })
  }

  // Load fall — CMM-49 (faelle-Drop-Runway): Anker faelle_claim_bridge (RLS spiegelt faelle) statt
  // .from('faelle'). Nur 6 Felder wurden real genutzt (select('*') war vestigial): claim_id (bridge)
  // + via claims-Embed lead_id/sv_id/operative_status/claim_nummer/gutachten + kanzlei_faelle.mandatsnummer.
  // Alle SSoT; lead_id/sv_id/mandatsnummer div=0 vs faelle live verifiziert; status->operative_status SSoT.
  const { data: fall } = await supabase
    .from('faelle_claim_bridge')
    // FK-Hint Pflicht (PGRST201, s. Mig 20260708071538) — sonst HTTP 300 statt Fall-Daten.
    .select('fall_id, claim_id, claims:claims!fk_bridge_claim(claim_nummer, lead_id, sv_id, operative_status, gutachten(gesamt_schadensbetrag, fertiggestellt_am), kanzlei_faelle(mandatsnummer))')
    .eq('fall_id', id)
    .maybeSingle()

  if (!fall) return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })
  const fallClaim = (Array.isArray(fall.claims) ? fall.claims[0] : fall.claims) as
    | {
        claim_nummer: string | null
        lead_id: string | null
        sv_id: string | null
        operative_status: string | null
        gutachten: { gesamt_schadensbetrag: number | null; fertiggestellt_am: string | null } | { gesamt_schadensbetrag: number | null; fertiggestellt_am: string | null }[] | null
        kanzlei_faelle: { mandatsnummer: string | null } | { mandatsnummer: string | null }[] | null
      }
    | null
    | undefined
  const fallLeadId = fallClaim?.lead_id ?? null
  const fallSvId = fallClaim?.sv_id ?? null

  // CMM-44 SP-A2 (Cluster 1): Schadensdatum + Schadensort leben auf claims
  // (SSoT — schadentag / entdeckt_am / schadenort_*). Claim ueber claim_id laden.
  // CMM-44 SP-A2 (Cluster 2): schadens_beschreibung → claims.hergang_kunde_text.
  // CMM-44 SP-B PR2c: schadens_ursache lebt auf claims (SSoT) — ebenfalls hier.
  const claimResult = fall.claim_id
    ? supabase.from('claims')
        .select('schadentag, entdeckt_am, schadenort_adresse, schadenort_plz, schadenort_ort, hergang_kunde_text, schadens_ursache')
        .eq('id', fall.claim_id as string)
        .single()
    : Promise.resolve({ data: null })

  // Load related data in parallel
  // CMM-49: parteien-Tabelle ist leer (post-CMM-49). Gegner-Daten kommen aus
  // v_claim_full (gegner_name) + resolveGegnerVersicherung (SSoT).
  const [
    { data: positionen },
    { data: dokumente },
    { data: vcfGegner },
    leadResult,
    svResult,
    { data: claimRow },
  ] = await Promise.all([
    // CMM-49: schadenspositionen ist claim-gekeyt — Reader auf claim_id (fall.claim_id
    // bereits oben geladen). Claim-lose Legacy-Faelle: claim_id null ⇒ 0 Rows (korrekt).
    supabase.from('schadenspositionen')
      .select('kategorie, bezeichnung, beschreibung, geschaetzter_wert, reparaturkosten')
      .eq('claim_id', (fall.claim_id as string | null) ?? '00000000-0000-0000-0000-000000000000')
      .order('sort_order'),
    // CMM-32e: Abgelehnte Iterationen (KB-Reject) dürfen NICHT ins Kanzlei-Paket
    // — bleiben aber in der KB-Fallakte für Audit-Zwecke sichtbar.
    supabase.from('fall_dokumente')
      .select('dokument_typ, storage_path, original_filename')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .is('abgelehnt_am', null),
    // CMM-49: parteien leer — gegner_name aus v_claim_full (SSoT).
    supabase.from('v_claim_full')
      .select('gegner_name')
      .eq('fall_id', id)
      .maybeSingle(),
    fallLeadId
      ? supabase.from('leads').select('vorname, nachname, email, telefon').eq('id', fallLeadId).single()
      : Promise.resolve({ data: null }),
    fallSvId
      ? supabase.from('sachverstaendige').select('profiles!sachverstaendige_profile_id_fkey(vorname, nachname)').eq('id', fallSvId).single()
      : Promise.resolve({ data: null }),
    claimResult,
  ])

  // Build SV name
  let svName: string | null = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const p = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles
    if (p) svName = `${(p as { vorname?: string }).vorname ?? ''} ${(p as { nachname?: string }).nachname ?? ''}`.trim() || null
  }

  // Build geschaedigter from lead (parteien-Tabelle ist post-CMM-49 leer —
  // geschaedigter-Partei war ohnehin immer ein Lead-Fallback).
  const geschaedigter = leadResult.data
    ? { name: `${leadResult.data.vorname ?? ''} ${leadResult.data.nachname ?? ''}`.trim(), email: leadResult.data.email, telefon: leadResult.data.telefon }
    : null

  // CMM-49: Gegner-Versicherung aus v_claim_full + resolveGegnerVersicherung (SSoT).
  // parteien.rolle='schaediger' war post-CMM-49 immer leer → Gegner war immer '—'.
  const gegnerVers = await resolveGegnerVersicherung(supabase, { fallId: id })
  const gegnerName = (vcfGegner?.gegner_name as string | null) ?? null
  const schaediger = (gegnerName ?? gegnerVers.name)
    ? { name: gegnerName ?? '', versicherung: gegnerVers.name, versicherungNr: gegnerVers.nummer, telefon: null, email: null }
    : null

  // PDF wird der Kanzlei per Email zugestellt — die Doku-Links müssen mehrere
  // Tage haltbar sein. TTL = 7d über STORAGE_TTL.email. Sobald
  // STORAGE_USE_SIGNED_URLS=true gilt, sind die URLs Zugriffs-geschützt;
  // davor liefert getStorageUrl die heutige public-URL (kein Behavior-Change).
  // Signieren mit dem Service-Client. Sicher, weil `dokumente` oben aus einer
  // RLS-gescopten Query auf dem User-Client stammt — wir signieren also nur
  // Pfade, die dieser User ohnehin sehen darf. Rollen-Gate steht am Routen-Kopf.
  const adminStorage = createAdminClient()
  const dokumenteMapped = await Promise.all(
    (dokumente ?? []).map(async d => ({
      typ: d.dokument_typ as string | null,
      datei_url: d.storage_path
        ? await getStorageUrl(adminStorage, 'fall-dokumente', d.storage_path as string, { context: 'email' })
        : null,
      datei_name: (d.original_filename as string | null) ?? null,
    })),
  )
  const fotos = dokumenteMapped.filter(d => d.typ?.startsWith('foto'))
  const beweise = dokumenteMapped.filter(d => !d.typ?.startsWith('foto'))

  // CMM-44 SP-G PR2: gesamt_schadensbetrag + fertiggestellt_am aus gutachten (SSoT).
  // CMM-49: fallClaim oben aus dem Bridge->claims-Embed normalisiert (wiederverwendet).
  const fallGutachten = Array.isArray(fallClaim?.gutachten) ? fallClaim?.gutachten[0] : fallClaim?.gutachten
  const fallKf = Array.isArray(fallClaim?.kanzlei_faelle) ? fallClaim?.kanzlei_faelle[0] : fallClaim?.kanzlei_faelle
  const data: KanzleiPaketData = {
    fallNummer: fallClaim?.claim_nummer ?? id.slice(0, 8),
    mandatsnummer: fallKf?.mandatsnummer ?? null,
    datum: new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }),
    // CMM-49: status = claims.operative_status (SSoT); '' nur fuer seltene null-Faelle
    // (KanzleiPaketData.status ist non-null; aktive komplett-Mandate haben immer einen Status).
    status: fallClaim?.operative_status ?? '',
    geschaedigter,
    schaediger,
    // CMM-44 SP-B PR2c: schadens_ursache aus claims (SSoT).
    schadensUrsache: claimRow?.schadens_ursache ?? null,
    // CMM-44 SP-A2 (Cluster 2): aus claims.hergang_kunde_text (SSoT).
    schadensBeschreibung: claimRow?.hergang_kunde_text ?? null,
    schadensDatum: claimRow?.entdeckt_am ?? claimRow?.schadentag ?? null,
    schadensAdresse: [claimRow?.schadenort_adresse, claimRow?.schadenort_plz, claimRow?.schadenort_ort].filter(Boolean).join(', ') || null,
    positionen: (positionen ?? []).map(p => ({
      kategorie: p.kategorie,
      bezeichnung: p.bezeichnung,
      beschreibung: p.beschreibung,
      geschaetzterWert: p.geschaetzter_wert,
      reparaturkosten: p.reparaturkosten,
    })),
    gutachtenBetrag: fallGutachten?.gesamt_schadensbetrag ?? null,
    gutachtenDatum: fallGutachten?.fertiggestellt_am ?? null,
    svName,
    beweise: beweise.map(d => ({ typ: d.typ ?? 'dokument', name: d.datei_name })),
    fotoUrls: fotos.map(d => d.datei_url).filter((u): u is string => Boolean(u)),
  }

  const buffer = await renderToBuffer(<KanzleiPaketPDF data={data} />)
  const uint8 = new Uint8Array(buffer)

  return new NextResponse(uint8, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Kanzlei-Paket-${data.fallNummer}.pdf"`,
    },
  })
}
