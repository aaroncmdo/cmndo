// Sample-Props fuer den Email-Preview-Harness (Tier-1-Kundenmails, MVP).
// KEIN Produktionscode — nur fuer `npm run email:preview`. Reale Daten sind erfunden.
// Erweiterung auf Tier-2/3 = weitere Eintraege unten ergaenzen.
import type { ReactElement } from 'react'
import { KundeWelcomeEmail, subject as kundeWelcomeSubject } from '@/lib/email/google/templates/KundeWelcome'
import LeadReminder1 from '@/lib/email/google/templates/LeadReminder1'
import LeadReminder2 from '@/lib/email/google/templates/LeadReminder2'
import LeadReminder3 from '@/lib/email/google/templates/LeadReminder3'
import { FlowLinkVersandEmail, subject as flowLinkSubject } from '@/lib/email/google/templates/FlowLinkVersand'
import { KundeTerminGegenvorschlagEmail, subject as terminGegenvorschlagSubject } from '@/lib/email/google/templates/KundeTerminGegenvorschlag'
import { MiniWizardMagicLinkEmail, subject as miniWizardSubject } from '@/lib/email/google/templates/MiniWizardMagicLink'
import { DokumenteAnfrageEmail, subject as dokumenteSubject } from '@/lib/email/google/templates/DokumenteAnfrage'

export type Preview = { name: string; tier: number; subject: string; element: ReactElement }

const kundeWelcomeProps = {
  vorname: 'Max',
  fallNummer: 'CL-2026-00042',
  unfallDatum: '14.06.2026',
  adresse: 'Musterstraße 12, 50667 Köln',
  fahrzeug: 'BMW 320d Touring (2021)',
  versicherung: 'Allianz Versicherungs-AG',
  svName: 'Dipl.-Ing. Thomas Berger',
  accountExists: false,
  flowToken: 'flw_8f3a9c2e7b1d4056a2e1f9c0',
  terminInfo: { datum: '18.06.2026', uhrzeit: '10:30', adresse: 'Musterstraße 12, 50667 Köln', svName: 'Dipl.-Ing. Thomas Berger' },
  loginInfo: { magicLink: 'https://app.claimondo.de/auth/magic/2f7a9e1c4b6d80a3f5e2c1b9d7406a8e', email: 'max.mustermann@example.de', password: 'Höhle-Birke-42!' },
  brand: null,
  locale: 'de',
  fahrzeugBildUrl: null,
  heroBildUrl: null,
  berater: { name: 'Sandra Köhler', photoUrl: null, contact: 'WhatsApp · 0221 9876543' },
}

const flowLinkProps = {
  vorname: 'Max',
  svVorname: 'Thomas',
  svNachname: 'Berger',
  terminDatum: '14.06.2026',
  terminUhrzeit: '10:30 Uhr',
  flowUrl: 'https://app.claimondo.de/flow/fk_8s2d9a1m4n7q3w6e0r5t',
  brand: null,
  locale: 'de',
}

const terminGegenvorschlagProps = {
  kundenVorname: 'Max',
  fallNummer: 'CL-2026-00042',
  alterTerminDatum: '14.06.2026',
  alterTerminUhrzeit: '10:30',
  neuerTerminDatum: '17.06.2026',
  neuerTerminUhrzeit: '14:00',
  grund: 'An Ihrem ursprünglichen Wunschtermin bin ich bereits zu einer Begutachtung in Düsseldorf gebunden. Der neue Vorschlag passt zeitlich besser für die Anfahrt.',
  svName: 'Sachverständigenbüro Müller & Partner',
  responseUrl: 'https://app.claimondo.de/kunde-termin/8f3c2a1b-4d6e-47f9-bc21-9a0e5f7d3c84',
  locale: 'de',
  brand: null,
}

const miniWizardProps = {
  vorname: 'Max',
  flowUrl: 'https://app.claimondo.de/flow/8f3c1a9e-4b27-4d6e-91af-2c0d5e7a1b34',
  locale: 'de',
  brand: null,
}

const dokumenteProps = {
  vorname: 'Max',
  slots: [
    { label: 'Führerschein (Vorder- und Rückseite)' },
    { label: 'Fahrzeugschein (Zulassungsbescheinigung Teil I)' },
    { label: 'Kostenvoranschlag oder Reparaturrechnung' },
    { label: 'Lichtbilder vom Fahrzeugschaden' },
    { label: 'Bankverbindung für die Schadensregulierung' },
  ],
  uploadUrl: 'https://app.claimondo.de/upload/dokumente/8f3a2c7e-1b4d-4f90-a6c2-9d51e0b7af34',
  brand: null,
}

export const PREVIEWS: Preview[] = [
  { name: 'KundeWelcome', tier: 1, subject: kundeWelcomeSubject(kundeWelcomeProps), element: KundeWelcomeEmail(kundeWelcomeProps) },
  { name: 'LeadReminder1', tier: 1, subject: 'Ihre Schadenmeldung ist fast fertig', element: LeadReminder1({ vorname: 'Max', resumeUrl: 'https://app.claimondo.de/schaden-melden/fortsetzen/cl-2026-00042-9f3a7b2c1d' }) },
  { name: 'LeadReminder2', tier: 1, subject: 'Sollen wir Ihren Schadenfall noch bearbeiten?', element: LeadReminder2({ vorname: 'Max', resumeUrl: 'https://app.claimondo.de/schaden-melden/fortsetzen/cl-2026-00042-7f3a9b2e' }) },
  { name: 'LeadReminder3', tier: 1, subject: 'Letzte Chance: Ihre Schadenmeldung läuft ab', element: LeadReminder3({ vorname: 'Max', resumeUrl: 'https://app.claimondo.de/schaden-melden/fortsetzen/cl-2026-00042-rt8f3a1c' }) },
  { name: 'FlowLinkVersand', tier: 1, subject: flowLinkSubject(flowLinkProps), element: FlowLinkVersandEmail(flowLinkProps) },
  { name: 'KundeTerminGegenvorschlag', tier: 1, subject: terminGegenvorschlagSubject(terminGegenvorschlagProps), element: KundeTerminGegenvorschlagEmail(terminGegenvorschlagProps) },
  { name: 'MiniWizardMagicLink', tier: 1, subject: miniWizardSubject(miniWizardProps), element: MiniWizardMagicLinkEmail(miniWizardProps) },
  { name: 'DokumenteAnfrage', tier: 1, subject: dokumenteSubject(dokumenteProps), element: DokumenteAnfrageEmail(dokumenteProps) },
]
