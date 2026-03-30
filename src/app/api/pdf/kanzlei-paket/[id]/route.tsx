import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { KanzleiPaketPDF, type KanzleiPaketData } from '@/lib/pdf/kanzlei-paket'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  // Load fall
  const { data: fall } = await supabase
    .from('faelle')
    .select('*, lead_id, sv_id')
    .eq('id', id)
    .single()

  if (!fall) return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })

  // Load related data in parallel
  const [
    { data: positionen },
    { data: dokumente },
    { data: parteien },
    leadResult,
    svResult,
  ] = await Promise.all([
    supabase.from('schadenspositionen')
      .select('kategorie, bezeichnung, beschreibung, geschaetzter_wert, reparaturkosten')
      .eq('fall_id', id)
      .order('sort_order'),
    supabase.from('dokumente')
      .select('typ, datei_url, datei_name')
      .eq('fall_id', id),
    supabase.from('parteien')
      .select('rolle, name, versicherung_name, versicherung_nr, telefon, email')
      .eq('fall_id', id),
    fall.lead_id
      ? supabase.from('leads').select('vorname, nachname, email, telefon').eq('id', fall.lead_id).single()
      : Promise.resolve({ data: null }),
    fall.sv_id
      ? supabase.from('sachverstaendige').select('profiles(vorname, nachname)').eq('id', fall.sv_id).single()
      : Promise.resolve({ data: null }),
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

  const fotos = (dokumente ?? []).filter(d => d.typ?.startsWith('foto'))
  const beweise = (dokumente ?? []).filter(d => !d.typ?.startsWith('foto'))

  const data: KanzleiPaketData = {
    fallNummer: fall.fall_nummer ?? id.slice(0, 8),
    mandatsnummer: fall.mandatsnummer ?? null,
    datum: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    status: fall.status,
    geschaedigter,
    schaediger,
    schadensUrsache: fall.schadens_ursache,
    schadensBeschreibung: fall.schadens_beschreibung,
    schadensDatum: fall.schadens_entdeckt_am ?? fall.schadens_datum,
    schadensAdresse: [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || null,
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
    beweise: beweise.map(d => ({ typ: d.typ, name: d.datei_name })),
    fotoUrls: fotos.map(d => d.datei_url).filter(Boolean),
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
