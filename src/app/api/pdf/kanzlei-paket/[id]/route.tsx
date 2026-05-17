import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { KanzleiPaketPDF, type KanzleiPaketData } from '@/lib/pdf/kanzlei-paket'
import { getStorageUrl } from '@/lib/storage/url'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  // Load fall
  const { data: fall } = await supabase
    .from('faelle')
    .select('*, lead_id, sv_id')
    .eq('id', id)
    .single()

  if (!fall) return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })

  // CMM-44 SP-A2 (Cluster 1): Schadensdatum + Schadensort leben auf claims
  // (SSoT — schadentag / entdeckt_am / schadenort_*). Claim ueber claim_id laden.
  const claimResult = fall.claim_id
    ? supabase.from('claims')
        .select('schadentag, entdeckt_am, schadenort_adresse, schadenort_plz, schadenort_ort')
        .eq('id', fall.claim_id as string)
        .single()
    : Promise.resolve({ data: null })

  // Load related data in parallel
  const [
    { data: positionen },
    { data: dokumente },
    { data: parteien },
    leadResult,
    svResult,
    { data: claimRow },
  ] = await Promise.all([
    supabase.from('schadenspositionen')
      .select('kategorie, bezeichnung, beschreibung, geschaetzter_wert, reparaturkosten')
      .eq('fall_id', id)
      .order('sort_order'),
    // CMM-32e: Abgelehnte Iterationen (KB-Reject) dürfen NICHT ins Kanzlei-Paket
    // — bleiben aber in der KB-Fallakte für Audit-Zwecke sichtbar.
    supabase.from('fall_dokumente')
      .select('dokument_typ, storage_path, original_filename')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .is('abgelehnt_am', null),
    supabase.from('parteien')
      .select('rolle, name, versicherung_name, versicherung_nr, telefon, email')
      .eq('fall_id', id),
    fall.lead_id
      ? supabase.from('leads').select('vorname, nachname, email, telefon').eq('id', fall.lead_id).single()
      : Promise.resolve({ data: null }),
    fall.sv_id
      ? supabase.from('sachverstaendige').select('profiles!sachverstaendige_profile_id_fkey(vorname, nachname)').eq('id', fall.sv_id).single()
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

  // Build geschaedigter from lead or parteien
  const geschaedigterPartei = (parteien ?? []).find(p => p.rolle === 'geschaedigter')
  const geschaedigter = geschaedigterPartei
    ? { name: geschaedigterPartei.name, email: geschaedigterPartei.email, telefon: geschaedigterPartei.telefon }
    : leadResult.data
      ? { name: `${leadResult.data.vorname ?? ''} ${leadResult.data.nachname ?? ''}`.trim(), email: leadResult.data.email, telefon: leadResult.data.telefon }
      : null

  const schaedigerPartei = (parteien ?? []).find(p => p.rolle === 'schaediger')
  const schaediger = schaedigerPartei
    ? { name: schaedigerPartei.name, versicherung: schaedigerPartei.versicherung_name, versicherungNr: schaedigerPartei.versicherung_nr, telefon: schaedigerPartei.telefon, email: schaedigerPartei.email }
    : null

  // PDF wird der Kanzlei per Email zugestellt — die Doku-Links müssen mehrere
  // Tage haltbar sein. TTL = 7d über STORAGE_TTL.email. Sobald
  // STORAGE_USE_SIGNED_URLS=true gilt, sind die URLs Zugriffs-geschützt;
  // davor liefert getStorageUrl die heutige public-URL (kein Behavior-Change).
  const dokumenteMapped = await Promise.all(
    (dokumente ?? []).map(async d => ({
      typ: d.dokument_typ as string | null,
      datei_url: d.storage_path
        ? await getStorageUrl(supabase, 'fall-dokumente', d.storage_path as string, { context: 'email' })
        : null,
      datei_name: (d.original_filename as string | null) ?? null,
    })),
  )
  const fotos = dokumenteMapped.filter(d => d.typ?.startsWith('foto'))
  const beweise = dokumenteMapped.filter(d => !d.typ?.startsWith('foto'))

  const data: KanzleiPaketData = {
    fallNummer: fall.fall_nummer ?? id.slice(0, 8),
    mandatsnummer: fall.mandatsnummer ?? null,
    datum: new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }),
    status: fall.status,
    geschaedigter,
    schaediger,
    schadensUrsache: fall.schadens_ursache,
    schadensBeschreibung: fall.schadens_beschreibung,
    schadensDatum: claimRow?.entdeckt_am ?? claimRow?.schadentag ?? null,
    schadensAdresse: [claimRow?.schadenort_adresse, claimRow?.schadenort_plz, claimRow?.schadenort_ort].filter(Boolean).join(', ') || null,
    positionen: (positionen ?? []).map(p => ({
      kategorie: p.kategorie,
      bezeichnung: p.bezeichnung,
      beschreibung: p.beschreibung,
      geschaetzterWert: p.geschaetzter_wert,
      reparaturkosten: p.reparaturkosten,
    })),
    gutachtenBetrag: fall.gutachten_betrag,
    gutachtenDatum: fall.gutachten_eingegangen_am,
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
