// Werkstatt-Onboarding-Aktivierungs-Drip — Template-Registry.
// Vollstaendig (Task 6): alle 6 TemplateKeys. Der `Registry`-Mapped-Type unten
// erzwingt bei jedem Key das korrekte Copy-Schema fuer Component + subject()
// (Compile-Fehler, falls ein Key fehlt oder ein Copy-Typ nicht mehr passt).

import type { ReactElement } from 'react'
import type { ZodType } from 'zod'
import { copySchemas } from './copy-schemas'
import type { CopyFor } from './copy-schemas'
import type { TemplateKey, WerkstattMergeVars } from './types'
import { WillkommenEmail, subject as willkommenSubject } from './Willkommen'
import { NutzenEmail, subject as nutzenSubject } from './Nutzen'
import { SvVorstellungEmail, subject as svVorstellungSubject } from './SvVorstellung'
import { KundenstoryEmail, subject as kundenstorySubject } from './Kundenstory'
import { BonusEmail, subject as bonusSubject } from './Bonus'
import { ReaktivierungEmail, subject as reaktivierungSubject } from './Reaktivierung'

// React 19: kein ambientes globales `JSX` in reinen .ts-Dateien (nur .tsx triggert die
// automatische jsx-runtime-Einbindung, die den Namespace mergt) -> ReactElement statt
// JSX.Element (dieselbe Laufzeit-Bedeutung, ohne den Namespace-Lookup).
type TemplateEntry<K extends TemplateKey> = {
  Component: (props: { copy: CopyFor<K>; merge: WerkstattMergeVars }) => ReactElement
  copySchema: ZodType<CopyFor<K>>
  subject: (copy: CopyFor<K>, merge: WerkstattMergeVars) => string
}

type Registry = { [K in TemplateKey]: TemplateEntry<K> }

export const registry: Registry = {
  willkommen: { Component: WillkommenEmail, copySchema: copySchemas.willkommen, subject: willkommenSubject },
  nutzen: { Component: NutzenEmail, copySchema: copySchemas.nutzen, subject: nutzenSubject },
  sv_vorstellung: { Component: SvVorstellungEmail, copySchema: copySchemas.sv_vorstellung, subject: svVorstellungSubject },
  kundenstory: { Component: KundenstoryEmail, copySchema: copySchemas.kundenstory, subject: kundenstorySubject },
  bonus: { Component: BonusEmail, copySchema: copySchemas.bonus, subject: bonusSubject },
  reaktivierung: { Component: ReaktivierungEmail, copySchema: copySchemas.reaktivierung, subject: reaktivierungSubject },
}
