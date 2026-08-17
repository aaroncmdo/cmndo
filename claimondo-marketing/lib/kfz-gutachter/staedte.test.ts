import { describe, expect, it } from 'vitest'
import { STAEDTE, getHubCities, getStadtByName, getStadtBySlug } from './staedte'

/** Die Hub-Daten ueber die vorhandene API statt eines neuen Exports. */
const hub = (slug: string) => getHubCities().find((h) => h.slug === slug)!.hyperlocal

describe('getStadtByName', () => {
  it('findet eine Stadt ueber ihren Anzeigenamen', () => {
    expect(getStadtByName('Leverkusen')?.slug).toBe('leverkusen')
    expect(getStadtByName('Köln')?.slug).toBe('koeln')
  })

  it('findet auch mehrteilige Namen', () => {
    expect(getStadtByName('Bergisch Gladbach')?.slug).toBe('bergisch-gladbach')
    expect(getStadtByName('Sankt Augustin')?.slug).toBe('sankt-augustin')
  })

  it('liefert null fuer einen Ort ohne eigene Seite', () => {
    // Roesrath und Wesseling stehen in koelns angrenzendeOrte, haben aber keine
    // Stadtseite. Ein Link dorthin waere eine 404.
    expect(getStadtByName('Rösrath')).toBeNull()
    expect(getStadtByName('Wesseling')).toBeNull()
    expect(getStadtByName('')).toBeNull()
  })

  it('toleriert umgebende Leerzeichen', () => {
    expect(getStadtByName('  Bonn  ')?.slug).toBe('bonn')
  })

  it('matcht exakt und nicht unscharf', () => {
    // Unscharfes Matching wuerde falsche Links erzeugen: 'Monheim' (ohne Zusatz)
    // steht in duesseldorfs angrenzendeOrte und ist NICHT 'Monheim am Rhein'.
    expect(getStadtByName('Koln')).toBeNull()
    expect(getStadtByName('koeln')).toBeNull()
    expect(getStadtByName('Köln-Ehrenfeld')).toBeNull()
  })
})

describe('STAEDTE — Voraussetzungen fuer die Namensauflösung', () => {
  it('hat eindeutige Anzeigenamen', () => {
    // Ohne Eindeutigkeit waere getStadtByName nicht wohldefiniert.
    const doppelt = STAEDTE.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)
    expect([...new Set(doppelt)]).toEqual([])
  })

  it('hat eindeutige Slugs', () => {
    const doppelt = STAEDTE.map((s) => s.slug).filter((s, i, a) => a.indexOf(s) !== i)
    expect([...new Set(doppelt)]).toEqual([])
  })
})

describe('angrenzendeOrte — welche sind verlinkbar', () => {
  const alleOrte = getHubCities().flatMap((h) => h.hyperlocal.angrenzendeOrte)

  it('sind mehr Orte als verlinkbare — der Rest bleibt bewusst Text', () => {
    const verlinkbar = alleOrte.filter((ort) => getStadtByName(ort) !== null)
    expect(alleOrte.length).toBeGreaterThan(verlinkbar.length)
    expect(verlinkbar.length).toBe(21)
  })

  it('loest jeden verlinkbaren Ort auf eine existierende Seite auf', () => {
    // Der eigentliche Vertrag: kein Link darf ins Leere zeigen.
    const kaputt = alleOrte
      .map((ort) => ({ ort, ziel: getStadtByName(ort) }))
      .filter((x) => x.ziel !== null && getStadtBySlug(x.ziel.slug) === null)
    expect(kaputt).toEqual([])
  })

  it('deckt die Hub->Spoke-Kanten ab, die die Nachbarauswahl nicht zieht', () => {
    // Der Grund, warum A2 keinen eigenen "Auch im Umland"-Block braucht:
    // diese sieben Kanten fehlen der Distanzauswahl und stecken alle in
    // angrenzendeOrte.
    const fehlend = [
      ['duesseldorf', 'Langenfeld'],
      ['duesseldorf', 'Dormagen'],
      ['wuppertal', 'Velbert'],
      ['wuppertal', 'Haan'],
      ['bonn', 'Siegburg'],
      ['bonn', 'Hennef'],
      ['bonn', 'Meckenheim'],
    ] as const
    for (const [hubSlug, ort] of fehlend) {
      expect(hub(hubSlug).angrenzendeOrte).toContain(ort)
      expect(getStadtByName(ort)).not.toBeNull()
    }
  })
})

