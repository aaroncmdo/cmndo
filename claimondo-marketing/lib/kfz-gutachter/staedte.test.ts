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
    // Beispiele aus dem Umland der Nicht-NRW-Hubs. Sie stehen in
    // angrenzendeOrte und haben keine Stadtseite — ein Link dorthin waere 404.
    //
    // ⚠ Dieser Test wurde schon zweimal von der Wirklichkeit ueberholt: erst
    // stand Roesrath hier, dann Wesseling/Bruehl/Huerth — alle haben inzwischen
    // eine Seite. Der Ausbau lief bisher in NRW, deshalb jetzt Beispiele aus
    // Hamburg-, Berlin- und Muenchen-Umland. Wer dort ausbaut, tauscht sie
    // wieder; die generische Absicherung leistet ohnehin der Verkuerzungs-Test
    // weiter unten, nicht diese Einzelfaelle.
    expect(getStadtByName('Norderstedt')).toBeNull()
    expect(getStadtByName('Teltow')).toBeNull()
    expect(getStadtByName('Dachau')).toBeNull()
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

describe('STAEDTE – Voraussetzungen fuer die Namensauflösung', () => {
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

describe('angrenzendeOrte – welche sind verlinkbar', () => {
  const alleOrte = getHubCities().flatMap((h) => h.hyperlocal.angrenzendeOrte)

  it('sind mehr Orte als verlinkbare – der Rest bleibt bewusst Text', () => {
    const verlinkbar = alleOrte.filter((ort) => getStadtByName(ort) !== null)
    expect(alleOrte.length).toBeGreaterThan(verlinkbar.length)
    // 29 -> 37 (Welle 8) -> 48 (Welle 9): die neuen Orte standen alle schon als
    // Text in angrenzendeOrte und werden allein durch ihre Existenz zu Links.
    // Damit hat KEIN NRW-Ort aus diesen Listen mehr eine Luecke; der Rest sind
    // Umlandorte von Hamburg, Berlin und Muenchen.
    expect(verlinkbar.length).toBe(48)
  })

  it('schreibt keinen Ort verkuerzt, dessen Langform eine Seite hat', () => {
    // Der teure Fehler ist nicht der 404-Link, sondern der Link, der NIE
    // ENTSTEHT: 'Monheim' in duesseldorfs Liste meinte immer 'Monheim am
    // Rhein'. Solange die Stadt keine Seite hatte, war das folgenlos — mit
    // Welle 7 bekam sie eine, und der exakte Namensvergleich haette den Link
    // stillschweigend uebersprungen. Kein Build, kein tsc und auch der
    // 404-Test oben faengt das, weil nichts kaputt ist: es fehlt nur.
    //
    // Generisch statt fallbezogen, weil jede kuenftige Welle dieselbe Falle
    // stellt — 'Menden' vs 'Menden (Sauerland)', 'Gronau' vs 'Gronau (Westf.)'.
    const verkuerzt: string[] = []
    for (const hub of getHubCities()) {
      for (const ort of hub.hyperlocal.angrenzendeOrte) {
        if (getStadtByName(ort)) continue
        const langform = STAEDTE.find(
          (s) => s.name !== ort && (s.name.startsWith(`${ort} `) || s.name.startsWith(`${ort} (`)),
        )
        if (langform) verkuerzt.push(`${hub.slug}: '${ort}' -> '${langform.name}'`)
      }
    }
    expect(verkuerzt).toEqual([])
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

describe('Stammdaten-Invarianten – gelten fuer JEDE Stadt, auch kuenftige', () => {
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

describe('P3-B2 – die drei neuen Orte', () => {
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

})

describe('P3-B2c – NRW zwischen 40 und 60 Tsd. Einwohnern', () => {
  // Belegt am 17.08.2026; Quellen im Commit-Body. Geprueft werden nur die
  // Ketten, die man sich NICHT aus der Nachbarschaft herleiten kann — die
  // uebrigen 29 deckt die LG-Kammer-Invariante oben ab.
  const knifflig = [
    // Naeher liegt das AG Kerpen; zustaendig ist trotzdem Bruehl.
    { slug: 'erftstadt', ag: 'Amtsgericht Brühl', lg: 'Landgericht Köln' },
    // Ohne eigenes AG, und das zustaendige liegt im Nachbarkreis.
    { slug: 'bad-salzuflen', ag: 'Amtsgericht Lemgo', lg: 'Landgericht Detmold' },
    { slug: 'loehne', ag: 'Amtsgericht Bad Oeynhausen', lg: 'Landgericht Bielefeld' },
    { slug: 'monheim-am-rhein', ag: 'Amtsgericht Langenfeld', lg: 'Landgericht Düsseldorf' },
    { slug: 'willich', ag: 'Amtsgericht Krefeld', lg: 'Landgericht Krefeld' },
    { slug: 'kaarst', ag: 'Amtsgericht Neuss', lg: 'Landgericht Düsseldorf' },
  ] as const

  it.each(knifflig)('$slug hat die belegte Gerichtskette', ({ slug, ag, lg }) => {
    const s = getStadtBySlug(slug)
    expect(s).not.toBeNull()
    expect(s!.lokal.amtsgericht).toBe(ag)
    expect(s!.lokal.landgericht).toBe(lg)
  })

  it('trennt Bad Salzuflen und Loehne trotz ~20 km Abstand', () => {
    // Beide Ostwestfalen, beide ohne eigenes Amtsgericht, verschiedene
    // Landgerichte. Wer von einem auf den anderen schliesst, liegt falsch.
    expect(getStadtBySlug('bad-salzuflen')!.lokal.landgericht).not.toBe(
      getStadtBySlug('loehne')!.lokal.landgericht,
    )
  })

  it('verlinkt Monheim am Rhein aus beiden Nachbar-Hubs', () => {
    // Koeln fuehrte den vollen Namen, Duesseldorf die Kurzform — der Link
    // waere nur auf einer der beiden Seiten entstanden.
    const ausHub = (slug: string) =>
      getHubCities().find((h) => h.slug === slug)!.hyperlocal.angrenzendeOrte
    expect(ausHub('koeln')).toContain('Monheim am Rhein')
    expect(ausHub('duesseldorf')).toContain('Monheim am Rhein')
    expect(getStadtByName('Monheim am Rhein')?.slug).toBe('monheim-am-rhein')
  })
})

describe('P3-B3 – Auswahl nach SV-Abdeckung', () => {
  // Belegt am 18.08.2026 gegen die echten isochrone_polygon (Point-in-Polygon,
  // nicht Radius). Geprueft werden die Ketten, die sich NICHT aus der
  // Nachbarschaft herleiten lassen — der Rest faellt unter die LG-Kammer-
  // Invariante oben.
  const knifflig = [
    // Im Bergischen gelegen, aber Koeln zustaendig — Remscheid (LG Wuppertal)
    // liegt naeher.
    { slug: 'radevormwald', ag: 'Amtsgericht Wipperfürth', lg: 'Landgericht Köln' },
    // Rhein-Kreis Neuss, aber AG Neuss — waehrend Grevenbroich im selben Kreis
    // zu AG Moenchengladbach gehoert.
    { slug: 'korschenbroich', ag: 'Amtsgericht Neuss', lg: 'Landgericht Düsseldorf' },
    { slug: 'sprockhoevel', ag: 'Amtsgericht Hattingen', lg: 'Landgericht Essen' },
    { slug: 'ennepetal', ag: 'Amtsgericht Schwelm', lg: 'Landgericht Hagen' },
    { slug: 'roesrath', ag: 'Amtsgericht Bergisch Gladbach', lg: 'Landgericht Köln' },
    { slug: 'wuelfrath', ag: 'Amtsgericht Mettmann', lg: 'Landgericht Wuppertal' },
  ] as const

  it.each(knifflig)('$slug hat die belegte Gerichtskette', ({ slug, ag, lg }) => {
    const s = getStadtBySlug(slug)
    expect(s).not.toBeNull()
    expect(s!.lokal.amtsgericht).toBe(ag)
    expect(s!.lokal.landgericht).toBe(lg)
  })

  it('trennt Radevormwald und Remscheid trotz 12 km Abstand', () => {
    expect(getStadtBySlug('radevormwald')!.lokal.landgericht).not.toBe(
      getStadtBySlug('remscheid')!.lokal.landgericht,
    )
  })

  it('nahm die kleineren Orte VOR den groesseren auf', () => {
    // Der Kern dieser Welle war: Auswahlkriterium ist die gemessene Abdeckung
    // durch einen verifizierten Sachverstaendigen, nicht Groesse und nicht
    // Distanz. Roesrath (29 Tsd.) kam deshalb rein, das groessere und naeher an
    // Koeln liegende Huerth (62 Tsd.) nicht — dort deckt keine Isochrone.
    //
    // ⚠ Die urspruengliche Fassung pruefte `getStadtByName('Hürth') === null`.
    // Das ging mit Welle 9 kaputt, die Huerth aus einem ANDEREN Grund aufnahm
    // (Luecke oberhalb 40 Tsd.). Beide Gruende stehen nebeneinander und
    // widersprechen sich nicht — nachweisbar bleibt die Reihenfolge, und genau
    // die traegt die Aussage.
    const rang = (slug: string) => STAEDTE.findIndex((s) => s.slug === slug)
    expect(rang('roesrath')).toBeGreaterThan(-1)
    expect(rang('roesrath')).toBeLessThan(rang('huerth'))
    expect(rang('roesrath')).toBeLessThan(rang('bruehl'))
  })
})

describe('P3-B4 – Vollstaendigkeit NRW ab 40 Tsd.', () => {
  // ⭐ DER TEST, DER GEFEHLT HAT.
  //
  // Bis zum 18.08.2026 entstanden die Wellen aus Einzelrecherchen, und die
  // Aussage "NRW ab 40 Tsd. ist vollstaendig" wurde nie gegen eine Gesamtliste
  // gehalten. Der erste Abgleich fand sieben Fehlende — darunter Huerth mit
  // 61.732 Einwohnern, das schon in Welle 6 ("die 23 fehlenden Staedte ueber
  // 60 Tsd.") haette stehen muessen. Eine Luecke dieser Art faellt niemandem
  // auf: die Seite fehlt einfach, es gibt keinen Fehler, den man sehen koennte.
  //
  // Quelle: Wikipedia "Liste der Gemeinden in Nordrhein-Westfalen",
  // Stand 31.12.2025 — alle 98 Gemeinden ab 40.000 Einwohnern.
  //
  // ⚠ Die Liste ist eine Momentaufnahme. Waechst eine Gemeinde ueber die
  // Schwelle, gehoert sie hier ergaenzt (und dann gebaut). Wer die naechste
  // Groessenklasse aufnimmt, erweitert diese Liste — sie ist das Gegenstueck
  // zur Behauptung, nicht ihre Wiederholung.
  const NRW_AB_40_TSD = [
    'Köln', 'Düsseldorf', 'Dortmund', 'Essen', 'Duisburg', 'Bochum', 'Wuppertal',
    'Bielefeld', 'Bonn', 'Münster', 'Mönchengladbach', 'Gelsenkirchen', 'Aachen',
    'Krefeld', 'Oberhausen', 'Hagen', 'Hamm', 'Mülheim an der Ruhr', 'Leverkusen',
    'Solingen', 'Herne', 'Paderborn', 'Neuss', 'Bottrop', 'Recklinghausen',
    'Remscheid', 'Bergisch Gladbach', 'Siegen', 'Moers', 'Gütersloh', 'Düren',
    'Witten', 'Iserlohn', 'Ratingen', 'Marl', 'Lünen', 'Minden', 'Velbert',
    'Viersen', 'Dorsten', 'Arnsberg', 'Detmold', 'Bocholt', 'Castrop-Rauxel',
    'Lüdenscheid', 'Lippstadt', 'Herford', 'Dinslaken', 'Dormagen', 'Bergheim',
    'Hürth', 'Wesel', 'Herten', 'Euskirchen', 'Langenfeld', 'Unna',
    'Stolberg (Rheinland)', 'Eschweiler', 'Meerbusch', 'Sankt Augustin', 'Pulheim',
    'Hilden', 'Bad Salzuflen', 'Kleve', 'Hattingen', 'Ahlen', 'Menden (Sauerland)',
    'Frechen', 'Ibbenbüren', 'Gummersbach', 'Bad Oeynhausen', 'Gronau (Westf.)',
    'Willich', 'Bergkamen', 'Alsdorf', 'Erftstadt', 'Herzogenrath', 'Hennef',
    'Rheda-Wiedenbrück', 'Bornheim', 'Dülmen', 'Soest', 'Bünde', 'Schwerte',
    'Brühl', 'Erkelenz', 'Monheim am Rhein', 'Erkrath', 'Kaarst', 'Borken',
    'Heinsberg', 'Kamen', 'Nettetal', 'Hückelhoven', 'Löhne', 'Königswinter',
    'Würselen', 'Ahaus',
  ]

  it('kennt die Liste in der erwarteten Groesse', () => {
    // Reissleine: waere die Liste beim Kopieren verkuerzt worden, liefe der
    // Test darunter gruen und pruefte fast nichts.
    expect(NRW_AB_40_TSD).toHaveLength(98)
    expect(new Set(NRW_AB_40_TSD).size).toBe(98)
  })

  it('fuehrt eine Seite fuer JEDE NRW-Gemeinde ab 40 Tsd. Einwohnern', () => {
    const fehlend = NRW_AB_40_TSD.filter((name) => getStadtByName(name) === null)
    expect(fehlend).toEqual([])
  })
})

describe('Gesamtbestand', () => {
  // Waechst mit jeder Welle mit. Der Wert ist bewusst hart: eine Stadt, die
  // beim Rebase verloren geht, faellt sonst niemandem auf.
  it('fuehrt 173 Staedte', () => {
    expect(STAEDTE).toHaveLength(173)
  })
})
