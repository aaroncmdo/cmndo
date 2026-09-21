import { describe, it, expect } from 'vitest'
import { scanRdg, scanUmlaute, scanHeadingCode, scanTitleBrandTwice, scanAnredeImperativ, scanAnredeGemischt } from './copy-lint-scan.mjs'

describe('scanRdg — RDG-Rollentrennung', () => {
  it('flaggt Erstperson-Rechtsverben (alle am 04.09. live gefundenen Formen)', () => {
    expect(scanRdg('Wir verhandeln vollständige Erstattung.')).toHaveLength(1)
    expect(scanRdg('Wir setzen die Wertminderung nach Sanden/Danner-Formel durch.')).toHaveLength(1)
    expect(scanRdg('Versicherer kürzen trotzdem. Wir holen es zurück.')).toHaveLength(1)
    expect(scanRdg('Wir holen Gutachter- und Anwaltskosten von der Versicherung ein.')).toHaveLength(1)
    expect(scanRdg('Im Streitfall klagen wir vor dem zuständigen Landgericht.')).toHaveLength(1)
    expect(scanRdg('Claimondo holt diese Kürzungen zurück (Quelle: NDR).')).toHaveLength(1)
    expect(scanRdg('Claimondo setzt alle Ansprüche gegen die gegnerische Versicherung durch.')).toHaveLength(1)
    expect(scanRdg('Wenn die Versicherung kürzen will, schreibt unser Anwalt zurück.')).toHaveLength(1)
    expect(scanRdg('Unser Anwalt kennt die versicherungsspezifischen Taktiken.')).toHaveLength(1)
    expect(scanRdg('Wir holen das Maximum für Sie heraus.')).toHaveLength(1)
  })

  it('lässt Partnerkanzlei, Koordination, Kommunikation und Cookie-Sätze durch', () => {
    expect(scanRdg('Unsere Partnerkanzlei verhandelt mit der gegnerischen Versicherung.')).toHaveLength(0)
    expect(scanRdg('Unsere Partnerkanzlei setzt die Wertminderung durch.')).toHaveLength(0)
    expect(scanRdg('Wir koordinieren Gutachter, Anwalt und Werkstatt.')).toHaveLength(0)
    expect(scanRdg('Wir führen die komplette Kommunikation mit der Versicherung.')).toHaveLength(0)
    expect(scanRdg('Cookies setzen wir nur nach Ihrer Einwilligung ein.')).toHaveLength(0)
    expect(scanRdg('Claimondo setzt schmaler an: Haftpflicht-Spezialisierung.')).toHaveLength(0)
    expect(scanRdg('Wir setzen auf Transparenz.')).toHaveLength(0)
    expect(scanRdg('Bei einem wirtschaftlichen Totalschaden holen wir konkrete Angebote aus dem regionalen Markt ein.')).toHaveLength(0)
    expect(scanRdg('Prüfdienst-Kürzungen holt unsere Partnerkanzlei zurück.')).toHaveLength(0)
  })

  it('erkennt Verb-Reihungen nach Komma und den Dativ Plural (B2C-Durchgang 05.09.)', () => {
    expect(scanRdg('Wir disponieren Ihren Gutachter (< 48 h), führen die Versicherungs-Verhandlung und setzen Ihren Anspruch BGH-konform durch.')).toHaveLength(1)
    expect(scanRdg('Wir klären das gemeinsam mit Ihnen und unseren Anwälten.')).toHaveLength(1)
    expect(scanRdg('Wir koordinieren Gutachter, Anwalt und Werkstatt – unsere Partnerkanzlei verhandelt mit der Versicherung.')).toHaveLength(0)
    expect(scanRdg('Ihr unabhängiger Gutachter kommt zu Ihnen, meist in unter 48 Stunden. Gutachten und Anwalt zahlt die gegnerische Versicherung (§ 249 BGB), unsere Partnerkanzlei verhandelt.')).toHaveLength(0)
  })

  it('erkennt nachgestelltes "holen wir … ein" nur mit Geld-/Versicherungsobjekt', () => {
    expect(scanRdg('Gutachterkosten holen wir von der Versicherung ein.')).toHaveLength(1)
    expect(scanRdg('Prüfdienst-Kürzungen (typischerweise 30–40 %) holen wir zurück.')).toHaveLength(1)
  })

  it('bricht das Fenster an Satzgrenzen ab (kein Match über zwei Sätze)', () => {
    expect(scanRdg('Wir setzen auf Transparenz. Die Partnerkanzlei setzt Ansprüche durch.')).toHaveLength(0)
  })
})

