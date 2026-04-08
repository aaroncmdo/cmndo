/**
 * KFZ-147: Fall-Email-Templates für das Compose-Modal.
 * Jedes Template hat: id, label, subject(ctx), body(ctx).
 * Platzhalter werden automatisch aus dem Fall-Kontext ersetzt.
 */

export type TemplateContext = {
  fall_nr: string
  kunde_name: string
  kunde_vorname: string
  sv_name: string
  termin_datum: string
  termin_uhrzeit: string
  termin_adresse: string
  fahrzeug: string
  versicherung: string
}

export type FallTemplate = {
  id: string
  label: string
  empfaengerTyp: 'kunde' | 'sv' | 'kanzlei' | 'custom'
  subject: (ctx: TemplateContext) => string
  body: (ctx: TemplateContext) => string
}

export const FALL_TEMPLATES: FallTemplate[] = [
  {
    id: 'terminbestaetigung_kunde',
    label: 'Terminbestätigung an Kunde',
    empfaengerTyp: 'kunde',
    subject: (ctx) => `Ihr Besichtigungstermin — ${ctx.termin_datum}`,
    body: (ctx) => `<p>Hallo ${ctx.kunde_vorname},</p>
<p>Ihr Besichtigungstermin für den Schadensfall <strong>${ctx.fall_nr}</strong> wurde bestätigt:</p>
<ul>
<li><strong>Datum:</strong> ${ctx.termin_datum} um ${ctx.termin_uhrzeit} Uhr</li>
<li><strong>Adresse:</strong> ${ctx.termin_adresse}</li>
<li><strong>Sachverständiger:</strong> ${ctx.sv_name}</li>
<li><strong>Fahrzeug:</strong> ${ctx.fahrzeug}</li>
</ul>
<p>Bitte stellen Sie sicher, dass das Fahrzeug zum Termin zugänglich ist. Der Gutachter wird sich ca. 15 Minuten vorher telefonisch bei Ihnen melden.</p>
<p>Bei Fragen oder Terminänderungen kontaktieren Sie uns jederzeit über das Kunden-Portal oder per WhatsApp.</p>`,
  },
  {
    id: 'terminbestaetigung_sv',
    label: 'Terminbestätigung an SV',
    empfaengerTyp: 'sv',
    subject: (ctx) => `Neuer Auftrag: ${ctx.fall_nr} — ${ctx.termin_datum}`,
    body: (ctx) => `<p>Hallo ${ctx.sv_name},</p>
<p>Folgender Auftrag wurde Ihnen zugewiesen:</p>
<ul>
<li><strong>Fall:</strong> ${ctx.fall_nr}</li>
<li><strong>Kunde:</strong> ${ctx.kunde_name}</li>
<li><strong>Termin:</strong> ${ctx.termin_datum} um ${ctx.termin_uhrzeit} Uhr</li>
<li><strong>Adresse:</strong> ${ctx.termin_adresse}</li>
<li><strong>Fahrzeug:</strong> ${ctx.fahrzeug}</li>
</ul>
<p>Bitte melden Sie sich ca. 15 Min. vor dem Termin beim Kunden. Alle Falldaten finden Sie im Gutachter-Portal.</p>`,
  },
  {
    id: 'dokumentenanforderung',
    label: 'Dokumentenanforderung an Kunde',
    empfaengerTyp: 'kunde',
    subject: (ctx) => `Fehlende Dokumente — Fall ${ctx.fall_nr}`,
    body: (ctx) => `<p>Hallo ${ctx.kunde_vorname},</p>
<p>Für die weitere Bearbeitung Ihres Schadensfalls <strong>${ctx.fall_nr}</strong> benötigen wir noch folgende Dokumente:</p>
<ul>
<li>Fahrzeugschein (Zulassungsbescheinigung Teil I)</li>
<li>Polizeibericht (falls vorhanden)</li>
<li>Fotos vom Unfallort / Schaden</li>
</ul>
<p>Bitte laden Sie die Dokumente über Ihr Kunden-Portal hoch oder senden Sie diese per WhatsApp.</p>
<p>Falls Sie Fragen haben, stehen wir Ihnen jederzeit zur Verfügung.</p>`,
  },
  {
    id: 'gutachten_kanzlei',
    label: 'Gutachten-Versand an Kanzlei',
    empfaengerTyp: 'kanzlei',
    subject: (ctx) => `Gutachten + Fallakte: ${ctx.fall_nr}`,
    body: (ctx) => `<p>Sehr geehrte Damen und Herren,</p>
<p>anbei übersenden wir Ihnen das Gutachten sowie die vollständige Fallakte für den Schadensfall <strong>${ctx.fall_nr}</strong>:</p>
<ul>
<li><strong>Mandant:</strong> ${ctx.kunde_name}</li>
<li><strong>Fahrzeug:</strong> ${ctx.fahrzeug}</li>
<li><strong>Gegn. Versicherung:</strong> ${ctx.versicherung}</li>
</ul>
<p>Alle relevanten Dokumente (Gutachten-PDF, Fahrzeugschein, Schadensfotos, SA-Vollmacht) finden Sie in der digitalen Fallakte.</p>
<p>Bitte bestätigen Sie den Eingang.</p>
<p>Mit freundlichen Grüßen<br>Claimondo GmbH</p>`,
  },
  {
    id: 'nachfrage_versicherung',
    label: 'Nachfrage an Versicherung',
    empfaengerTyp: 'custom',
    subject: (ctx) => `Sachstand: ${ctx.fall_nr} — Schadensregulierung`,
    body: (ctx) => `<p>Sehr geehrte Damen und Herren,</p>
<p>wir nehmen Bezug auf unser Anspruchsschreiben zum o.g. Schadensfall und bitten um Mitteilung zum aktuellen Sachstand.</p>
<ul>
<li><strong>Fall:</strong> ${ctx.fall_nr}</li>
<li><strong>Geschädigter:</strong> ${ctx.kunde_name}</li>
<li><strong>Fahrzeug:</strong> ${ctx.fahrzeug}</li>
</ul>
<p>Wir bitten um zeitnahe Rückmeldung, andernfalls sehen wir uns gezwungen, weitere Schritte einzuleiten.</p>
<p>Mit freundlichen Grüßen<br>Claimondo GmbH — im Auftrag</p>`,
  },
  {
    id: 'freitext',
    label: 'Freitext (leer)',
    empfaengerTyp: 'custom',
    subject: () => '',
    body: () => '',
  },
]
