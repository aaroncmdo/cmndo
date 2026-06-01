// PARTNER_FAQ — Datenquelle fuer das FAQPage-JSON-LD-Schema in gutachter-partner/page.tsx
// (Server-Component). Bewusst in einem PLAIN-Modul (kein 'use client'), damit der
// Server-Import das echte Array bekommt — ein Export aus einer 'use client'-Datei
// wuerde server-seitig zu einer Client-Reference (faqs.map crasht). Die sichtbare
// FAQ-UI rendert FaqClient/PartnerContent aus den i18n-Messages (gutachter_partner.*).

export const PARTNER_FAQ = [
  {
    frage: 'Wie hoch ist die Plattform-Provision?',
    antwort:
      'Die Provision hängt vom Auftragsvolumen, der Region und dem gewählten Paket ab. Wir besprechen den konkreten Satz transparent im Erstgespräch — du bekommst vorab eine Beispielrechnung auf Basis deiner letzten 12 Monate. BVSK-Honorartabelle ist immer Verhandlungsgrundlage.',
  },
  {
    frage: 'Bin ich an Claimondo gebunden oder darf ich eigene Aufträge weiter machen?',
    antwort:
      'Du bleibst selbstständig. Eigene Direktaufträge, BVSK-Mitgliedschaft, Versicherer-Listungen — alles bleibt unverändert. Claimondo ist ein zusätzlicher Kanal, keine Exklusiv-Bindung.',
  },
  {
    frage: 'Welche Voraussetzungen muss ich erfüllen?',
    antwort:
      'Mindestens eine anerkannte Qualifikation: DAT-Expert, BVSK-Mitgliedschaft, IHK-Zertifikat oder öffentliche Bestellung (öbuv). Dazu gültige Berufshaftpflicht, GoBD-konforme Rechnungsstellung und ein aktiver Standort in Deutschland.',
  },
  {
    frage: 'Wie lange dauert das Onboarding?',
    antwort:
      'Nach Freischaltung deiner Region: 7 bis 14 Werktage. Schritte sind Verifikation der Qualifikation, Vertragsunterzeichnung, Einrichtung im Portal und ein 30-minütiger Live-Onboarding-Call. Danach gehen die ersten Aufträge live.',
  },
  {
    frage: 'Welche Software ist im Einsatz?',
    antwort:
      'Aufträge, Termine, Beweisfotos und Gutachten-Versand laufen über das Claimondo-SV-Portal (Web + Native-App). DAT-SilverDAT-Integration ist vorbereitet. Eigene Gutachten-Software (Audatex, Combiplus) kannst du parallel weiter nutzen — wir importieren das fertige PDF.',
  },
  {
    frage: 'Wie werden Rechnung und Zahlung abgewickelt?',
    antwort:
      'Claimondo übernimmt die Rechnungsstellung gegenüber der gegnerischen Haftpflichtversicherung nach §249 BGB. Du erhältst dein Honorar regulär per SEPA — Standard-Zahlungsziel 14 Tage nach Gutachten-Eingang, unabhängig vom Versicherer-Verzug.',
  },
  {
    frage: 'Kann ich meine Region später anpassen?',
    antwort:
      'Ja. Radius und PLZ-Liste passt du jederzeit im Portal an. Bei Vergrößerung prüfen wir, ob die Nachbarregion frei ist — bei Schrumpfung sofort wirksam.',
  },
  {
    frage: 'Was passiert mit Kundendaten? DSGVO-konform?',
    antwort:
      'Alle Kundendaten liegen DSGVO-konform auf deutschen Servern (Supabase Frankfurt). Du erhältst Auftragsdaten ausschließlich für den Bearbeitungszeitraum, Löschung erfolgt automatisiert nach Auftragsabschluss + gesetzlicher Aufbewahrungsfrist.',
  },
]
