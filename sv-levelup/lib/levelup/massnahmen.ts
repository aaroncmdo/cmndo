import type { Befund } from './modul-vertrag'
import type { ModulErgebnis } from './messmaschine'

/**
 * Eine Massnahme in der Form, die das Auswertungs-Mockup fuehrt
 * (`mass:[{t,w,a,wi,p,q,ph}]`).
 */
export type Massnahme = {
  /** Titel — was zu tun ist, in einem Satz. */
  t: string
  /** Was genau, und warum es wirkt. */
  w: string
  /** Aufwand als Text, wie er angezeigt wird. */
  a: string
  /** Wirkung. */
  wi: 'hoch' | 'mittel' | 'gering'
  /** Erreichbare Punkte — die Luecke zwischen Ist und Maximum. */
  p: number
  /** Woher der Befund stammt, der diese Massnahme ausgeloest hat (R-A). */
  q: string
  /** Phase 1 bis 3. */
  ph: 1 | 2 | 3
}

type Vorlage = {
  t: string
  w: string
  /** Aufwand in Minuten — daraus entstehen Anzeige und Phase. */
  minuten: number
}

/**
 * Je Kriterium eine Vorlage.
 *
 * ⚠ BESCHLUSS, nicht zitiert: die ausformulierte Messvorschrift
 * (`references/scoring-modell.md`) ist nicht auffindbar. Die Texte sind aus der
 * Sache hergeleitet — bei den beiden Rechtspflichten ist die Sache eindeutig
 * (§ 5 TMG, Art. 13 DSGVO), bei den uebrigen ist es Fachwissen. Taucht die
 * Vorschrift auf, ist SIE massgeblich.
 *
 * Ein Kriterium OHNE Vorlage erzeugt bewusst keine Massnahme: lieber eine
 * Luecke im Plan als ein erfundener Ratschlag.
 */
const VORLAGEN: Record<string, Vorlage> = {
  impressum: {
    t: 'Impressum verlinken',
    w: 'Ein Impressum nach § 5 TMG ist fuer geschaeftsmaessige Websites Pflicht; sein Fehlen ist abmahnfaehig. Der Link gehoert in den Fussbereich jeder Seite.',
    minuten: 30,
  },
  datenschutz: {
    t: 'Datenschutzerklaerung ergaenzen',
    w: 'Nach Art. 13 DSGVO verpflichtend, sobald personenbezogene Daten verarbeitet werden — das gilt bereits fuer Server-Protokolle und Kontaktformulare.',
    minuten: 60,
  },
  https: {
    t: 'Website auf HTTPS umstellen',
    w: 'Ohne Verschluesselung markieren Browser die Seite sichtbar als „nicht sicher". Ein Zertifikat ist bei jedem Anbieter kostenlos enthalten.',
    minuten: 45,
  },
  antwortzeit: {
    t: 'Ladezeit der Startseite senken',
    w: 'Bilder in zeitgemaessen Formaten ausliefern und ungenutzte Skripte entfernen. Wer laenger als drei Sekunden wartet, ist meist schon wieder weg.',
    minuten: 180,
  },
  mobil: {
    t: 'Seite fuer Mobilgeraete auslegen',
    w: 'Ohne Viewport-Angabe zeigen Mobilgeraete die Desktop-Fassung verkleinert. Die Mehrheit der Suchanfragen nach einem Gutachter kommt vom Telefon.',
    minuten: 120,
  },
  sichtbar: {
    t: 'Unternehmensprofil in der Kartensuche anlegen',
    w: 'Ohne Profil erscheint das Buero in der Kartensuche gar nicht — unabhaengig davon, wie gut die Website ist.',
    minuten: 60,
  },
  rang: {
    t: 'Bewertungen systematisch einsammeln',
    w: 'Die Position in der Kartensuche haengt stark an der Zahl der Bewertungen. Ein fester Schritt bei der Gutachten-Uebergabe wirkt mehr als eine einmalige Aktion.',
    minuten: 90,
  },
  median: {
    t: 'Zum Bewertungs-Median des Gebiets aufschliessen',
    w: 'Der Abstand zum Median ist die Groesse, die im direkten Vergleich sichtbar wird — er laesst sich mit einem wiederkehrenden Ablauf schliessen.',
    minuten: 90,
  },
}

/** Aufwand in Minuten → Anzeigeform. */
function alsAufwand(minuten: number): string {
  if (minuten < 60) return `${minuten} min`
  const stunden = Math.round((minuten / 60) * 2) / 2
  return `${String(stunden).replace('.', ',')} h`
}

/**
 * Phase aus Punkten je Aufwand.
 *
 * Phase 1 ist, was viel bringt und wenig kostet — damit die ersten Schritte
 * die sind, die man auch tut.
 */
export function phaseFuer(punkte: number, minuten: number): 1 | 2 | 3 {
  const proStunde = punkte / Math.max(minuten / 60, 0.25)
  if (proStunde >= 3) return 1
  if (proStunde >= 1) return 2
  return 3
}

function wirkungFuer(punkte: number): Massnahme['wi'] {
  if (punkte >= 3) return 'hoch'
  if (punkte >= 2) return 'mittel'
  return 'gering'
}

/**
 * F-11 · Aus Befunden einen Plan ableiten.
 *
 * Drei Regeln, die zusammen verhindern, dass Ratschlaege ins Blaue entstehen:
 *   · Ein Befund AUF dem Maximum erzeugt nichts — dort ist nichts zu tun.
 *   · Ein NICHT ERHOBENER Befund erzeugt nichts. Was niemand gemessen hat,
 *     kann niemand verbessern; eine Massnahme dort suggerierte einen Befund,
 *     den es nicht gibt (R-B).
 *   · Ein Kriterium ohne Vorlage erzeugt nichts. Lieber eine Luecke im Plan
 *     als ein erfundener Ratschlag.
 */
export function leiteAb(befunde: Record<string, ModulErgebnis>): Massnahme[] {
  const massnahmen: Massnahme[] = []

  for (const modul of Object.values(befunde)) {
    for (const b of modul.befunde ?? []) {
      const m = ausBefund(b)
      if (m) massnahmen.push(m)
    }
  }

  // Was viel bringt und wenig kostet, kommt zuerst.
  return massnahmen.sort((a, b) => a.ph - b.ph || b.p - a.p)
}

function ausBefund(b: Befund): Massnahme | null {
  if (b.wert === null) return null              // nicht erhoben
  if (b.punkte >= b.maximum) return null        // nichts zu tun
  if (b.maximum <= 0) return null               // ohne Punktwertung

  const vorlage = VORLAGEN[b.schluessel]
  if (!vorlage) return null

  const punkte = b.maximum - b.punkte
  return {
    t: vorlage.t,
    w: vorlage.w,
    a: alsAufwand(vorlage.minuten),
    wi: wirkungFuer(punkte),
    p: punkte,
    q: `${b.label} — erhoben am ${new Date(b.erhoben).toLocaleDateString('de-DE')}`,
    ph: phaseFuer(punkte, vorlage.minuten),
  }
}
