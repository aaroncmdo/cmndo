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
 * (§ 5 DDG, Art. 13 DSGVO), bei den uebrigen ist es Fachwissen. Taucht die
 * Vorschrift auf, ist SIE massgeblich.
 *
 * Ein Kriterium OHNE Vorlage erzeugt bewusst keine Massnahme: lieber eine
 * Luecke im Plan als ein erfundener Ratschlag.
 */
export const VORLAGEN: Record<string, Vorlage> = {
  // ── web ────────────────────────────────────────────────────────────────
  impressum: {
    t: 'Impressum verlinken',
    w: 'Ein Impressum nach § 5 DDG ist für geschäftsmäßige Websites Pflicht; sein Fehlen ist abmahnfähig. Der Link gehört in den Fußbereich jeder Seite.',
    minuten: 30,
  },
  datenschutz: {
    t: 'Datenschutzerklärung ergänzen',
    w: 'Nach Art. 13 DSGVO verpflichtend, sobald personenbezogene Daten verarbeitet werden — das gilt bereits für Server-Protokolle und Kontaktformulare.',
    minuten: 60,
  },
  https: {
    t: 'Website auf HTTPS umstellen',
    w: 'Ohne Verschlüsselung markieren Browser die Seite sichtbar als „nicht sicher". Ein Zertifikat ist bei jedem Anbieter kostenlos enthalten.',
    minuten: 45,
  },
  antwortzeit: {
    t: 'Ladezeit der Startseite senken',
    w: 'Bilder in zeitgemäßen Formaten ausliefern und ungenutzte Skripte entfernen. Wer länger als drei Sekunden wartet, ist meist schon wieder weg.',
    minuten: 180,
  },
  mobil: {
    t: 'Seite für Mobilgeräte auslegen',
    w: 'Ohne Viewport-Angabe zeigen Mobilgeräte die Desktop-Fassung verkleinert. Die Mehrheit der Suchanfragen nach einem Gutachter kommt vom Telefon.',
    minuten: 120,
  },

  // ── wett ───────────────────────────────────────────────────────────────
  sichtbar: {
    t: 'Unternehmensprofil in der Kartensuche anlegen',
    w: 'Ohne Profil erscheint das Büro in der Kartensuche gar nicht — unabhängig davon, wie gut die Website ist.',
    minuten: 60,
  },
  rang: {
    t: 'Bewertungen systematisch einsammeln',
    w: 'Die Position in der Kartensuche hängt stark an der Zahl der Bewertungen. Ein fester Schritt bei der Gutachten-Übergabe wirkt mehr als eine einmalige Aktion.',
    minuten: 90,
  },
  median: {
    t: 'Zum Bewertungs-Median des Gebiets aufschließen',
    w: 'Der Abstand zum Median ist die Größe, die im direkten Vergleich sichtbar wird — er lässt sich mit einem wiederkehrenden Ablauf schließen.',
    minuten: 90,
  },
  dynamik: {
    // ⚠ Greift beim ERSTEN Check nie: eine Rate braucht zwei Messzeitpunkte,
    // der Befund ist dort „nicht erhoben" und erzeugt keine Massnahme. Die
    // Vorlage steht fuer den Wiederholungs-Check (Design-Spec § 3.5) bereit —
    // nicht, um Vollstaendigkeit vorzutaeuschen.
    t: 'Bewertungen stetig sammeln statt in Schüben',
    w: 'Gewertet wird die Rate, nicht der Bestand: Wer im Quartal fünf Bewertungen dazugewinnt, steigt — auch von einem niedrigen Stand aus. Eine Aktion mit zwanzig Bewertungen auf einen Schlag verpufft dagegen und fällt auf.',
    minuten: 60,
  },

  // ── gbp ────────────────────────────────────────────────────────────────
  fotos: {
    t: 'Fotos ins Unternehmensprofil laden',
    w: 'Zehn Aufnahmen genügen: Außenansicht, Empfang, Messplatz, Team und ein Fahrzeug in der Begutachtung. Profile mit Bildern werden deutlich häufiger angeklickt als solche ohne — und die Bilder liegen meist schon auf dem Telefon.',
    minuten: 60,
  },
  oeffnungszeiten: {
    t: 'Öffnungszeiten im Profil hinterlegen',
    w: 'Ohne sie fehlt in der Kartensuche der Hinweis „jetzt geöffnet", und Anrufer wissen nicht, wann jemand rangeht. Fünf Minuten Arbeit im Unternehmensprofil.',
    minuten: 10,
  },
  bewertungszahl: {
    t: 'Mehr Bewertungen sammeln',
    w: 'Die Anzahl trennt die Büros im Umkreis stärker als jede andere Größe — der Durchschnitt liegt bei fast allen über 4,5. Bitten Sie bei der Gutachten-Übergabe um eine Bewertung, am besten mit einem QR-Code auf dem Übergabeblatt.',
    minuten: 90,
  },
  bewertungsschnitt: {
    t: 'Auf den Bewertungsschnitt achten',
    w: 'In Ihrem Umkreis hat die Mehrheit glatte 5,0 — ein guter Schnitt ist hier die Regel, kein Vorsprung. Antworten Sie auf jede Bewertung, auch auf kritische; das hebt den Schnitt über die Zeit und wirkt auf Mitlesende.',
    minuten: 45,
  },
  telefon: {
    t: 'Telefonnummer ins Profil eintragen',
    w: 'Ohne Nummer im Profil kann aus der Kartensuche heraus niemand direkt anrufen — der häufigste Weg, auf dem ein Geschädigter Sie erreicht.',
    minuten: 5,
  },
  website: {
    t: 'Website im Profil verlinken',
    w: 'Der Link führt Interessenten von der Kartensuche auf Ihre Seite. Ohne ihn endet der Weg beim Profil.',
    minuten: 5,
  },

  // ── seo ────────────────────────────────────────────────────────────────
  titel: {
    t: 'Seitentitel um Leistung und Ort ergänzen',
    w: 'Der Titel ist die Überschrift in der Trefferliste. „Kfz-Gutachter <Ort> — <Ihr Büro>" nennt beides und bleibt unter 65 Zeichen. Wer nur den Firmennamen führt, wird von Suchenden nicht gefunden, die den Namen noch nicht kennen.',
    minuten: 20,
  },
  beschreibung: {
    t: 'Beschreibung für die Trefferliste setzen',
    w: 'Zwei Sätze mit Leistung, Ort und einem Grund, gerade Sie anzurufen — 70 bis 160 Zeichen. Fehlt sie, schneidet Google sich selbst einen Satz aus der Seite, oft einen unpassenden.',
    minuten: 20,
  },
  h1: {
    t: 'Eine Hauptüberschrift setzen',
    w: 'Genau eine Überschrift, die sagt, worum es auf der Seite geht — „Ihr Kfz-Gutachter in <Ort>". Viele Baukästen setzen stattdessen nur formatierten Text; dann fehlt die Überschrift technisch, obwohl sie aussieht wie eine.',
    minuten: 30,
  },
  ortsbezug: {
    t: 'Ort im Seitentext nennen',
    w: 'Gutachter werden örtlich gesucht. Steht der Ortsname nirgends im Text, kann die Seite diese Suchanfragen nicht gewinnen — auch wenn sie sonst gut ist.',
    minuten: 45,
  },
  daten: {
    t: 'Strukturierte Daten ergänzen',
    w: 'Ein kleiner Datenblock (schema.org LocalBusiness) sagt Google, dass Ihre Adresse eine Adresse ist und Ihre Zeiten Öffnungszeiten sind. Damit erscheinen sie in der Trefferliste, statt nur im Text zu stehen.',
    minuten: 60,
  },

  // ── ux ─────────────────────────────────────────────────────────────────
  telefonLink: {
    t: 'Telefonnummer anklickbar machen',
    w: 'Die Nummer als Telefonlink auszeichnen, damit ein Fingertipp wählt. Ohne das muss sie abgeschrieben werden — genau am Unfallort, mit einer Hand am Lenkrad.',
    minuten: 15,
  },
  kontaktweg: {
    t: 'Zweiten Kontaktweg anbieten',
    w: 'Ein kurzes Formular oder eine verlinkte E-Mail-Adresse. Wer abends schreibt oder nicht telefonieren mag, hat sonst keinen Weg zu Ihnen.',
    minuten: 45,
  },
  oben: {
    t: 'Telefonnummer nach oben holen',
    w: 'Die Nummer gehört in den Kopfbereich, sichtbar ohne Scrollen. Wer nach einem Unfall sucht, hat es eilig und liest keine Unterseite.',
    minuten: 20,
  },
  zeiten: {
    t: 'Erreichbarkeit auf der Seite nennen',
    w: 'Ein Satz genügt: wann Sie erreichbar sind und wie schnell Sie zurückrufen. Ohne Angabe bleibt offen, ob überhaupt jemand rangeht.',
    minuten: 15,
  },
  notfall: {
    t: 'Kurzfristige Termine sichtbar zusagen',
    w: 'Nach einem Unfall zählt, wie schnell jemand kommt. Ein Satz wie „Besichtigung in der Regel binnen 24 Stunden" ist oft der Grund, warum angerufen wird — vorausgesetzt, er stimmt.',
    minuten: 15,
  },

  // ── verz ───────────────────────────────────────────────────────────────
  adresseDa: {
    t: 'Anschrift sichtbar auf die Website setzen',
    w: 'Die vollständige Anschrift gehört in den Fußbereich jeder Seite, als Text und nicht als Bild. Kunden und Suchmaschinen lesen sie dort — im Impressum allein findet sie kaum jemand.',
    minuten: 20,
  },
  adresseGleich: {
    t: 'Anschrift auf Website und Profil angleichen',
    w: 'Zwei verschiedene Anschriften kann Google nicht zu einem Betrieb zusammenführen — die Signale verteilen sich auf zwei Einträge, und keiner davon rankt gut. Entscheiden Sie sich für eine Schreibweise und ziehen Sie sie überall durch, bis in die Verzeichnisse.',
    minuten: 60,
  },
  telefonGleich: {
    t: 'Telefonnummer überall gleich schreiben',
    w: 'Verschiedene Nummern auf Website und Profil führen Anrufer je nach Weg woanders hin — und schwächen zusätzlich die örtliche Auffindbarkeit. Eine Nummer, überall dieselbe.',
    minuten: 20,
  },
  nameGleich: {
    t: 'Firmennamen vereinheitlichen',
    w: 'Der Name im Unternehmensprofil sollte derselbe sein wie auf der Website und im Handelsregister. Zusätze wie „Ihr Gutachter in Münster" im Profilnamen verstoßen zudem gegen Googles Richtlinien.',
    minuten: 15,
  },

  // ── zuweiser ───────────────────────────────────────────────────────────
  werkstatt: {
    t: 'Werkstätten auf der Website ansprechen',
    w: 'Werkstätten sind die häufigste Quelle für Aufträge. Ein eigener Absatz, was Sie ihnen bieten — schnelle Besichtigung vor Ort, feste Ansprechpartner, Abrechnung ohne Rückfragen — kostet eine halbe Stunde und ist im Gespräch der Anknüpfungspunkt.',
    minuten: 45,
  },
  anwalt: {
    t: 'Rechtsanwälte ansprechen',
    w: 'Kanzleien mit Schwerpunkt Verkehrsrecht suchen einen festen Sachverständigen, dessen Gutachten vor Gericht halten. Ein Absatz dazu, mit einem Wort zu Ihrer Qualifikation, spricht genau diese Leser an.',
    minuten: 45,
  },
  partnerseite: {
    t: 'Eine Seite für Kooperationen anlegen',
    w: 'Eine Seite „Für Werkstätten und Kanzleien" ist der Ort, auf den Sie im Gespräch verweisen können — und den ein Interessent findet, ohne Sie zu fragen. Sie zeigt, dass Zusammenarbeit für Sie Routine ist, nicht Ausnahme.',
    minuten: 90,
  },

  // ── nach ───────────────────────────────────────────────────────────────
  // ⚠ Eine Vorlage je Thema waere zu kleinteilig — acht fast gleichlautende
  // Massnahmen im Plan liest niemand. Deshalb EIN Text, den jedes fehlende
  // Thema ausloest; welches gemeint ist, steht in der Quellenzeile.
  kosten: {
    t: 'Erklären, wer das Gutachten bezahlt',
    w: 'Die meistgestellte Frage nach einem Unfall. Ein kurzer Abschnitt „Wer zahlt das Gutachten?" mit der Antwort — bei unverschuldetem Unfall die Haftpflicht des Gegners — holt genau diese Suchanfragen ab.',
    minuten: 45,
  },
  wertminderung: {
    t: 'Wertminderung erklären',
    w: 'Viele Geschädigte wissen nicht, dass ihnen eine merkantile Wertminderung zusteht. Wer es auf seiner Seite erklärt, wird zu dieser Frage gefunden — und zeigt zugleich Sachkunde.',
    minuten: 45,
  },
  nutzungsausfall: {
    t: 'Nutzungsausfall und Mietwagen behandeln',
    w: 'Die Wahl zwischen Mietwagen und Nutzungsausfallentschädigung ist für Geschädigte oft neu und finanziell spürbar. Ein Abschnitt dazu beantwortet eine häufige Suchanfrage.',
    minuten: 45,
  },
  restwert: {
    t: 'Restwert und Wiederbeschaffungswert erklären',
    w: 'Zwei Begriffe, die im Gutachten stehen und die kaum jemand kennt. Wer sie auf seiner Seite erklärt, wird bei genau diesen Suchanfragen gefunden.',
    minuten: 45,
  },
  ablauf: {
    t: 'Ablauf und Dauer beschreiben',
    w: '„Wie lange dauert ein Gutachten" wird häufig gesucht. Drei Sätze zum Ablauf — Anruf, Besichtigung, Gutachten binnen soundso viel Tagen — beantworten die Frage und nehmen die Unsicherheit.',
    minuten: 30,
  },
  freieWahl: {
    t: 'Auf die freie Wahl des Sachverständigen hinweisen',
    w: 'Viele Geschädigte glauben, die Versicherung des Gegners bestimme den Gutachter. Der Hinweis, dass sie frei wählen dürfen, ist zugleich Aufklärung und Ihr stärkstes Verkaufsargument.',
    minuten: 30,
  },
  totalschaden: {
    t: 'Reparatur und Totalschaden gegenüberstellen',
    w: 'Wann lohnt die Reparatur, wann liegt ein wirtschaftlicher Totalschaden vor? Die 130-Prozent-Grenze ist ein häufig gesuchter Begriff und ein guter Anlass, Ihre Rolle dabei zu erklären.',
    minuten: 45,
  },
  kasko: {
    t: 'Kaskoschäden behandeln',
    w: 'Nicht jeder Schaden ist ein Haftpflichtfall. Ein Abschnitt zu Teil- und Vollkasko spricht eine Gruppe an, die sonst gar nicht erst nach einem Sachverständigen sucht.',
    minuten: 45,
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
