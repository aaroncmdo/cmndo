import type {
  AnspruchConfig, AnspruchPosition, AnspruchSpanne, AnspruchWeg, Ersatzfahrzeug, Schuldform, Segment, SegmentSatz,
  SchaetzInput, TotalschadenInfo, WertminderungFaktor,
} from './types'
import {
  bestimmeNutzungsausfallKlasse, STANDARD_KLASSE_SAETZE,
  type KlasseErgebnis, type NutzungsausfallKlasse,
} from './nutzungsausfall-klasse'

function runde(n: number): number {
  return Math.round(n)
}

// Anwaltskosten traegt die gegnerische Versicherung nur, wenn ein Gegner haftet (unverschuldet/teilschuld).
function anwaltskostenPosition(): AnspruchPosition {
  return {
    typ: 'anwaltskosten',
    label: 'Anwaltskosten',
    minEur: null,
    maxEur: null,
    gedecktDurchGegner: true,
    hinweis: 'Bei klarer Haftung trägt die gegnerische Versicherung Ihre Anwaltskosten.',
  }
}

// Ersatzfahrzeug waehrend Reparatur/Wiederbeschaffung: Nutzungsausfall (Geld, klassenbasiert nach
// Nutzungsausfalltabelle A-L + Altersabschlag) ODER Mietwagen (segment-basiert) ODER nichts.
// Rechtlich ein Entweder-oder -> genau eine Position (oder keine).
function ersatzfahrzeugPosition(
  ersatzfahrzeug: Ersatzfahrzeug,
  naKlasse: KlasseErgebnis,
  mietwagen: { minEur: number; maxEur: number },
  dauer: { min: number; max: number },
  labelSuffix: string,
  kontext: 'reparatur' | 'wiederbeschaffung',
): AnspruchPosition | null {
  if (ersatzfahrzeug === 'keins') return null
  if (ersatzfahrzeug === 'mietwagen') {
    return {
      typ: 'mietwagen',
      label: `Mietwagen${labelSuffix}`,
      minEur: runde(mietwagen.minEur * dauer.min),
      maxEur: runde(mietwagen.maxEur * dauer.max),
      hinweis: `${mietwagen.minEur}–${mietwagen.maxEur} €/Tag × ${dauer.min}–${dauer.max} Tage`,
    }
  }
  // Nutzungsausfall — fester Tagessatz je Klasse (nach Altersabschlag)
  const { klasse, satzEur, stufen } = naKlasse
  const teile = [`Klasse ${klasse} · ${satzEur} €/Tag × ${dauer.min}–${dauer.max} Tage.`]
  teile.push(
    kontext === 'reparatur'
      ? 'Rückwirkend nach nachgewiesener Reparatur geltend zu machen, sofern kein Mietwagen genommen wird.'
      : 'Für die Dauer der Ersatzbeschaffung, sofern kein Mietwagen genommen wird.',
  )
  if (stufen > 0) {
    teile.push(`Fahrzeugalter berücksichtigt: Rückstufung um ${stufen} Klasse${stufen > 1 ? 'n' : ''}.`)
  }
  return {
    typ: 'nutzungsausfall',
    label: `Nutzungsausfall${labelSuffix}`,
    minEur: runde(satzEur * dauer.min),
    maxEur: runde(satzEur * dauer.max),
    hinweis: teile.join(' '),
  }
}

function findeFaktor(alter: number, faktoren: WertminderungFaktor[]): WertminderungFaktor | null {
  const sortiert = [...faktoren].sort((a, b) => a.alterBisJahre - b.alterBisJahre)
  return sortiert.find((f) => alter <= f.alterBisJahre) ?? null
}

