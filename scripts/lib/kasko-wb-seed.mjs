// Pure Generator der Kasko-Werkstattbindungs-Wissensbasis: JSON (scripts/kasko-wb/wissensbasis-*.json)
// -> idempotentes Upsert-SQL OHNE UUIDs (Marken per slug, Tarife per (slug, anzeigename), Rechtstraeger-FK
// per UPDATE ... FROM versicherungen v WHERE v.name = ...). Replay-fest, weil der versicherungen-Seed selbst
// nicht versioniert ist (Scan 03.09.: 55 von 97 Zeilen im Repo). Kein DB-Zugriff hier.

const WB_STATUS = new Set(['optional', 'standard', 'keine'])
const UMFANG = new Set(['keine', 'voll', 'nur_glas', 'unklar'])
const VERLAESSLICHKEIT = new Set(['belegt', 'abgeleitet', 'nicht_belegt'])
const VERTRIEB = new Set(['P', 'L'])
const SANKTION = new Set(['kuerzung_80', 'kuerzung_85', 'sonder_sb', 'deckelung', 'vollverweigerung', 'kuerzung_unbestimmt', 'keine', 'unbekannt'])

export function sqlLit(s) {
  if (s === null || s === undefined) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}

export function sqlTextArray(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]"
  return `ARRAY[${arr.map((s) => sqlLit(s)).join(',')}]::text[]`
}

function tarifZeile(linie, zusatz, wb, umfang, verlaesslichkeit, reihenfolge) {
  return {
    linie,
    wb_zusatz: zusatz ?? null,
    anzeigename: zusatz ? `${linie} ${zusatz}` : linie,
    hat_werkstattbindung: wb,
    bindungsumfang: wb ? umfang ?? 'voll' : 'keine',
    verlaesslichkeit,
    reihenfolge,
  }
}

/** Expandiert Linien x WB-Zusaetze zu Tarifzeilen. Reihenfolge = Anzeige-Reihenfolge (10, 20, ...). */
export function expandTarife(marke) {
  const vDefault = marke.verlaesslichkeit_default ?? 'belegt'
  const rows = []
  let n = 0
  const next = () => (n += 10)

  if (Array.isArray(marke.tarife_explizit) && marke.tarife_explizit.length > 0) {
    for (const t of marke.tarife_explizit) {
      rows.push({
        linie: t.linie,
        wb_zusatz: t.wb_zusatz ?? null,
        anzeigename: t.anzeigename,
        hat_werkstattbindung: t.wb,
        bindungsumfang: t.wb ? t.umfang ?? 'voll' : 'keine',
        verlaesslichkeit: t.verlaesslichkeit ?? vDefault,
        reihenfolge: next(),
      })
    }
    return rows
  }

  const zusaetze = marke.wb_zusaetze ?? []
  for (const linie of marke.linien ?? []) {
    if (marke.wb_status !== 'standard') rows.push(tarifZeile(linie, null, false, 'keine', vDefault, next()))
    if (marke.wb_status !== 'keine') {
      for (const z of zusaetze) rows.push(tarifZeile(linie, z.zusatz, true, z.umfang, z.verlaesslichkeit ?? vDefault, next()))
    }
  }
  for (const linie of marke.linien_ohne_wb ?? []) rows.push(tarifZeile(linie, null, false, 'keine', vDefault, next()))
  for (const linie of marke.linien_nur_wb ?? []) {
    for (const z of zusaetze) rows.push(tarifZeile(linie, z.zusatz, true, z.umfang, z.verlaesslichkeit ?? vDefault, next()))
  }
  return rows
}

