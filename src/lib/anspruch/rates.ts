import { createAdminClient } from '@/lib/supabase/admin'
import type { AnspruchConfig, Schweregrad, Segment, SegmentSatz, WertminderungFaktor, WbwHeuristikBand } from './types'
import { SEGMENTE } from './types'
import { STANDARD_KLASSE_SAETZE, KLASSEN_REIHE, type NutzungsausfallKlasse } from './nutzungsausfall-klasse'

export type AnspruchRates = {
  saetze: Record<Segment, SegmentSatz>
  faktoren: WertminderungFaktor[]
  config: AnspruchConfig
  klasseSaetze: Record<NutzungsausfallKlasse, number>
  wbwHeuristik: WbwHeuristikBand[]
}

function num(map: Record<string, number>, key: string, fallback: number): number {
  return typeof map[key] === 'number' ? map[key] : fallback
}

export async function ladeAnspruchRates(): Promise<AnspruchRates> {
  const db = createAdminClient()
  const [saetzeRes, faktorenRes, configRes, wbwRes, klasseRes] = await Promise.all([
    // select('*') statt Spaltenliste: mietwagen_*-Spalten (Migration 20260706095717) fehlen noch in
    // den generierten Typen; '*' umgeht die Select-String-Typpruefung, mietwagen wird unten defensiv gelesen.
    db.from('nutzungsausfall_segment_saetze').select('*'),
    db.from('wertminderung_alter_faktoren').select('alter_bis_jahre, faktor_min, faktor_max'),
    db.from('anspruch_config').select('key, wert'),
    db.from('wbw_segment_alter').select('segment, alter_bis_jahre, wbw_min_eur, wbw_max_eur, restwert_faktor'),
    // nutzungsausfall_klasse_saetze: neue Tabelle (Migration 20260707225412), noch nicht in den
    // generierten Typen -> Tabellenname-Cast, defensiv gelesen (analog zum select('*')-Dodge oben).
    db.from('nutzungsausfall_klasse_saetze' as never).select('klasse, euro_pro_tag'),
  ])

  const saetze = {} as Record<Segment, SegmentSatz>
  for (const seg of SEGMENTE) saetze[seg] = { tagessatzMinEur: 0, tagessatzMaxEur: 0, mietwagenMinEur: 0, mietwagenMaxEur: 0 }
  for (const row of saetzeRes.data ?? []) {
    if ((SEGMENTE as readonly string[]).includes(row.segment)) {
      const mw = row as { mietwagen_min_eur?: number | null; mietwagen_max_eur?: number | null }
      saetze[row.segment as Segment] = {
        tagessatzMinEur: Number(row.tagessatz_min_eur),
        tagessatzMaxEur: Number(row.tagessatz_max_eur),
        mietwagenMinEur: Number(mw.mietwagen_min_eur ?? 0),
        mietwagenMaxEur: Number(mw.mietwagen_max_eur ?? 0),
      }
    }
  }

  const faktoren: WertminderungFaktor[] = (faktorenRes.data ?? []).map((r) => ({
    alterBisJahre: Number(r.alter_bis_jahre),
    faktorMin: Number(r.faktor_min),
    faktorMax: Number(r.faktor_max),
  }))

  const cfg: Record<string, number> = {}
  for (const row of configRes.data ?? []) cfg[row.key] = Number(row.wert)

  const config: AnspruchConfig = {
    kostenpauschaleEur: num(cfg, 'kostenpauschale_eur', 30),
    wertminderungMinReparaturEur: num(cfg, 'wertminderung_min_reparatur_eur', 750),
    wertminderungMaxAlterJahre: num(cfg, 'wertminderung_max_alter_jahre', 5),
    bagatelleSchwelleEur: num(cfg, 'bagatelle_schwelle_eur', 750),
    abschleppMinEur: num(cfg, 'abschlepp_min_eur', 150),
    abschleppMaxEur: num(cfg, 'abschlepp_max_eur', 350),
    dauerTage: {
      leicht: { min: num(cfg, 'dauer_leicht_min_tage', 2), max: num(cfg, 'dauer_leicht_max_tage', 4) },
      mittel: { min: num(cfg, 'dauer_mittel_min_tage', 5), max: num(cfg, 'dauer_mittel_max_tage', 9) },
      schwer: { min: num(cfg, 'dauer_schwer_min_tage', 10), max: num(cfg, 'dauer_schwer_max_tage', 21) },
    } as Record<Schweregrad, { min: number; max: number }>,
    totalschadenSchwelleProzent: num(cfg, 'totalschaden_schwelle_prozent', 90) / 100,
    reparaturGrenzeProzent: num(cfg, 'reparatur_grenze_prozent', 130) / 100,
    wiederbeschaffungsdauerTage: {
      min: num(cfg, 'wiederbeschaffungsdauer_min_tage', 10),
      max: num(cfg, 'wiederbeschaffungsdauer_max_tage', 14),
    },
    verbringungEur: num(cfg, 'verbringung_eur', 130),
    ummeldungEur: num(cfg, 'ummeldung_eur', 75),
  }

  const wbwHeuristik: WbwHeuristikBand[] = (wbwRes.data ?? []).map((r) => ({
    segment: r.segment as Segment,
    alterBisJahre: Number(r.alter_bis_jahre),
    wbwMinEur: Number(r.wbw_min_eur),
    wbwMaxEur: Number(r.wbw_max_eur),
    restwertFaktor: Number(r.restwert_faktor),
  }))

  // Nutzungsausfall-Klassensaetze: DB uebersteuert die kanonische Code-Tabelle (Fallback).
  const klasseSaetze: Record<NutzungsausfallKlasse, number> = { ...STANDARD_KLASSE_SAETZE }
  for (const row of (klasseRes.data ?? []) as { klasse?: string; euro_pro_tag?: number | string }[]) {
    if (row.klasse && (KLASSEN_REIHE as readonly string[]).includes(row.klasse)) {
      klasseSaetze[row.klasse as NutzungsausfallKlasse] = Number(row.euro_pro_tag)
    }
  }

  return { saetze, faktoren, config, klasseSaetze, wbwHeuristik }
}
