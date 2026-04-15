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
  const { lead } = useFall()
  // Kunde-Daten leben auf profiles bzw. leads — KEINE kunde_*-Spalten auf
  // faelle. Inline-Edit der Kunde-Felder läuft nicht über die Fall-Allowlist
  // (siehe stammdaten.ts) — daher hier nur Read-Only-Anzeige aus dem Lead.
  // Bearbeitung über den Lead-Detail bzw. profiles separat.
  return (
    <Card icon={<UserIcon className="w-4 h-4 text-gray-400" />} title="Kundendaten" hint="Bearbeiten über Lead-Detail">
      <div className="text-xs space-y-2">
        <div><span className="text-[10px] uppercase tracking-wider text-gray-400 block">Name</span><span className="text-gray-800 font-medium">{[lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || '—'}</span></div>
        <div><span className="text-[10px] uppercase tracking-wider text-gray-400 block">E-Mail</span><span className="text-gray-800 font-medium">{lead?.email ?? '—'}</span></div>
      </div>
      <div className="text-xs space-y-2">
        <div><span className="text-[10px] uppercase tracking-wider text-gray-400 block">Telefon</span><span className="text-gray-800 font-medium">{lead?.telefon ?? '—'}</span></div>
      </div>
    </Card>
  )
}

export function FahrzeugdatenSection() {
  const { fall } = useFall()
  // FIN-Spalte heißt fin_vin (nicht fin); HSN/TSN existieren auf leads, nicht
  // auf faelle — daher in der Fallakte nicht editierbar.
  return (
    <Card
      icon={<CarIcon className="w-4 h-4 text-gray-400" />}
      title="Fahrzeug & Halter"
      hint="ZB1-OCR aus W3 schreibt Halter-Felder + FIN"
    >
      <InlineEditField label="Kennzeichen" fieldName="kennzeichen" value={f(fall, 'kennzeichen')} />
      <InlineEditField label="Hersteller" fieldName="fahrzeug_hersteller" value={f(fall, 'fahrzeug_hersteller')} />
      <InlineEditField label="Modell" fieldName="fahrzeug_modell" value={f(fall, 'fahrzeug_modell')} />
      <InlineEditField label="FIN/VIN" fieldName="fin_vin" value={f(fall, 'fin_vin')} />
      <InlineEditField label="Baujahr" fieldName="fahrzeug_baujahr" value={f(fall, 'fahrzeug_baujahr')} type="number" />
      <InlineEditField label="Farbe" fieldName="fahrzeug_farbe" value={f(fall, 'fahrzeug_farbe')} />
      <InlineEditField label="Erstzulassung" fieldName="erstzulassung" value={f(fall, 'erstzulassung')} type="date" />
      <InlineEditField label="Kilometerstand" fieldName="kilometerstand" value={f(fall, 'kilometerstand')} type="number" />
      <InlineEditField label="Halter Vorname" fieldName="halter_vorname" value={f(fall, 'halter_vorname')} />
      <InlineEditField label="Halter Nachname" fieldName="halter_nachname" value={f(fall, 'halter_nachname')} />
      <InlineEditField label="Halter Straße" fieldName="halter_strasse" value={f(fall, 'halter_strasse')} />
      <InlineEditField label="Halter PLZ" fieldName="halter_plz" value={f(fall, 'halter_plz')} />
      <InlineEditField label="Halter Stadt" fieldName="halter_stadt" value={f(fall, 'halter_stadt')} />
    </Card>
  )
}

export function UnfallSection() {
  const { fall } = useFall()
  return (
    <Card icon={<AlertTriangleIcon className="w-4 h-4 text-gray-400" />} title="Unfall">
      <InlineEditField label="Schadensdatum" fieldName="schadens_datum" value={typeof fall.schadens_datum === 'string' ? fall.schadens_datum.slice(0, 10) : null} type="date" />
      <InlineEditField label="Schadenart" fieldName="schadenart" value={f(fall, 'schadenart')} />
      <div className="sm:col-span-2">
        <InlineEditField label="Schadens-Adresse" fieldName="schadens_adresse" value={f(fall, 'schadens_adresse')} />
      </div>
      <InlineEditField label="PLZ" fieldName="schadens_plz" value={f(fall, 'schadens_plz')} />
      <InlineEditField label="Ort" fieldName="schadens_ort" value={f(fall, 'schadens_ort')} />
      <div className="sm:col-span-2">
        <InlineEditField label="Schadens-Ursache" fieldName="schadens_ursache" value={f(fall, 'schadens_ursache')} type="textarea" />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField label="Schadenhergang" fieldName="schadenhergang" value={f(fall, 'schadenhergang')} type="textarea" />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField label="Beschreibung" fieldName="schadens_beschreibung" value={f(fall, 'schadens_beschreibung')} type="textarea" />
      </div>
    </Card>
  )
}

