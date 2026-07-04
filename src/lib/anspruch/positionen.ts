import type {
  AnspruchConfig, AnspruchPosition, AnspruchSpanne, AnspruchWeg, Segment, SegmentSatz,
  SchaetzInput, TotalschadenInfo, WertminderungFaktor,
} from './types'

function runde(n: number): number {
  return Math.round(n)
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
): AnspruchSpanne {
  const positionen: AnspruchPosition[] = []
  const hinweise: string[] = []
  const reparaturMitte = (input.reparaturMinEur + input.reparaturMaxEur) / 2

  // 1) Reparaturkosten — immer
  positionen.push({
    typ: 'reparatur',
    label: 'Reparaturkosten',
    minEur: runde(input.reparaturMinEur),
    maxEur: runde(input.reparaturMaxEur),
  })

  // 2) Nutzungsausfall — nur wenn nicht fahrbereit
  if (!input.fahrbereit) {
    const satz = saetze[input.segment]
    const dauer = config.dauerTage[input.schweregrad]
    positionen.push({
      typ: 'nutzungsausfall',
      label: 'Nutzungsausfall',
      minEur: runde(satz.tagessatzMinEur * dauer.min),
      maxEur: runde(satz.tagessatzMaxEur * dauer.max),
      hinweis: `${satz.tagessatzMinEur}–${satz.tagessatzMaxEur} €/Tag × ${dauer.min}–${dauer.max} Tage`,
    })
  }

  // 3) Wertminderung — nur jung + Substanz + ueber Schwelle
  const alter = input.ezJahr != null ? input.aktuellesJahr - input.ezJahr : null
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

  // 4) Sachverstaendigenkosten — immer, getragen von Gegnerversicherung (nicht in Gesamt)
  positionen.push({
    typ: 'gutachterkosten',
    label: 'Sachverständigenkosten',
    minEur: null,
    maxEur: null,
    gedecktDurchGegner: true,
    hinweis: 'Bei klarer Haftung trägt die gegnerische Versicherung diese Kosten.',
  })

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
      const satz = saetze[input.segment]
      // Totalschaden-Weg: WBW - Restwert + Nutzungsausfall (Wiederbeschaffungsdauer) + Auslagenpauschale
      const tsPositionen: AnspruchPosition[] = [
        { typ: 'reparatur', label: 'Fahrzeugschaden (Wiederbeschaffung − Restwert)', minEur: runde(Math.max(0, input.wbwMinEur! - restMax)), maxEur: runde(Math.max(0, input.wbwMaxEur! - restMin)) },
        { typ: 'nutzungsausfall', label: 'Nutzungsausfall (Wiederbeschaffung)', minEur: runde(satz.tagessatzMinEur * dauer.min), maxEur: runde(satz.tagessatzMaxEur * dauer.max), hinweis: `${satz.tagessatzMinEur}–${satz.tagessatzMaxEur} €/Tag × ${dauer.min}–${dauer.max} Tage` },
        { typ: 'kostenpauschale', label: 'Auslagenpauschale', minEur: config.kostenpauschaleEur, maxEur: config.kostenpauschaleEur },
      ]
      const tsMin = runde(tsPositionen.reduce((s, p) => s + (p.minEur ?? 0), 0))
      const tsMax = runde(tsPositionen.reduce((s, p) => s + (p.maxEur ?? 0), 0))
      const totalschadenWeg: AnspruchWeg = { titel: 'Totalschaden abrechnen', positionen: tsPositionen, summeMinEur: tsMin, summeMaxEur: tsMax }

      // Reparatur-Weg nur bis 130% WBW (Zone B). Enthaelt die schon berechneten Zone-A-Positionen (inkl. Wertminderung).
      const bis130 = verhaeltnis <= config.reparaturGrenzeProzent
      const reparaturWeg: AnspruchWeg | null = bis130
        ? { titel: 'Reparieren & Fahrzeug behalten', positionen: [...positionen], summeMinEur: gesamtMinEur, summeMaxEur: gesamtMaxEur }
        : null

      const guenstiger: 'reparatur' | 'totalschaden' =
        reparaturWeg && reparaturWeg.summeMaxEur >= tsMax ? 'reparatur' : 'totalschaden'

      totalschaden = {
        wbwMinEur: input.wbwMinEur!, wbwMaxEur: input.wbwMaxEur!,
        restwertMinEur: restMin, restwertMaxEur: restMax,
        reparaturWeg, totalschadenWeg, reparaturBis130Moeglich: bis130, guenstiger,
      }
    }
  }

  return { positionen, gesamtMinEur, gesamtMaxEur, hinweise, ...(totalschaden ? { totalschaden } : {}) }
}