describe('Stammdaten-Invarianten — gelten fuer JEDE Stadt, auch kuenftige', () => {
  // Diese Bloecke pruefen nicht die drei neuen Eintraege, sondern die Regeln,
  // gegen die jeder neue Eintrag verstossen koennte. In P1 stand auf 31 von 84
  // Seiten ein Gericht in einer ANDEREN Stadt — solche Fehler faengt nur eine
  // Invariante, kein Einzeltest.

  it('hat fuer jede Stadt die drei Rechtsanker gesetzt', () => {
    const luecken = STAEDTE.filter(
      (s) => !s.lokal?.landgericht?.trim() || !s.lokal?.amtsgericht?.trim() || !s.lokal?.kammer?.trim(),
    )
    expect(luecken.map((s) => s.slug)).toEqual([])
  })

  it('nennt Gerichte mit ihrer Gattung, nicht nur den Ortsnamen', () => {
    // Kammer nur ENTHALTEN, nicht beginnend: einige heissen amtlich anders
    // ("Hanseatische Rechtsanwaltskammer Hamburg", "Schleswig-Holsteinische
    // Rechtsanwaltskammer"). Die erste Fassung dieser Invariante flaggte genau
    // diese drei — der Test war zu eng, nicht die Daten falsch.
    const falsch = STAEDTE.filter(
      (s) =>
        !s.lokal.landgericht.startsWith('Landgericht') ||
        !s.lokal.amtsgericht.startsWith('Amtsgericht') ||
        !s.lokal.kammer.includes('Rechtsanwaltskammer'),
    )
    expect(falsch.map((s) => `${s.slug}: ${s.lokal.amtsgericht} / ${s.lokal.kammer}`)).toEqual([])
  })

  it('haelt Landgericht und Rechtsanwaltskammer konsistent', () => {
    // Die Kammer folgt dem OLG-Bezirk. Wer ein Landgericht neu einträgt, muss
    // dieselbe Kammer nehmen wie alle anderen Städte dieses Bezirks — sonst
    // widersprechen sich zwei Stadtseiten in derselben Rechtsfrage.
    const zuordnung = new Map<string, Set<string>>()
    for (const s of STAEDTE) {
      if (!zuordnung.has(s.lokal.landgericht)) zuordnung.set(s.lokal.landgericht, new Set())
      zuordnung.get(s.lokal.landgericht)!.add(s.lokal.kammer)
    }
    const widerspruch = [...zuordnung.entries()]
      .filter(([, kammern]) => kammern.size > 1)
      .map(([lg, k]) => `${lg} -> ${[...k].join(' UND ')}`)
    expect(widerspruch).toEqual([])
  })

  it('haelt die Koordinaten im deutschen Rahmen', () => {
    const daneben = STAEDTE.filter(
      (s) => !(s.lat > 47 && s.lat < 55.1) || !(s.lng > 5.8 && s.lng < 15.1),
    )
    expect(daneben.map((s) => `${s.slug} ${s.lat}/${s.lng}`)).toEqual([])
  })

  it('hat eindeutige Koordinaten je Stadt', () => {
    // Zwei Städte auf demselben Punkt heisst: irgendwo wurde kopiert und der
    // Ort nicht nachgezogen. Die Nachbarauswahl rechnet dann Unsinn.
    const gesehen = new Map<string, string>()
    const doppelt: string[] = []
    for (const s of STAEDTE) {
      const punkt = `${s.lat.toFixed(3)}/${s.lng.toFixed(3)}`
      if (gesehen.has(punkt)) doppelt.push(`${gesehen.get(punkt)} == ${s.slug}`)
      gesehen.set(punkt, s.slug)
    }
    expect(doppelt).toEqual([])
  })

  it('hat plausible plzPrefix- und Honorar-Angaben', () => {
    const kaputt = STAEDTE.filter(
      (s) => !/^\d{1,3}(–\d{1,3})?$/.test(s.plzPrefix) || !/^\d{3}–\d\.\d{3} €$/.test(s.bvskHonorarSpanne),
    )
    expect(kaputt.map((s) => `${s.slug}: plz=${s.plzPrefix} bvsk=${s.bvskHonorarSpanne}`)).toEqual([])
  })

  it('formuliert den h1Anker als Ortsangabe', () => {
    const falsch = STAEDTE.filter((s) => !/^(in|im|auf) /.test(s.h1Anker))
    expect(falsch.map((s) => `${s.slug}: ${s.h1Anker}`)).toEqual([])
  })
})

describe('P3-B2 — die drei neuen Orte', () => {
  // Belegt am 17.08.2026; Quellen im Commit-Body. Der kritische Wert ist die
  // Gerichtskette: Erkelenz und Heinsberg liegen im SELBEN Kreis, gehoeren aber
  // zu VERSCHIEDENEN Landgerichten. Wer das aus der Nachbarschaft ableitet,
  // schreibt auf einer der beiden Seiten ein falsches Gericht.
  const neu = [
    { slug: 'bocholt', name: 'Bocholt', ag: 'Amtsgericht Bocholt', lg: 'Landgericht Münster', kammer: 'Rechtsanwaltskammer Hamm' },
    { slug: 'erkelenz', name: 'Erkelenz', ag: 'Amtsgericht Erkelenz', lg: 'Landgericht Mönchengladbach', kammer: 'Rechtsanwaltskammer Düsseldorf' },
    { slug: 'heinsberg', name: 'Heinsberg', ag: 'Amtsgericht Heinsberg', lg: 'Landgericht Aachen', kammer: 'Rechtsanwaltskammer Köln' },
  ] as const

  it.each(neu)('$slug hat die belegte Gerichtskette', ({ slug, name, ag, lg, kammer }) => {
    const s = getStadtBySlug(slug)
    expect(s).not.toBeNull()
    expect(s!.name).toBe(name)
    expect(s!.lokal.amtsgericht).toBe(ag)
    expect(s!.lokal.landgericht).toBe(lg)
    expect(s!.lokal.kammer).toBe(kammer)
  })

  it('trennt Erkelenz und Heinsberg trotz gemeinsamer Kreiszugehoerigkeit', () => {
    expect(getStadtBySlug('erkelenz')!.lokal.landgericht).not.toBe(
      getStadtBySlug('heinsberg')!.lokal.landgericht,
    )
  })

  it('bringt die Staedtezahl auf 95', () => {
    expect(STAEDTE).toHaveLength(95)
  })
})