export function GegnerSection() {
  const { fall } = useFall()
  // DB-Schema: gegner_name (1 Spalte, kein Vor-/Nachname-Split),
  // schadennummer_versicherung (statt gegner_schadennummer)
  return (
    <Card icon={<ShieldIcon className="w-4 h-4 text-gray-400" />} title="Gegner & Versicherung">
      <div className="sm:col-span-2">
        <InlineEditField label="Gegner Name" fieldName="gegner_name" value={f(fall, 'gegner_name')} />
      </div>
      <InlineEditField label="Gegner-Kennzeichen" fieldName="gegner_kennzeichen" value={f(fall, 'gegner_kennzeichen')} />
      <InlineEditField label="Gegner-Fahrzeugtyp" fieldName="gegner_fahrzeugtyp" value={f(fall, 'gegner_fahrzeugtyp')} />
      <InlineEditField label="Gegner Versicherung" fieldName="gegner_versicherung" value={f(fall, 'gegner_versicherung')} />
      <InlineEditField label="Schadennr. (Versicherung)" fieldName="schadennummer_versicherung" value={f(fall, 'schadennummer_versicherung')} />
      <InlineEditField label="VS-Schadennummer (intern)" fieldName="versicherung_schaden_nr" value={f(fall, 'versicherung_schaden_nr')} />
    </Card>
  )
}

export function VorschaedenSection() {
  const { fall } = useFall()
  // DB-Schema: vorschaden_vorhanden + vorschaden_anzahl + vorschaden_letzter_datum
  // (kein hat_vorschaeden / vorschaeden_beschreibung — die liegen auf leads)
  return (
    <Card icon={<WrenchIcon className="w-4 h-4 text-gray-400" />} title="Vorschäden">
      <InlineEditField label="Vorschäden vorhanden?" fieldName="vorschaden_vorhanden" value={f(fall, 'vorschaden_vorhanden')} placeholder="Ja / Nein" />
      <InlineEditField label="Anzahl" fieldName="vorschaden_anzahl" value={f(fall, 'vorschaden_anzahl')} type="number" />
    </Card>
  )
}

export function BesichtigungSection() {
  const { fall } = useFall()
  // DB-Schema: besichtigungsort_adresse + besichtigung_datum existieren;
  // besichtigungsort_plz/stadt + fahrzeug_standort_* gibt es NICHT.
  return (
    <Card icon={<MapPinIcon className="w-4 h-4 text-gray-400" />} title="Besichtigung">
      <div className="sm:col-span-2">
        <InlineEditField label="Besichtigungsort-Adresse" fieldName="besichtigungsort_adresse" value={f(fall, 'besichtigungsort_adresse')} />
      </div>
      <InlineEditField label="Besichtigungsdatum" fieldName="besichtigung_datum" value={typeof fall.besichtigung_datum === 'string' ? fall.besichtigung_datum.slice(0, 10) : null} type="date" />
    </Card>
  )
}

export function KernwerteSection() {
  const { fall } = useFall()
  // DB-Schema: reparaturkosten / wiederbeschaffungswert / restwert / wertminderung /
  // schadenshoehe / schadenhoehe_netto — kein kernwert_-Prefix
  return (
    <Card
      icon={<CalculatorIcon className="w-4 h-4 text-gray-400" />}
      title="Gutachten-Kernwerte"
      hint="LexDrive-OCR überschreibt automatisch — Admin-Override möglich"
    >
      <InlineEditField label="Reparaturkosten (€)" fieldName="reparaturkosten" value={f(fall, 'reparaturkosten')} type="number" />
      <InlineEditField label="Wiederbeschaffungswert (€)" fieldName="wiederbeschaffungswert" value={f(fall, 'wiederbeschaffungswert')} type="number" />
      <InlineEditField label="Restwert (€)" fieldName="restwert" value={f(fall, 'restwert')} type="number" />
      <InlineEditField label="Wertminderung (€)" fieldName="wertminderung" value={f(fall, 'wertminderung')} type="number" />
      <InlineEditField label="Schadenhöhe brutto (€)" fieldName="schadenshoehe" value={f(fall, 'schadenshoehe')} type="number" />
      <InlineEditField label="Schadenhöhe netto (€)" fieldName="schadenhoehe_netto" value={f(fall, 'schadenhoehe_netto')} type="number" />
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
