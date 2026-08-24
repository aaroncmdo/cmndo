export type ModulId =
  | 'gbp' | 'web' | 'seo' | 'ux' | 'gsc' | 'ki'
  | 'wett' | 'verz' | 'zuweiser' | 'ads'
  | 'kwg' | 'kwm' | 'nach' | 'ortsseiten'
  | 'markt' | 'nische' | 'volumen' | 'gebiet'

export type Modus = 'aufbau' | 'bestand'
export type Braucht = 'url' | 'profil' | 'places' | 'browser' | 'ads_konto' | 'meta_konto' | 'gsc' | null
export type Gruppe = 'auftritt' | 'umfeld' | 'nachfrage' | 'markt'

export type Modul = {
  id: ModulId
  titel: string
  punkte: number
  dauerMin: number
  modi: Modus[]
  braucht: Braucht
  gruppe: Gruppe
  /** Saeule fuer das Diagramm in der Auswertung. null = ohne Punktwertung. */
  saeule: string | null
}

/**
 * Verbindlich nach Design-Spec §3.1. Die Ids sind Vertragsbestandteil und
 * stehen so in module_gewaehlt, befunde und massnahmen — nie umbenennen.
 *
 * ACHTUNG: Die Registry in mockup-levelup-v2.html ist VERALTET — sie kennt nur
 * 11 Module (kwg und kwm fehlen) und ein eigenes Punktesystem (Summe 165).
 * Maszgeblich sind GESAMTSPEC §5 + mockup-levelup-auswertung.html (13 Module,
 * 124 Punkte), erweitert um fuenf neue Module (zuweiser, gsc, gebiet,
 * ortsseiten, ki) und die Bewertungs-Dynamik.
 *
 * ⚠ `TEILBEFUND_SCHWELLE` ist die HAELFTE der Summe hier. Wer ein Modul mit
 * Punkten ergaenzt, hebt damit die Schwelle, ab der es ueberhaupt einen Score
 * gibt. Vor der Aufnahme von `ki` (10 Punkte, Schwelle 75 -> 80) an den 16
 * echten Checks geprueft: die sechs mit Score liegen bei 104 und 116 erhebbaren
 * Punkten, die uebrigen unter 75 — die Verschiebung aendert bei keinem etwas.
 * Der Score wird ausserdem GESPEICHERT (`levelup_checks.score`), nicht beim
 * Anzeigen neu gerechnet; bestehende Auswertungen bleiben unberuehrt.
 *
 * gbp 22 statt 20 und wett 18 statt 16: die je zwei Zusatzpunkte vergibt die
 * Bewertungs-Dynamik — die RATE statt des Bestands (Design-Spec §3.5).
 */
export const MODULE: Modul[] = [
  { id: 'gbp',        titel: 'Google-Unternehmensprofil',     punkte: 22, dauerMin: 1, modi: ['bestand'],           braucht: 'profil',     gruppe: 'auftritt',  saeule: 'Google-Unternehmensprofil' },
  { id: 'web',        titel: 'Website — Technik & Recht',     punkte: 12, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'url',        gruppe: 'auftritt',  saeule: 'Technik & Ladezeit' },
  { id: 'seo',        titel: 'SEO & Inhalte',                 punkte: 12, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'url',        gruppe: 'auftritt',  saeule: 'SEO — On-Page & Keywords' },
  { id: 'ux',         titel: 'Nutzererlebnis',                punkte: 12, dauerMin: 2, modi: ['bestand'],           braucht: 'url',        gruppe: 'auftritt',  saeule: 'Nutzererlebnis' },
  { id: 'gsc',        titel: 'Search Console',                punkte: 12, dauerMin: 2, modi: ['bestand'],           braucht: 'gsc',        gruppe: 'auftritt',  saeule: 'SEO — On-Page & Keywords' },
  { id: 'ki',         titel: 'Sichtbarkeit in KI-Antworten',  punkte: 10, dauerMin: 1, modi: ['aufbau','bestand'],  braucht: 'url',        gruppe: 'auftritt',  saeule: 'Sichtbarkeit in KI-Antworten' },
  { id: 'wett',       titel: 'Wettbewerber im 50-km-Umkreis', punkte: 18, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: 'places',     gruppe: 'umfeld',    saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'verz',       titel: 'Branchenverzeichnisse & NAP',   punkte: 12, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'umfeld',    saeule: 'Branchenverzeichnisse & NAP' },
  { id: 'zuweiser',   titel: 'Zuweiser-Netzwerk · 25 km',     punkte: 10, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'places',     gruppe: 'umfeld',    saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'ads',        titel: 'Anzeigen im Transparenzcenter', punkte: 10, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'browser',    gruppe: 'umfeld',    saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'kwg',        titel: 'Google-Keyword-Planer · 20 km', punkte: 14, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: 'ads_konto',  gruppe: 'nachfrage', saeule: 'SEO — On-Page & Keywords' },
  { id: 'kwm',        titel: 'Meta-Reichweite · 20 km',       punkte:  8, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: 'meta_konto', gruppe: 'nachfrage', saeule: 'Auffindbarkeit & Wettbewerbsposition' },
  { id: 'nach',       titel: 'Longtail-Recherche',            punkte:  8, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'nachfrage', saeule: 'SEO — On-Page & Keywords' },
  { id: 'ortsseiten', titel: 'Ortsseiten-Abgleich',           punkte:  0, dauerMin: 1, modi: ['aufbau','bestand'],  braucht: 'url',        gruppe: 'nachfrage', saeule: null },
  { id: 'markt',      titel: 'Marktbewertung im Vergleich',   punkte:  0, dauerMin: 3, modi: ['aufbau','bestand'],  braucht: 'places',     gruppe: 'markt',     saeule: null },
  { id: 'nische',     titel: 'Nischen & Positionierung',      punkte:  0, dauerMin: 2, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'markt',     saeule: null },
  { id: 'volumen',    titel: 'Marktvolumen-Rechnung',         punkte:  0, dauerMin: 1, modi: ['aufbau','bestand'],  braucht: null,         gruppe: 'markt',     saeule: null },
  { id: 'gebiet',     titel: 'Gebietswahl',                   punkte:  0, dauerMin: 2, modi: ['aufbau'],            braucht: null,         gruppe: 'markt',     saeule: null },
]

export const GESAMTPUNKTE = MODULE.reduce((s, m) => s + m.punkte, 0)

/** Design-Spec §3.2 (E-2): relativ, damit die Schwelle mit der Modulzahl mitwaechst. */
export const TEILBEFUND_SCHWELLE = GESAMTPUNKTE / 2

export function modulNachId(id: ModulId): Modul | undefined {
  return MODULE.find((m) => m.id === id)
}
