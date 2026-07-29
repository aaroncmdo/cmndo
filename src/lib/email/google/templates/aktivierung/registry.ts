// Werkstatt-Onboarding-Aktivierungs-Drip — Template-Registry.
// Task 5: nur sv_vorstellung befuellt. Task 6 komplettiert die restlichen 5 Keys
// (willkommen/nutzen/kundenstory/bonus/reaktivierung) zu einer vollstaendigen,
// ueber Registry-Typ erzwungenen Record<TemplateKey, TemplateEntry>.

import { copySchemas } from './copy-schemas'
import { SvVorstellungEmail, subject as svSubject } from './SvVorstellung'

export const registry = {
  sv_vorstellung: { Component: SvVorstellungEmail, copySchema: copySchemas.sv_vorstellung, subject: svSubject },
  // willkommen/nutzen/kundenstory/bonus/reaktivierung: Task 6
} as const
