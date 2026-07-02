import type {
  AnspruchConfig, AnspruchPosition, AnspruchSpanne, Segment, SegmentSatz,
  SchaetzInput, WertminderungFaktor,
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

  return { positionen, gesamtMinEur, gesamtMaxEur, hinweise }
}