/** Liefert eine Liste lesbarer Fehler; leer = gueltig. */
export function validateSeed(data) {
  const errs = []
  const slugs = new Set()
  const namen = new Set()
  if (!data || !Array.isArray(data.marken)) return ['marken fehlt oder ist kein Array']
  if (!data.default_konditionen) errs.push('default_konditionen fehlt')
  for (const m of data.marken) {
    const p = `[${m.slug ?? '?'}]`
    if (!m.slug || !/^[a-z0-9-]+$/.test(m.slug)) errs.push(`${p} slug fehlt oder nicht [a-z0-9-]`)
    if (slugs.has(m.slug)) errs.push(`${p} doppelter slug`)
    slugs.add(m.slug)
    if (!m.marke) errs.push(`${p} marke fehlt`)
    if (namen.has(m.marke)) errs.push(`${p} doppelte marke`)
    namen.add(m.marke)
    if (!WB_STATUS.has(m.wb_status)) errs.push(`${p} wb_status ungueltig: ${m.wb_status}`)
    if (m.check24_vertrieb != null && !VERTRIEB.has(m.check24_vertrieb)) errs.push(`${p} check24_vertrieb ungueltig: ${m.check24_vertrieb}`)
    if (m.verlaesslichkeit_default && !VERLAESSLICHKEIT.has(m.verlaesslichkeit_default)) errs.push(`${p} verlaesslichkeit_default ungueltig`)
    for (const z of m.wb_zusaetze ?? []) {
      if (!z.zusatz) errs.push(`${p} wb_zusatz ohne Text`)
      if (z.umfang && !UMFANG.has(z.umfang)) errs.push(`${p} umfang ungueltig: ${z.umfang}`)
    }
    const rows = expandTarife(m)

    if (m.wb_status === 'optional' && (m.wb_marker ?? []).length === 0) errs.push(`${p} optional ohne wb_marker`)
    if (m.wb_status === 'keine' && ((m.wb_zusaetze ?? []).length > 0 || (m.linien_nur_wb ?? []).length > 0)) errs.push(`${p} keine mit WB-Zeile`)
    if (m.wb_status === 'standard' && rows.some((r) => !r.hat_werkstattbindung)) errs.push(`${p} standard mit freier Zeile`)
    const anzeigen = new Set()
    for (const r of rows) {
      if (anzeigen.has(r.anzeigename)) errs.push(`${p} doppelter anzeigename ${r.anzeigename}`)
      anzeigen.add(r.anzeigename)
    }
    if (m.konditionen && !SANKTION.has(m.konditionen.sanktion_modell)) errs.push(`${p} sanktion_modell ungueltig`)
  }
  if (data.default_konditionen && !SANKTION.has(data.default_konditionen.sanktion_modell)) errs.push('default sanktion_modell ungueltig')
  return errs
}

function konditionenInsert(key, markeSlug, k) {
  const markeExpr = markeSlug ? `(SELECT id FROM public.kasko_versicherer_marken WHERE slug = ${sqlLit(markeSlug)})` : 'NULL'
  return `INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES (${sqlLit(key)}, ${markeExpr}, ${sqlLit(k.nachlass_text)}, ${sqlLit(k.sanktion_modell)}, ${sqlLit(k.sanktion_text)},
  ${sqlLit(k.gilt_fuer)}, ${sqlLit(k.ausnahmen_text)}, ${sqlLit(k.partnernetz)}, ${sqlLit(k.akb_fundstelle)}, ${sqlLit(k.quelle)})
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;`
}

/** Vollstaendiges, idempotentes Seed-SQL. */
export function buildSeedSql(data) {
  const errs = validateSeed(data)
  if (errs.length) throw new Error(`Seed ungueltig:\n${errs.join('\n')}`)
  const out = []
  out.push(`-- GENERIERT von scripts/kasko-wb/generate-seed-sql.mjs aus scripts/kasko-wb/wissensbasis-${data.stand}.json`)
  out.push(`-- Quelle: ${data.quelle}. Idempotent (Upserts), keine UUIDs, Rechtstraeger-FK per Name (versicherungen-Seed ist nicht versioniert).`)
  out.push('')
  data.marken.forEach((m, idx) => {
    out.push(`-- ${m.marke}`)
    out.push(`INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES (${sqlLit(m.slug)}, ${sqlLit(m.marke)}, ${sqlLit(m.wb_status)}, ${sqlTextArray(m.wb_marker)}, ${sqlTextArray(m.nicht_wb_marker)},
  ${sqlLit(m.hinweis)}, ${sqlLit(m.varianten_hinweis)}, ${sqlLit(m.check24_vertrieb)}, ${sqlLit(data.quelle)}, ${sqlLit(data.stand)}::date, ${(idx + 1) * 10})
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();`)
    if (m.versicherung_name) {
      out.push(`UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = ${sqlLit(m.slug)} AND v.name = ${sqlLit(m.versicherung_name)} AND m.versicherung_id IS NULL;`)
    }
    for (const t of expandTarife(m)) {
      out.push(`INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, ${sqlLit(t.linie)}, ${sqlLit(t.wb_zusatz)}, ${sqlLit(t.anzeigename)}, ${t.hat_werkstattbindung}, ${sqlLit(t.bindungsumfang)}, ${sqlLit(t.verlaesslichkeit)}, ${t.reihenfolge}
FROM public.kasko_versicherer_marken m WHERE m.slug = ${sqlLit(m.slug)}
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;`)
    }
    if (m.konditionen) out.push(konditionenInsert(m.slug, m.slug, m.konditionen))
    out.push('')
  })
  out.push('-- Default-Konditionen (GDV-Muster) fuer alle Marken ohne belegte Werte')
  out.push(konditionenInsert('__default__', null, data.default_konditionen))
  out.push('')
  return out.join('\n')
}