describe('scanUmlaute', () => {
  it('findet ASCII-Ersatz nur als ganzes Wort', () => {
    expect(scanUmlaute('Standard-Unfaelle und Komplexe Faelle')).toEqual(['unfaelle', 'faelle'])
    expect(scanUmlaute('Kürzungen zurückholen — schaeden')).toEqual(['schaeden'])
    expect(scanUmlaute('Die Frist beträgt 4 Wochen.')).toEqual([])
    expect(scanUmlaute('/sachverstaendige/bvsk')).toEqual([]) // Slug, kein Wort-Treffer
  })
})

describe('scanHeadingCode', () => {
  it('erkennt die 04.09. live gefundenen Klassen', () => {
    expect(scanHeadingCode('<a name="akut"></a>1. Die ersten 72 Stunden')).toBe(true)
    expect(scanHeadingCode('Verursacher-Hub · 28.750 SV/Mo')).toBe(true)
    expect(scanHeadingCode('ControlExpert &amp; Co.')).toBe(true)
    expect(scanHeadingCode('check.foto_check.heading')).toBe(true)
    expect(scanHeadingCode('Kfz-Gutachter {stadt}')).toBe(true)
  })
  it('lässt normale Überschriften, Domains und Paragraphen durch', () => {
    expect(scanHeadingCode('1. Die ersten 72 Stunden – Sofort-Maßnahmen')).toBe(false)
    expect(scanHeadingCode('Login auf app.claimondo.de')).toBe(false)
    expect(scanHeadingCode('§ 249 Abs. 2 BGB – z. B. UPE')).toBe(false)
    expect(scanHeadingCode('')).toBe(false)
  })
})

describe('scanTitleBrandTwice', () => {
  it('erkennt die doppelte Marke', () => {
    expect(scanTitleBrandTwice('Täglich 3 × 50 € Gutschein gewinnen | Claimondo | Claimondo')).toBe(true)
    expect(scanTitleBrandTwice('Täglich 3 × 50 € Gutschein gewinnen | Claimondo')).toBe(false)
    expect(scanTitleBrandTwice(undefined)).toBe(false)
  })
})

describe('scanAnredeImperativ — duzende Befehlsform ohne Pronomen', () => {
  // Die Achse, die scanAnrede per Konstruktion fehlt: "Beschreibe das Problem" duzt,
  // enthält aber weder du noch dein. Alle Positivfälle sind am 19.09.2026 real auf
  // prod gefunden worden, in siezender Umgebung.
  it('flaggt die zehn real gefundenen Stellen', () => {
    expect(scanAnredeImperativ('Beschreibe das Problem oder den Wunsch')).toHaveLength(1)
    expect(scanAnredeImperativ('Mach Fotos aus mehreren Perspektiven direkt am Fahrzeug')).toHaveLength(1)
    expect(scanAnredeImperativ('Kein Code erhalten? Prüfe, ob die Telefonnummer korrekt ist')).toHaveLength(1)
    expect(scanAnredeImperativ('Wähle keinen Nutzernamen, der vorgibt, ein Anwalt zu sein.')).toHaveLength(1)
    expect(scanAnredeImperativ('Vergiss nicht: Bei Erfolg trägt der Versicherer alle Kosten.')).toHaveLength(1)
    expect(scanAnredeImperativ('→ Beachte die wichtigste Falle: Die Frist startet nicht …')).toHaveLength(1)
    expect(scanAnredeImperativ('Gib der Versicherung nichts Schriftliches.')).toHaveLength(1)
  })

  it('flaggt auch, wenn im SELBEN Satz gesiezt wird — dort liest der Pronomen-Detektor das Sie und meldet grün', () => {
    expect(scanAnredeImperativ('Prüfe alle Posten, bevor Sie zustimmen.')).toHaveLength(1)
    expect(scanAnredeImperativ('Hier greift Ihre Kaskoversicherung. Prüfe vorher, ob sich das lohnt.')).toHaveLength(1)
  })

  it('kennt Umlaute am Wortanfang — \\b wäre dort blind', () => {
    // ASCII-Wortgrenze vor Ö/Ä greift nicht; ohne die eigene Zeichenklasse wären
    // "Öffne" und "Ändere" zwei stumme Verben in der Liste gewesen.
    expect(scanAnredeImperativ('Öffne die App')).toHaveLength(1)
    expect(scanAnredeImperativ('Ändere die Angaben')).toHaveLength(1)
  })

  it('lässt die vier Fehltreffer-Klassen durch, die eine breite Liste erzeugt hätte', () => {
    expect(scanAnredeImperativ('Beschreiben Sie das Problem')).toHaveLength(0)   // Höflichkeitsform
    expect(scanAnredeImperativ('Sende…')).toHaveLength(0)                        // Ladezustand
    expect(scanAnredeImperativ('Online-Melde-Pfad')).toHaveLength(0)             // Kompositum
    expect(scanAnredeImperativ('Erschütterungs-Versuche zurückweisen')).toHaveLength(0) // Substantiv
    expect(scanAnredeImperativ('Wir überprüfen das')).toHaveLength(0)            // Verb im Wortinneren
    expect(scanAnredeImperativ('Vergissmeinnicht')).toHaveLength(0)              // längeres Wort
  })

  it('erkennt die bekannte Grenze NICHT — kleingeschriebene Imperative nach Komma', () => {
    // Dokumentiert, nicht versteckt: von "ich fordere" nicht sauber trennbar.
    // Der 2FA-Satz wurde über die GROSSE Form im selben Satz gefunden.
    expect(scanAnredeImperativ('und fordere ihn erneut an')).toHaveLength(0)
    expect(scanAnredeImperativ('beschreibe ich kurz')).toHaveLength(0)
  })
})

