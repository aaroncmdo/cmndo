'use client'

// AAR-162 / W2: Fallakte Stammdaten-Sections.
// Die Notion-Spec schlägt 8 einzelne Section-Dateien vor — da jede nur
// 20-30 Zeilen Markup ist (ein Card-Header + InlineEditFields) habe ich
// sie in dieser Datei gebündelt. Pro Section ein benannter Export,
// problemlos später splitbar wenn nötig.
//
// Sichtbarkeit wird vom UebersichtTab via FallContext.visibleSections
// gesteuert (phase-config.ts). Jede Section rendert sich nur dann, wenn
// die zugehörige Section-Id in der Liste steht.

import type { ReactNode } from 'react'
import {
  UserIcon,
  CarIcon,
  AlertTriangleIcon,
  ShieldIcon,
  WrenchIcon,
  MapPinIcon,
  CalculatorIcon,
  FileTextIcon,
} from 'lucide-react'
import { useFall } from '../FallContext'
import InlineEditField from './InlineEditField'

function Card({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {hint && <span className="text-[10px] text-gray-400 ml-auto">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

// Helper für Werte aus fall-Object (Record<string, unknown>)
function f(fall: Record<string, unknown>, key: string): string | number | null {
  const v = fall[key]
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein'
  return String(v)
}

export function KundendatenSection() {
  const { fall, lead } = useFall()
  // Kunde-Daten kommen primär vom Lead; Fallakte-Override möglich.
  const vorname = (fall.kunde_vorname as string | null) ?? lead?.vorname ?? null
  const nachname = (fall.kunde_nachname as string | null) ?? lead?.nachname ?? null
  const email = (fall.kunde_email as string | null) ?? lead?.email ?? null
  const telefon = (fall.kunde_telefon as string | null) ?? lead?.telefon ?? null
  return (
    <Card icon={<UserIcon className="w-4 h-4 text-gray-400" />} title="Kundendaten">
      <InlineEditField label="Vorname" fieldName="kunde_vorname" value={vorname} />
      <InlineEditField label="Nachname" fieldName="kunde_nachname" value={nachname} />
      <InlineEditField label="E-Mail" fieldName="kunde_email" value={email} type="email" />
      <InlineEditField label="Telefon" fieldName="kunde_telefon" value={telefon} type="tel" />
    </Card>
  )
}

export function FahrzeugdatenSection() {
  const { fall } = useFall()
  return (
    <Card
      icon={<CarIcon className="w-4 h-4 text-gray-400" />}
      title="Fahrzeug & Halter"
      hint="ZB1-OCR aus W3 schreibt Halter + HSN/TSN"
    >
      <InlineEditField label="Kennzeichen" fieldName="kennzeichen" value={f(fall, 'kennzeichen')} />
      <InlineEditField label="Hersteller" fieldName="fahrzeug_hersteller" value={f(fall, 'fahrzeug_hersteller')} />
      <InlineEditField label="Modell" fieldName="fahrzeug_modell" value={f(fall, 'fahrzeug_modell')} />
      <InlineEditField label="FIN" fieldName="fin" value={f(fall, 'fin')} />
      <InlineEditField label="HSN" fieldName="hsn" value={f(fall, 'hsn')} />
      <InlineEditField label="TSN" fieldName="tsn" value={f(fall, 'tsn')} />
      <InlineEditField label="Erstzulassung" fieldName="erstzulassung" value={f(fall, 'erstzulassung')} type="date" />
      <InlineEditField label="Kilometerstand" fieldName="kilometerstand" value={f(fall, 'kilometerstand')} type="number" />
      <InlineEditField label="Halter Vorname" fieldName="halter_vorname" value={f(fall, 'halter_vorname')} />
      <InlineEditField label="Halter Nachname" fieldName="halter_nachname" value={f(fall, 'halter_nachname')} />
    </Card>
  )
}

export function UnfallSection() {
  const { fall } = useFall()
  return (
    <Card icon={<AlertTriangleIcon className="w-4 h-4 text-gray-400" />} title="Unfall">
      <InlineEditField label="Schadensdatum" fieldName="schadens_datum" value={typeof fall.schadens_datum === 'string' ? fall.schadens_datum.slice(0, 10) : null} type="date" />
      <InlineEditField label="Unfall-Uhrzeit" fieldName="unfall_uhrzeit" value={f(fall, 'unfall_uhrzeit')} placeholder="z.B. 14:30" />
      <div className="sm:col-span-2">
        <InlineEditField label="Schadens-Adresse" fieldName="schadens_adresse" value={f(fall, 'schadens_adresse')} />
      </div>
      <InlineEditField label="PLZ" fieldName="schadens_plz" value={f(fall, 'schadens_plz')} />
      <InlineEditField label="Ort" fieldName="schadens_ort" value={f(fall, 'schadens_ort')} />
      <div className="sm:col-span-2">
        <InlineEditField label="Schadens-Ursache" fieldName="schadens_ursache" value={f(fall, 'schadens_ursache')} type="textarea" />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField label="Beschreibung" fieldName="schadens_beschreibung" value={f(fall, 'schadens_beschreibung')} type="textarea" />
      </div>
    </Card>
  )
}

export function GegnerSection() {
  const { fall } = useFall()
  return (
    <Card icon={<ShieldIcon className="w-4 h-4 text-gray-400" />} title="Gegner & Versicherung">
      <InlineEditField label="Gegner Vorname" fieldName="gegner_vorname" value={f(fall, 'gegner_vorname')} />
      <InlineEditField label="Gegner Nachname" fieldName="gegner_nachname" value={f(fall, 'gegner_nachname')} />
      <InlineEditField label="Gegner-Kennzeichen" fieldName="gegner_kennzeichen" value={f(fall, 'gegner_kennzeichen')} />
      <InlineEditField label="Gegner Versicherung" fieldName="gegner_versicherung" value={f(fall, 'gegner_versicherung')} />
      <InlineEditField label="Schadennummer" fieldName="gegner_schadennummer" value={f(fall, 'gegner_schadennummer')} />
      <InlineEditField label="VS-Schadennummer (intern)" fieldName="versicherung_schaden_nr" value={f(fall, 'versicherung_schaden_nr')} />
    </Card>
  )
}

export function VorschaedenSection() {
  const { fall } = useFall()
  return (
    <Card icon={<WrenchIcon className="w-4 h-4 text-gray-400" />} title="Vorschäden">
      <div className="sm:col-span-2">
        <InlineEditField label="Vorschäden bekannt?" fieldName="hat_vorschaeden" value={f(fall, 'hat_vorschaeden')} placeholder="Ja / Nein" />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField
          label="Beschreibung (Bereich / Schadenhöhe)"
          fieldName="vorschaeden_beschreibung"
          value={f(fall, 'vorschaeden_beschreibung')}
          type="textarea"
        />
      </div>
    </Card>
  )
}

export function BesichtigungSection() {
  const { fall } = useFall()
  return (
    <Card icon={<MapPinIcon className="w-4 h-4 text-gray-400" />} title="Besichtigung">
      <div className="sm:col-span-2">
        <InlineEditField label="Besichtigungsort-Adresse" fieldName="besichtigungsort_adresse" value={f(fall, 'besichtigungsort_adresse')} />
      </div>
      <InlineEditField label="PLZ" fieldName="besichtigungsort_plz" value={f(fall, 'besichtigungsort_plz')} />
      <InlineEditField label="Stadt" fieldName="besichtigungsort_stadt" value={f(fall, 'besichtigungsort_stadt')} />
      <div className="sm:col-span-2">
        <InlineEditField label="Fahrzeug-Standort (falls abweichend)" fieldName="fahrzeug_standort_adresse" value={f(fall, 'fahrzeug_standort_adresse')} />
      </div>
    </Card>
  )
}

export function KernwerteSection() {
  const { fall } = useFall()
  return (
    <Card
      icon={<CalculatorIcon className="w-4 h-4 text-gray-400" />}
      title="Gutachten-Kernwerte"
      hint="LexDrive-OCR überschreibt automatisch — Admin-Override möglich"
    >
      <InlineEditField label="Reparaturkosten (€)" fieldName="kernwert_reparaturkosten" value={f(fall, 'kernwert_reparaturkosten')} type="number" />
      <InlineEditField label="Wiederbeschaffungswert (€)" fieldName="kernwert_wiederbeschaffungswert" value={f(fall, 'kernwert_wiederbeschaffungswert')} type="number" />
      <InlineEditField label="Nutzungsausfall (€)" fieldName="kernwert_nutzungsausfall" value={f(fall, 'kernwert_nutzungsausfall')} type="number" />
      <InlineEditField label="Restwert (€)" fieldName="kernwert_restwert" value={f(fall, 'kernwert_restwert')} type="number" />
      <InlineEditField label="Mietwagen (€)" fieldName="kernwert_mietwagen" value={f(fall, 'kernwert_mietwagen')} type="number" />
    </Card>
  )
}

export function VsStatusSection() {
  const { fall } = useFall()
  return (
    <Card
      icon={<FileTextIcon className="w-4 h-4 text-gray-400" />}
      title="VS-Status & Regulierung"
    >
      <InlineEditField label="Kürzungsbetrag (€)" fieldName="kuerzungs_betrag" value={f(fall, 'kuerzungs_betrag')} type="number" />
      <InlineEditField label="Regulierungs-Betrag (€)" fieldName="regulierung_betrag" value={f(fall, 'regulierung_betrag')} type="number" />
      <div className="sm:col-span-2">
        <InlineEditField
          label="VS-Kürzungsgrund"
          fieldName="vs_kuerzung_grund"
          value={f(fall, 'vs_kuerzung_grund')}
          type="textarea"
          hint="Aus LexDrive-Webhook vs_kuerzt, editierbar durch KB"
        />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField
          label="Nachbesichtigungs-Ergebnis"
          fieldName="nachbesichtigung_ergebnis"
          value={f(fall, 'nachbesichtigung_ergebnis')}
          type="textarea"
        />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField
          label="Geschlossen-Grund"
          fieldName="geschlossen_grund"
          value={f(fall, 'geschlossen_grund')}
          type="textarea"
          hint="Nur relevant wenn Fall in abgeschlossen/storniert ist"
        />
      </div>
    </Card>
  )
}