export function berechneAnspruchsSpanne(
  input: SchaetzInput,
  saetze: Record<Segment, SegmentSatz>,
  faktoren: WertminderungFaktor[],
  config: AnspruchConfig,
  klasseSaetze: Record<NutzungsausfallKlasse, number> = STANDARD_KLASSE_SAETZE,
): AnspruchSpanne {
  const positionen: AnspruchPosition[] = []
  const hinweise: string[] = []
  const schuld: Schuldform = input.schuld ?? 'unverschuldet'
  const gegnerHaftet = schuld !== 'selbst'
  const ersatzfahrzeug: Ersatzfahrzeug = input.ersatzfahrzeug ?? 'nutzungsausfall'
  const reparaturMitte = (input.reparaturMinEur + input.reparaturMaxEur) / 2
  const alter = input.ezJahr != null ? input.aktuellesJahr - input.ezJahr : null
  const naKlasse = bestimmeNutzungsausfallKlasse(input.segment, alter, klasseSaetze)
  const mietwagenSatz = { minEur: saetze[input.segment].mietwagenMinEur, maxEur: saetze[input.segment].mietwagenMaxEur }

  // 1) Reparaturkosten — immer
  positionen.push({
    typ: 'reparatur',
    label: 'Reparaturkosten',
    minEur: runde(input.reparaturMinEur),
    maxEur: runde(input.reparaturMaxEur),
  })

  // 2) Ersatzfahrzeug (Nutzungsausfall ODER Mietwagen) — im Reparaturfall ueber die Reparaturdauer,
  //    UNABHAENGIG von fahrbereit: der Nutzungsausfall wird rueckwirkend nach nachgewiesener Reparatur
  //    geltend gemacht (sofern kein Mietwagen). 'keins' -> keine Position. Abschlepp bleibt fahrbereit-gated.
  const ef = ersatzfahrzeugPosition(ersatzfahrzeug, naKlasse, mietwagenSatz, config.dauerTage[input.schweregrad], '', 'reparatur')
  if (ef) positionen.push(ef)

  // 3) Wertminderung — nur jung + Substanz + ueber Schwelle
  const wmAnwendbar =
    alter != null &&
    alter <= config.wertminderungMaxAlterJahre &&
    input.schweregrad !== 'leicht' &&
    reparaturMitte >= config.wertminderungMinReparaturEur
  if (wmAnwendbar) {
    const faktor = findeFaktor(alter, faktoren)
    if (faktor) {
      positionen.push({
        typ: 'wertminderung',
        label: 'Wertminderung',
        minEur: runde(faktor.faktorMin * reparaturMitte),
        maxEur: runde(faktor.faktorMax * reparaturMitte),
      })
    }
  } else if (reparaturMitte < config.bagatelleSchwelleEur || input.schweregrad === 'leicht') {
    hinweise.push('Bei rein kosmetischen Schäden (Bagatelle) ist die Wertminderung meist gering oder entfällt.')
  }

  // 3b) Verbringungskosten — nur bei nennenswerter Reparatur (Transport zur Lackiererei), Fixbetrag
  if (reparaturMitte >= config.bagatelleSchwelleEur) {
    positionen.push({
      typ: 'verbringung',
      label: 'Verbringungskosten',
      minEur: config.verbringungEur,
      maxEur: config.verbringungEur,
      hinweis: 'Transport zwischen Werkstatt und Lackiererei',
    })
  }

  // 4) Sachverstaendigenkosten — immer, getragen von Gegnerversicherung (nicht in Gesamt)
  positionen.push({
    typ: 'gutachterkosten',
    label: 'Sachverständigenkosten',
    minEur: null,
    maxEur: null,
    gedecktDurchGegner: true,
    hinweis: 'Bei klarer Haftung trägt die gegnerische Versicherung diese Kosten.',
  })

  // 4b) Anwaltskosten — nur wenn ein Gegner haftet (unverschuldet/teilschuld), Gegner traegt sie
  if (gegnerHaftet) positionen.push(anwaltskostenPosition())

  // 5) Auslagenpauschale — immer
  positionen.push({
    typ: 'kostenpauschale',
    label: 'Auslagenpauschale',
    minEur: config.kostenpauschaleEur,
    maxEur: config.kostenpauschaleEur,
  })

  // 6) Abschleppkosten — nur wenn nicht fahrbereit
  if (!input.fahrbereit) {
    positionen.push({
      typ: 'abschleppkosten',
      label: 'Abschleppkosten',
      minEur: config.abschleppMinEur,
      maxEur: config.abschleppMaxEur,
    })
  }

  const summierbar = positionen.filter((p) => !p.gedecktDurchGegner && p.minEur != null && p.maxEur != null)
  const gesamtMinEur = runde(summierbar.reduce((s, p) => s + (p.minEur as number), 0))
  const gesamtMaxEur = runde(summierbar.reduce((s, p) => s + (p.maxEur as number), 0))

  // --- Totalschaden-Zonen (nur wenn WBW vorhanden) ---
  let totalschaden: TotalschadenInfo | undefined
  const wbwMitte = input.wbwMinEur != null && input.wbwMaxEur != null ? (input.wbwMinEur + input.wbwMaxEur) / 2 : null
  if (wbwMitte != null && wbwMitte > 0) {
    const verhaeltnis = reparaturMitte / wbwMitte
    if (verhaeltnis >= config.totalschadenSchwelleProzent) {
      const restMin = input.restwertMinEur ?? 0
      const restMax = input.restwertMaxEur ?? 0
      const dauer = config.wiederbeschaffungsdauerTage
      const efTs = ersatzfahrzeugPosition(ersatzfahrzeug, naKlasse, mietwagenSatz, dauer, ' (Wiederbeschaffung)', 'wiederbeschaffung')
      // Totalschaden-Weg: WBW - Restwert + Ersatzfahrzeug (Wiederbeschaffungsdauer) + (Abschlepp wenn nicht fahrbereit) + SV-Kosten + Auslagenpauschale + Ummeldung
      const tsPositionen: AnspruchPosition[] = [
        { typ: 'reparatur', label: 'Fahrzeugschaden (Wiederbeschaffung − Restwert)', minEur: runde(Math.max(0, input.wbwMinEur! - restMax)), maxEur: runde(Math.max(0, input.wbwMaxEur! - restMin)) },
        ...(efTs ? [efTs] : []),
        ...(!input.fahrbereit ? [{ typ: 'abschleppkosten' as const, label: 'Abschleppkosten', minEur: config.abschleppMinEur, maxEur: config.abschleppMaxEur }] : []),
        { typ: 'gutachterkosten', label: 'Sachverständigenkosten', minEur: null, maxEur: null, gedecktDurchGegner: true, hinweis: 'Bei klarer Haftung trägt die gegnerische Versicherung diese Kosten.' },
        ...(gegnerHaftet ? [anwaltskostenPosition()] : []),
        { typ: 'kostenpauschale', label: 'Auslagenpauschale', minEur: config.kostenpauschaleEur, maxEur: config.kostenpauschaleEur },
        { typ: 'ummeldung', label: 'An- und Abmeldung', minEur: config.ummeldungEur, maxEur: config.ummeldungEur, hinweis: 'Wrack abmelden, Ersatzfahrzeug anmelden' },
      ]
      const tsMin = runde(tsPositionen.reduce((s, p) => s + (p.minEur ?? 0), 0))
      const tsMax = runde(tsPositionen.reduce((s, p) => s + (p.maxEur ?? 0), 0))
      const totalschadenWeg: AnspruchWeg = { titel: 'Totalschaden abrechnen', positionen: tsPositionen, summeMinEur: tsMin, summeMaxEur: tsMax }

      // Reparatur-Weg nur bis 130% WBW (Zone B). Enthaelt die schon berechneten Zone-A-Positionen (inkl. Wertminderung).
      const bis130 = verhaeltnis <= config.reparaturGrenzeProzent
      const reparaturWeg: AnspruchWeg | null = bis130
        ? { titel: 'Reparieren & Fahrzeug behalten', positionen: [...positionen], summeMinEur: gesamtMinEur, summeMaxEur: gesamtMaxEur }
        : null

      const reparaturMitteWeg = reparaturWeg ? (reparaturWeg.summeMinEur + reparaturWeg.summeMaxEur) / 2 : null
      const tsMitte = (tsMin + tsMax) / 2
      const guenstiger: 'reparatur' | 'totalschaden' =
        reparaturMitteWeg != null && reparaturMitteWeg >= tsMitte ? 'reparatur' : 'totalschaden'

      // 130%-Hinweis: Reparaturkosten uebersteigen WBW, aber Weg ist noch moeglich (Zone B, bis130=true)
      const hinweisReparatur: string | undefined =
        bis130 && reparaturMitte > wbwMitte
          ? 'Reparaturkosten über dem Wiederbeschaffungswert (bis 130 %) werden nur erstattet, wenn fachgerecht repariert wird und Sie das Fahrzeug mindestens 6 Monate weiter nutzen.'
          : undefined

      totalschaden = {
        wbwMinEur: input.wbwMinEur!, wbwMaxEur: input.wbwMaxEur!,
        restwertMinEur: restMin, restwertMaxEur: restMax,
        reparaturWeg, totalschadenWeg, reparaturBis130Moeglich: bis130, guenstiger,
        ...(hinweisReparatur ? { hinweisReparatur } : {}),
      }
    }
  }

  return { positionen, gesamtMinEur, gesamtMaxEur, hinweise, schuld, ...(totalschaden ? { totalschaden } : {}) }
}