describe('scanAnredeGemischt — Sie und Du im selben Satz', () => {
  // Die Achse existiert, weil der Aufrufer `.json` pauschal ausnimmt (gedacht fuer DATEN-
  // JSONs wie "DU Beeckerwerth") und dabei src/i18n/messages/de.json mitnimmt — die Datei
  // mit den meisten nutzersichtbaren Texten der App. Alle drei Positivfaelle sind am
  // 21.09.2026 dort bzw. im Signatur-Flow real gefunden worden, seit dem 06.09. live.
  it('flaggt die drei real gefundenen Stellen', () => {
    expect(scanAnredeGemischt('Bitte prüfen Sie und korrigier Ihre Daten.')).toHaveLength(1)
    expect(
      scanAnredeGemischt('Ihre Partnerkanzlei schickt Ihnen die Vollmacht. Bitte unterschreib sie dort.'),
    ).toHaveLength(1)
    expect(
      scanAnredeGemischt('Ihre Werkstatt hat Ihren Vorgang vorbereitet. Bitte prüf die Angaben.'),
    ).toHaveLength(1)
  })

  it('schweigt bei durchgehendem Sie — auch mit denselben Verben', () => {
    expect(scanAnredeGemischt('Bitte prüfen und korrigieren Sie Ihre Daten.')).toHaveLength(0)
    expect(scanAnredeGemischt('Bitte unterschreiben Sie sie dort.')).toHaveLength(0)
    expect(scanAnredeGemischt('Ihre Werkstatt hat Ihren Vorgang vorbereitet.')).toHaveLength(0)
  })

  it('schweigt bei durchgehendem Du — interne Portale duzen bewusst (Aaron 06.09.)', () => {
    expect(scanAnredeGemischt('Bitte prüf die Angaben und unterschreib die Abtretung.')).toHaveLength(0)
    expect(scanAnredeGemischt('Korrigier deine Daten.')).toHaveLength(0)
  })

  it('verwechselt Substantive und Komposita nicht mit Befehlsformen', () => {
    // "der Speicher" stand real in der Datenschutzerklaerung und war der Grund, den Stamm
    // aus der Liste zu nehmen. Der Bindestrich im Lookahead deckt Komposita ab.
    expect(scanAnredeGemischt('Ihre Daten liegen im Speicher des Anbieters.')).toHaveLength(0)
    expect(scanAnredeGemischt('Sie finden das Prüf-Protokoll in Ihrem Konto.')).toHaveLength(0)
    expect(scanAnredeGemischt('Sie erhalten Ihre Nutz-Daten auf Anfrage.')).toHaveLength(0)
  })

  it('bleibt blind fuer die Mischung UEBER Zeilengrenzen — dokumentierte Grenze', () => {
    // Der Extraktor liefert pro String. Steht das "Ihre" in der einen und der Befehl in der
    // naechsten JSX-Zeile, sieht diese Achse nur den halben Satz. Genau so lag der dritte
    // Fall im Signatur-Flow; gefunden wurde er per Volltextsuche, nicht vom Gate.
    expect(scanAnredeGemischt('Bitte prüf die Angaben und unterschreib')).toHaveLength(0)
  })
})
