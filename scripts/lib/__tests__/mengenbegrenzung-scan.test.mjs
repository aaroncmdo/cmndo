import { describe, it, expect } from 'vitest'

import {
  scanContent,
  diffBaseline,
  stripComments,
  GROSSE_TABELLEN,
  SKIP_MARKER,
} from '../mengenbegrenzung-scan.mjs'

describe('mengenbegrenzung-scan', () => {
  describe('flaggt', () => {
    it('eine ungebremste Kette auf einer grossen Tabelle', () => {
      const src = `
const { data } = await supabase
  .from('tasks')
  .select('id, titel, faellig_am')
  .not('faellig_am', 'is', null)
`
      const t = scanContent(src)
      expect(t).toHaveLength(1)
      expect(t[0].table).toBe('tasks')
      expect(t[0].zeilen).toBe(GROSSE_TABELLEN.tasks)
    })

    it('auch bei nicht-ID-Filtern, die die Menge nicht klein halten', () => {
      const src = `
const { data } = await db.from('sv_leads').select('id, lat, lng').eq('ist_aktiv', true)
`
      expect(scanContent(src)).toHaveLength(1)
    })
  })

  describe('flaggt NICHT', () => {
    it('bei .limit()', () => {
      const src = `await db.from('tasks').select('id').limit(50)`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('bei .range() — der alleSeiten-Pfad', () => {
      const src = `
const gelesen = await alleSeiten((von, bis) =>
  supabase
    .from('tasks')
    .select('id, titel')
    .not('faellig_am', 'is', null)
    .order('id', { ascending: true })
    .range(von, bis),
)
`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('bei .single() / .maybeSingle()', () => {
      expect(scanContent(`await db.from('tasks').select('*').single()`)).toHaveLength(0)
      expect(scanContent(`await db.from('nachrichten').select('*').maybeSingle()`)).toHaveLength(0)
    })

    it('bei head-count', () => {
      const src = `await db.from('sv_leads').select('id', { count: 'exact', head: true })`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('bei einem ID-Filter — die Menge haengt an den Kennungen, nicht an der Tabelle', () => {
      const src = `await db.from('timeline').select('*').eq('fall_id', id)`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('bei einer kleinen Tabelle', () => {
      const src = `await db.from('sachverstaendige').select('id, firmenname').eq('ist_aktiv', true)`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('bei Writes — andere Fehlerklasse (check:silent-writes)', () => {
      const src = `await db.from('tasks').update({ status: 'erledigt' }).eq('typ', 'x')`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('bei gesetztem Skip-Marker', () => {
      const src = `// ${SKIP_MARKER} Vollabzug fuer den Export ist gewollt
await db.from('tasks').select('id').not('faellig_am', 'is', null)`
      expect(scanContent(src)).toHaveLength(0)
    })
  })

  // ── Die drei Fallen, die beim Bau real zugeschlagen haben ────────────────
  describe('Fallen aus dem Bau (09.09.2026)', () => {
    it('⭐ ein Kommentar MITTEN in der Kette darf sie nicht abschneiden', () => {
      // Der erste Scanner brach die Kette am ersten `//` ab — genau dort steht in den
      // reparierten Stellen die Erklaerung, direkt VOR `.order().range()`. Vier gefixte
      // Stellen wurden dadurch als kaputt gemeldet.
      const src = `
const gelesen = await alleSeiten((von, bis) =>
  supabase
    .from('sv_leads')
    .select('id, lat, lng')
    .eq('ist_aktiv', true)
    // Ein Zweitschluessel ist Pflicht: ohne stabile Reihenfolge kann dieselbe
    // Zeile auf zwei Seiten erscheinen — oder auf keiner.
    .order('id', { ascending: true })
    .range(von, bis),
)
`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('⭐ eine ueber eine Variable aufgebaute Kette wird nie geflaggt', () => {
      // `sv-basic/claim-actions.ts` baut so auf und haengt `.limit(20)` an die
      // AWAIT-Anweisung. Wer nur die zusammenhaengende Kette liest, sieht die Grenze
      // nicht — und meldet einen Fehlalarm.
      const src = `
let q = adminDb
  .from('sv_leads')
  .select('id, name')
  .eq('ist_aktiv', true)
for (const t of tokens) {
  q = q.or([\`name.ilike.%\${t}%\`].join(','))
}
const { data } = await q.limit(20)
`
      expect(scanContent(src)).toHaveLength(0)
    })

    it('⭐ ein Blockkommentar mit .from() erzeugt keinen Treffer', () => {
      const src = `
/* Frueher stand hier:
   await db.from('tasks').select('id').not('faellig_am', 'is', null)
*/
await db.from('tasks').select('id').limit(10)
`
      expect(scanContent(src)).toHaveLength(0)
    })
  })

  describe('stripComments', () => {
    it('erhaelt die Zeilenzahl', () => {
      const src = 'a\n// weg\nb\n/* auch\n weg */\nc'
      expect(stripComments(src).split('\n')).toHaveLength(src.split('\n').length)
    })

    it('zerlegt keine URL', () => {
      expect(stripComments(`const u = 'https://x.de/a'`)).toContain('https://x.de/a')
    })
  })

  describe('diffBaseline', () => {
    it('trennt neu und behoben', () => {
      const d = diffBaseline(['a.ts', 'c.ts'], ['a.ts', 'b.ts'])
      expect(d.neu).toEqual(['c.ts'])
      expect(d.behoben).toEqual(['b.ts'])
    })

    it('meldet nichts, wenn alles unveraendert ist', () => {
      const d = diffBaseline(['a.ts'], ['a.ts'])
      expect(d.neu).toEqual([])
      expect(d.behoben).toEqual([])
    })
  })
})
