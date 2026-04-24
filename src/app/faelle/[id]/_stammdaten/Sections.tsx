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
import { useEffect, useState, useTransition } from 'react'
import {
  UserIcon,
  CarIcon,
  AlertTriangleIcon,
  ShieldIcon,
  WrenchIcon,
  MapPinIcon,
  CalculatorIcon,
  FileTextIcon,
  PhoneIcon,
  MailIcon,
  HashIcon,
  UsersIcon,
  PlusIcon,
  Trash2Icon,
  StickyNoteIcon,
} from 'lucide-react'
import { useFall } from '../FallContext'
import InlineEditField from './InlineEditField'
import { getVersicherungById, type VersicherungSuggestion } from '@/app/dispatch/leads/[id]/_actions/versicherungen'
import { CardentityTypBButton } from '@/components/cardentity/CardentityTypBButton'
import { requestCardentityTypBForFall } from '../_actions/dokumente'

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
    <div className="bg-white rounded-xl border border-claimondo-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-claimondo-navy">{title}</h2>
        {hint && <span className="text-[10px] text-claimondo-ondo/70 ml-auto">{hint}</span>}
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
  // Fallback auf lead.* wenn kunde_* noch nicht gesetzt (Altfälle vor diesem Fix)
  const vorname = (fall.kunde_vorname as string | null) ?? (lead?.vorname as string | null) ?? null
  const nachname = (fall.kunde_nachname as string | null) ?? (lead?.nachname as string | null) ?? null
  const email = (fall.kunde_email as string | null) ?? (lead?.email as string | null) ?? null
  const telefon = (fall.kunde_telefon as string | null) ?? (lead?.telefon as string | null) ?? null
  return (
    <Card icon={<UserIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Kundendaten">
      <InlineEditField label="Vorname" fieldName="kunde_vorname" value={vorname} />
      <InlineEditField label="Nachname" fieldName="kunde_nachname" value={nachname} />
      <InlineEditField label="E-Mail" fieldName="kunde_email" value={email} />
      <InlineEditField label="Telefon" fieldName="kunde_telefon" value={telefon} />
      <InlineEditField label="Straße" fieldName="kunde_strasse" value={f(fall, 'kunde_strasse')} />
      <InlineEditField label="PLZ" fieldName="kunde_plz" value={f(fall, 'kunde_plz')} />
      <InlineEditField label="Stadt" fieldName="kunde_stadt" value={f(fall, 'kunde_stadt')} />
      {/* AAR-629 (1a): Kundensprache für Portal-Übersetzungen. Enum auf DB:
         de/tr/ar/ru/pl/en/other — editierbar als Freitext, Validierung
         serverseitig. Eigener Dropdown = nice-to-have Follow-up. */}
      <InlineEditField label="Sprache (de/tr/ar/ru/pl/en/other)" fieldName="sprache" value={f(fall, 'sprache')} hint="AAR-316: Portal-Übersetzung" />
    </Card>
  )
}

export function FahrzeugdatenSection() {
  const { fall, lead } = useFall()
  // FIN-Spalte heißt fin_vin (nicht fin). AAR-576 (A2): hsn + tsn wandern jetzt
  // vom Lead auf den Fall (DAT-API-Blocker) — Anzeige mit Fall→Lead-Fallback.
  // AAR-311: Cardentity Typ-B (15€) als manueller Trigger im Fahrzeug-Block.
  // Status (vorschaden_*) lebt auf leads — gemeinsam mit Dispatch + SV-Sicht.
  const fin = (fall.fin_vin as string | null) ?? (lead?.fin as string | null) ?? null
  const hsn = (fall.hsn as string | null) ?? (lead?.hsn as string | null) ?? null
  const tsn = (fall.tsn as string | null) ?? (lead?.tsn as string | null) ?? null
  return (
    <Card
      icon={<CarIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Fahrzeug & Halter"
      hint="ZB1-OCR aus W3 schreibt Halter-Felder + FIN"
    >
      <InlineEditField label="Kennzeichen" fieldName="kennzeichen" value={f(fall, 'kennzeichen')} />
      <InlineEditField label="Hersteller" fieldName="fahrzeug_hersteller" value={f(fall, 'fahrzeug_hersteller')} />
      <InlineEditField label="Modell" fieldName="fahrzeug_modell" value={f(fall, 'fahrzeug_modell')} />
      <InlineEditField label="FIN/VIN" fieldName="fin_vin" value={f(fall, 'fin_vin')} />
      <InlineEditField label="HSN" fieldName="hsn" value={hsn} hint="AAR-576: DAT-API" />
      <InlineEditField label="TSN" fieldName="tsn" value={tsn} hint="AAR-576: DAT-API" />
      <InlineEditField label="Baujahr *" fieldName="fahrzeug_baujahr" value={f(fall, 'fahrzeug_baujahr')} type="number" hint="AAR-181: Pflichtfeld" />
      <InlineEditField label="Farbe" fieldName="fahrzeug_farbe" value={f(fall, 'fahrzeug_farbe')} />
      <InlineEditField label="Karosserie-Typ" fieldName="fahrzeug_typ" value={f(fall, 'fahrzeug_typ')} hint="PKW, Transporter, Motorrad …" />
      <InlineEditField label="Erstzulassung" fieldName="erstzulassung" value={f(fall, 'erstzulassung')} type="date" />
      <InlineEditField label="Kilometerstand" fieldName="kilometerstand" value={f(fall, 'kilometerstand')} type="number" />
      {/* AAR-629 (1a): Finanzierung/Leasing + Vorsteuer. Auf leads schon
         länger editierbar, jetzt auch auf faelle. */}
      <InlineEditField label="Finanzierung / Leasing" fieldName="finanzierung_leasing" value={f(fall, 'finanzierung_leasing')} hint="finanzierung / leasing / weder" />
      <InlineEditField label="Vorsteuerabzugsberechtigt?" fieldName="vorsteuerabzugsberechtigt" value={f(fall, 'vorsteuerabzugsberechtigt')} placeholder="Ja / Nein" />
      <InlineEditField label="Halter Vorname" fieldName="halter_vorname" value={f(fall, 'halter_vorname')} />
      <InlineEditField label="Halter Nachname" fieldName="halter_nachname" value={f(fall, 'halter_nachname')} />
      <InlineEditField label="Halter Geburtsdatum" fieldName="halter_geburtsdatum" value={typeof fall.halter_geburtsdatum === 'string' ? fall.halter_geburtsdatum.slice(0, 10) : null} type="date" hint="AAR-318: Halter-Info" />
      <InlineEditField label="Halter E-Mail" fieldName="halter_email" value={f(fall, 'halter_email')} />
      <InlineEditField label="Halter Telefon" fieldName="halter_telefon" value={f(fall, 'halter_telefon')} />
      <InlineEditField label="Halter Straße" fieldName="halter_strasse" value={f(fall, 'halter_strasse')} />
      <InlineEditField label="Halter PLZ" fieldName="halter_plz" value={f(fall, 'halter_plz')} />
      <InlineEditField label="Halter Stadt" fieldName="halter_stadt" value={f(fall, 'halter_stadt')} />
      <InlineEditField label="Halter = Kunde?" fieldName="ist_fahrzeughalter" value={f(fall, 'ist_fahrzeughalter')} placeholder="Ja / Nein" hint="AAR-318: Flag" />
      <InlineEditField label="Werkstatt seit (Datum)" fieldName="werkstatt_seit_datum" value={typeof fall.werkstatt_seit_datum === 'string' ? fall.werkstatt_seit_datum.slice(0, 10) : null} type="date" hint="AAR-305" />
      <div className="sm:col-span-2 pt-2 border-t border-claimondo-border">
        <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mb-1.5">
          Vorschaden-Detailbericht (Cardentity Typ-B)
        </p>
        <CardentityTypBButton
          action={() => requestCardentityTypBForFall(fall.id)}
          finVorhanden={!!fin}
          initial={{
            // Fall-Daten-Konsistenz: cardentity_* + vorschaden_* leben auf faelle.
            // leads hat diese Spalten nicht mehr (gedroppt). hat_vorschaeden
            // bleibt auf leads (Kunden-Angabe im Schadens-Flow).
            fetchedAt: (fall.cardentity_abfrage_am as string | null)
              ?? (fall.cardentity_enriched_at as string | null)
              ?? null,
            vorschadenVorhanden: (lead?.hat_vorschaeden as boolean | null) ?? null,
            vorschadenAnzahl: (fall.vorschaden_anzahl as number | null) ?? null,
            letzterVorschadenDatum: (fall.vorschaden_letzter_datum as string | null) ?? null,
          }}
        />
      </div>
    </Card>
  )
}

export function UnfallSection() {
  const { fall } = useFall()
  return (
    <Card icon={<AlertTriangleIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Unfall">
      <InlineEditField label="Schadensdatum" fieldName="schadens_datum" value={typeof fall.schadens_datum === 'string' ? fall.schadens_datum.slice(0, 10) : null} type="date" />
      <InlineEditField label="Schadensart" fieldName="schadens_art" value={f(fall, 'schadens_art')} />
      <div className="sm:col-span-2">
        <InlineEditField label="Schadens-Adresse" fieldName="schadens_adresse" value={f(fall, 'schadens_adresse')} />
      </div>
      <InlineEditField label="PLZ" fieldName="schadens_plz" value={f(fall, 'schadens_plz')} />
      <InlineEditField label="Ort" fieldName="schadens_ort" value={f(fall, 'schadens_ort')} />
      {/* AAR-629 (1a): Unfallort + Kategorie (Dispatch legt es an, Admin-Override) */}
      <div className="sm:col-span-2">
        <InlineEditField label="Unfallort (strukturiert)" fieldName="unfallort" value={f(fall, 'unfallort')} hint="von Dispatch in Phase 1 gesetzt" />
      </div>
      <InlineEditField label="Unfallort-Kategorie" fieldName="unfallort_kategorie" value={f(fall, 'unfallort_kategorie')} hint="Autobahn / Stadt / Land / Parkplatz" />
      {/* AAR-630 (1b): neue Fall-Spalten (Migration 20260420211923) */}
      <InlineEditField label="Unfall-Uhrzeit" fieldName="unfall_uhrzeit" value={f(fall, 'unfall_uhrzeit')} hint="z.B. 14:30" />
      <InlineEditField label="Unfallort Lat" fieldName="unfallort_lat" value={f(fall, 'unfallort_lat')} type="number" />
      <InlineEditField label="Unfallort Lng" fieldName="unfallort_lng" value={f(fall, 'unfallort_lng')} type="number" />
      <InlineEditField label="Polizeibericht-Status" fieldName="polizeibericht_status" value={f(fall, 'polizeibericht_status')} hint="abgelehnt / offen / hochgeladen" />
      <InlineEditField label="ZB1-Status" fieldName="zb1_status" value={f(fall, 'zb1_status')} hint="abgelehnt / offen / hochgeladen" />
      <InlineEditField label="Fahrerflucht?" fieldName="fahrerflucht" value={f(fall, 'fahrerflucht')} placeholder="Ja / Nein" hint="AAR-135 Auto-Flag, Admin-Override" />
      <InlineEditField label="Auslandskennzeichen?" fieldName="auslandskennzeichen" value={f(fall, 'auslandskennzeichen')} placeholder="Ja / Nein" hint="AAR-135 Auto-Flag, Admin-Override" />
      <div className="sm:col-span-2">
        <InlineEditField label="Schadens-Ursache" fieldName="schadens_ursache" value={f(fall, 'schadens_ursache')} type="textarea" />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField label="Unfallhergang (wie passiert)" fieldName="schadens_hergang" value={f(fall, 'schadens_hergang')} type="textarea" />
      </div>
      {/* AAR-665-Follow: Fahrzeugschaden (was am Auto kaputt) — separates
          Feld, wird von Haiku-Vision aus Unfallfotos automatisch gefüllt. */}
      <div className="sm:col-span-2">
        <InlineEditField
          label="Fahrzeugschaden (was am Auto kaputt ist)"
          fieldName="fahrzeugschaden_beschreibung"
          value={f(fall, 'fahrzeugschaden_beschreibung')}
          type="textarea"
          hint="Wird automatisch aus Unfallfotos gefüllt (Claude Vision)"
        />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField label="Drittschaden (Leitplanke, Handy etc.)" fieldName="sachschaden_beschreibung" value={f(fall, 'sachschaden_beschreibung')} type="textarea" />
      </div>
      <div className="sm:col-span-2">
        <InlineEditField label="Weitere Anmerkungen" fieldName="schadens_beschreibung" value={f(fall, 'schadens_beschreibung')} type="textarea" />
      </div>
    </Card>
  )
}

// AAR-265 W5: Stammdaten-Anzeige der Gegner-Versicherung (Hotline/Email/BaFin)
// aus der versicherungen-Tabelle wenn faelle.gegner_versicherung_id gesetzt ist.
// Wenn nur Freitext (kein FK), zeigen wir einen Hinweis dass keine Stammdaten
// hinterlegt sind — Kanzlei muss dann manuell recherchieren.
function VersicherungStammdaten({ versicherungId }: { versicherungId: string | null }) {
  const [data, setData] = useState<VersicherungSuggestion | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!versicherungId) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    getVersicherungById(versicherungId)
      .then((r) => { if (!cancelled) setData(r) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [versicherungId])

  if (!versicherungId) {
    return (
      <div className="sm:col-span-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
        <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Keine Stammdaten hinterlegt — Schaden-Hotline und BaFin-Nummer müssen
        recherchiert werden (Versicherung war Freitext-Eintrag, kein
        Stammdaten-Match aus dem Autocomplete).
      </div>
    )
  }
  if (loading) {
    return <p className="sm:col-span-2 text-[11px] text-claimondo-ondo/70">Lade Stammdaten ...</p>
  }
  if (!data) {
    return (
      <p className="sm:col-span-2 text-[11px] text-red-600">
        Stammdaten konnten nicht geladen werden (FK-ID veraltet).
      </p>
    )
  }
  return (
    <div className="sm:col-span-2 bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-claimondo-navy font-semibold">
        Stammdaten (aus versicherungen-Tabelle)
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-claimondo-navy">
        {data.schaden_telefon && (
          <span className="flex items-center gap-1">
            <PhoneIcon className="w-3 h-3" /> {data.schaden_telefon}
          </span>
        )}
        {data.schaden_email && (
          <a href={`mailto:${data.schaden_email}`} className="flex items-center gap-1 hover:underline">
            <MailIcon className="w-3 h-3" /> {data.schaden_email}
          </a>
        )}
        {data.bafin_nummer && (
          <span className="flex items-center gap-1">
            <HashIcon className="w-3 h-3" /> BaFin: {data.bafin_nummer}
          </span>
        )}
      </div>
    </div>
  )
}

export function GegnerSection() {
  const { fall } = useFall()
  // AAR-545 Cluster D: DB-Felder konsolidiert auf gegner_* Namensraum.
  // schadennummer_versicherung/versicherung_schaden_nr/versicherung_name sind
  // ersatzlos weg. FK auf versicherungen-Stammdaten: gegner_versicherung_id.
  const versicherungId = (fall as Record<string, unknown>).gegner_versicherung_id as string | null ?? null
  return (
    <Card icon={<ShieldIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Gegner & Versicherung">
      <InlineEditField label="Gegner bekannt?" fieldName="gegner_bekannt" value={f(fall, 'gegner_bekannt')} placeholder="Ja / Nein" />
      <div className="sm:col-span-2">
        <InlineEditField label="Gegner Name" fieldName="gegner_name" value={f(fall, 'gegner_name')} />
      </div>
      <InlineEditField label="Gegner-Kennzeichen" fieldName="gegner_kennzeichen" value={f(fall, 'gegner_kennzeichen')} />
      <InlineEditField label="Gegner-Fahrzeugtyp" fieldName="gegner_fahrzeugtyp" value={f(fall, 'gegner_fahrzeugtyp')} />
      <InlineEditField label="Gegner Versicherung" fieldName="gegner_versicherung" value={f(fall, 'gegner_versicherung')} />
      <InlineEditField label="Gegner-Versicherungsnummer" fieldName="gegner_versicherungsnummer" value={f(fall, 'gegner_versicherungsnummer')} />
      <InlineEditField label="Gegner-Schadennummer" fieldName="gegner_schadennummer" value={f(fall, 'gegner_schadennummer')} />
      {/* AAR-314 (via AAR-629 1a): Anfrage-Datum beim Deutschen Büro Grüne
         Karte — relevant bei Auslandskennzeichen. */}
      <InlineEditField label="Grüne-Karte-Anfrage" fieldName="gegner_versicherung_anfrage_datum" value={typeof fall.gegner_versicherung_anfrage_datum === 'string' ? fall.gegner_versicherung_anfrage_datum.slice(0, 10) : null} type="date" hint="AAR-314: Auslands-KZ" />
      <VersicherungStammdaten versicherungId={versicherungId} />
    </Card>
  )
}

export function VorschaedenSection() {
  const { fall } = useFall()
  // DB-Schema: hat_vorschaeden + vorschaden_anzahl + vorschaden_letzter_datum
  // (vorschaeden_beschreibung liegt auf leads, vorschaden_erkannt=CarDentity, vorschaden_geprueft=KB)
  return (
    <Card icon={<WrenchIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Vorschäden">
      <InlineEditField label="Vorschäden vorhanden?" fieldName="hat_vorschaeden" value={f(fall, 'hat_vorschaeden')} placeholder="Ja / Nein" />
      <InlineEditField label="Anzahl" fieldName="vorschaden_anzahl" value={f(fall, 'vorschaden_anzahl')} type="number" />
      <div className="sm:col-span-2">
        <InlineEditField label="Beschreibung" fieldName="vorschaeden_beschreibung" value={f(fall, 'vorschaeden_beschreibung')} type="textarea" />
      </div>
    </Card>
  )
}

// AAR-313: Nutzungsausfall/Mietwagen-Tracking. Self-gating — rendert nur wenn
// mietwagen_flag oder nutzungsausfall=true. Toggle für fahrzeug_fahrbereit
// (KB setzt nach SV-Rückmeldung) + Checkbox „Kanzlei informiert" (manueller
// Workflow, nur Kanzlei darf bei VS anfragen) + Hinweis auf Reparaturnachweis.
export function NutzungsausfallSection() {
  const { fall, updateField, canEdit } = useFall()
  const mietwagen = fall.mietwagen_flag === true
  const nutzungsausfall = fall.nutzungsausfall === true
  if (!mietwagen && !nutzungsausfall) return null

  const fahrbereit = fall.fahrzeug_fahrbereit as boolean | null
  const kanzleiInformiert = fall.mietwagen_kanzlei_informiert === true
  const editable = canEdit('fahrzeug_fahrbereit')

  return (
    <Card
      icon={<WrenchIcon className="w-4 h-4 text-amber-600" />}
      title="Nutzungsausfall / Mietwagen"
      hint="Manueller Workflow — nur Kanzlei darf bei VS anfragen"
    >
      <div className="sm:col-span-2 space-y-3">
        <div className="text-xs text-claimondo-ondo bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p>
            Kunde hat{' '}
            {mietwagen && nutzungsausfall
              ? 'Mietwagen UND Nutzungsausfall'
              : mietwagen
                ? 'Mietwagen'
                : 'Nutzungsausfall'}{' '}
            geltend gemacht. Nach SV-Rückmeldung „Fahrzeug fahrbereit?" setzen.
            Falls nicht fahrbereit: Kanzlei informieren — nur die Kanzlei darf
            bei der Versicherung den Anspruch geltend machen.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">
            Fahrzeug fahrbereit?
          </span>
          {(['ja', 'nein', 'unklar'] as const).map((opt) => {
            const val = opt === 'ja' ? true : opt === 'nein' ? false : null
            const selected =
              (opt === 'ja' && fahrbereit === true) ||
              (opt === 'nein' && fahrbereit === false) ||
              (opt === 'unklar' && fahrbereit == null)
            return (
              <button
                key={opt}
                type="button"
                disabled={!editable}
                onClick={() => updateField('fahrzeug_fahrbereit', val)}
                className={`px-3 py-1 rounded-md text-xs font-medium border ${
                  selected
                    ? 'bg-[#4573A2] text-white border-[#4573A2]'
                    : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-[#f8f9fb]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {opt === 'ja' ? 'Ja' : opt === 'nein' ? 'Nein' : 'Noch unklar'}
              </button>
            )
          })}
        </div>

        {fahrbereit === false && (
          <label className="flex items-start gap-2 text-xs text-claimondo-navy cursor-pointer">
            <input
              type="checkbox"
              checked={kanzleiInformiert}
              disabled={!canEdit('mietwagen_kanzlei_informiert')}
              onChange={(e) =>
                updateField('mietwagen_kanzlei_informiert', e.target.checked)
              }
              className="mt-0.5"
            />
            <span>
              Kanzlei wurde informiert, dass Mietwagen-/Nutzungsausfall-Anspruch
              bei der Versicherung geltend gemacht werden muss
            </span>
          </label>
        )}

        <p className="text-[11px] text-claimondo-ondo">
          Reparaturnachweis: bitte als Pflichtdokument im Dokumente-Tab hochladen
          sobald die Werkstatt die Reparatur abgeschlossen hat.
        </p>
      </div>
    </Card>
  )
}

export function BesichtigungSection() {
  const { fall } = useFall()
  // DB-Schema: nur besichtigungsort_adresse existiert auf faelle.
  // AAR-552 Cluster E: besichtigung_datum ersatzlos entfernt — Termin-Datum
  // kommt via v_faelle_mit_aktuellem_termin.aktueller_termin_start.
  return (
    <Card icon={<MapPinIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Besichtigung">
      <div className="sm:col-span-2">
        <InlineEditField label="Besichtigungsort-Adresse" fieldName="besichtigungsort_adresse" value={f(fall, 'besichtigungsort_adresse')} />
      </div>
    </Card>
  )
}

export function KernwerteSection() {
  const { fall } = useFall()
  // DB-Schema: reparaturkosten / wiederbeschaffungswert / restwert / wertminderung /
  // schadens_hoehe_netto — kein kernwert_-Prefix
  return (
    <Card
      icon={<CalculatorIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Gutachten-Kernwerte"
      hint="LexDrive-OCR überschreibt automatisch — Admin-Override möglich"
    >
      <InlineEditField label="Reparaturkosten (€)" fieldName="reparaturkosten" value={f(fall, 'reparaturkosten')} type="number" />
      <InlineEditField label="Wiederbeschaffungswert (€)" fieldName="wiederbeschaffungswert" value={f(fall, 'wiederbeschaffungswert')} type="number" />
      <InlineEditField label="Restwert (€)" fieldName="restwert" value={f(fall, 'restwert')} type="number" />
      <InlineEditField label="Wertminderung (€)" fieldName="wertminderung" value={f(fall, 'wertminderung')} type="number" />
      <InlineEditField label="Schadenshöhe netto (€)" fieldName="schadens_hoehe_netto" value={f(fall, 'schadens_hoehe_netto')} type="number" />
    </Card>
  )
}

// AAR-633: Freitext-Notizen pro Fall. Admin/KB editierbar, volle Breite.
export function NotizenSection() {
  const { fall } = useFall()
  return (
    <Card icon={<StickyNoteIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Notizen">
      <div className="sm:col-span-2">
        <InlineEditField
          label="Interne Notiz"
          fieldName="notizen"
          value={f(fall, 'notizen')}
          type="textarea"
          hint="Freitext — für KB/Admin interne Kommunikation"
        />
      </div>
    </Card>
  )
}

// AAR-633: Zeugen-Kontakte als editierbare Liste. Die Daten liegen in
// faelle.zeugen_kontakte (JSONB-Array). Custom-UI mit Add/Remove, weil
// InlineEditField nur Skalare kann.
type ZeugeKontakt = { name: string; telefon: string; email?: string; notiz?: string }

export function ZeugenKontakteSection() {
  const { fall, canEdit, updateField } = useFall()
  const editable = canEdit('zeugen_kontakte')
  // Defensiv: zeugen_kontakte ist JSONB. Kann null, [], {}, oder kaputtes JSON sein.
  // Nur als Array akzeptieren, sonst leeres Array — verhindert .map-Crash bei
  // neu angelegten Fällen oder Legacy-Daten mit Nicht-Array-JSONB.
  const rawZeugen = fall.zeugen_kontakte as unknown
  const initial: ZeugeKontakt[] = Array.isArray(rawZeugen) ? (rawZeugen as ZeugeKontakt[]) : []
  const [zeugen, setZeugen] = useState<ZeugeKontakt[]>(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  function persist(next: ZeugeKontakt[]) {
    setZeugen(next)
    setStatus('saving')
    startTransition(async () => {
      const r = await updateField('zeugen_kontakte', next)
      if (r.success) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  function updateZeuge(idx: number, patch: Partial<ZeugeKontakt>) {
    const next = zeugen.map((z, i) => (i === idx ? { ...z, ...patch } : z))
    persist(next)
  }

  function addZeuge() {
    persist([...zeugen, { name: '', telefon: '', email: '', notiz: '' }])
  }

  function removeZeuge(idx: number) {
    persist(zeugen.filter((_, i) => i !== idx))
  }

  return (
    <Card
      icon={<UsersIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Zeugen-Kontakte"
      hint={status === 'saving' ? 'Speichert …' : status === 'saved' ? 'Gespeichert' : status === 'error' ? 'Fehler' : undefined}
    >
      <div className="sm:col-span-2 space-y-3">
        {zeugen.length === 0 && (
          <p className="text-xs text-claimondo-ondo/70">Noch keine Zeugen erfasst.</p>
        )}
        {zeugen.map((z, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg border border-claimondo-border bg-[#f8f9fb]"
          >
            <input
              className="text-sm px-2 py-1 rounded bg-white border border-claimondo-border"
              placeholder="Name"
              defaultValue={z.name}
              disabled={!editable}
              onBlur={(e) => updateZeuge(idx, { name: e.target.value })}
            />
            <input
              className="text-sm px-2 py-1 rounded bg-white border border-claimondo-border"
              placeholder="Telefon"
              defaultValue={z.telefon}
              disabled={!editable}
              onBlur={(e) => updateZeuge(idx, { telefon: e.target.value })}
            />
            <input
              className="text-sm px-2 py-1 rounded bg-white border border-claimondo-border"
              placeholder="E-Mail (optional)"
              defaultValue={z.email ?? ''}
              disabled={!editable}
              onBlur={(e) => updateZeuge(idx, { email: e.target.value })}
            />
            <div className="flex gap-2">
              <input
                className="flex-1 text-sm px-2 py-1 rounded bg-white border border-claimondo-border"
                placeholder="Notiz (optional)"
                defaultValue={z.notiz ?? ''}
                disabled={!editable}
                onBlur={(e) => updateZeuge(idx, { notiz: e.target.value })}
              />
              {editable && (
                <button
                  type="button"
                  onClick={() => removeZeuge(idx)}
                  className="px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  aria-label="Zeuge entfernen"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {editable && (
          <button
            type="button"
            onClick={addZeuge}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#4573A2] text-white hover:bg-[#1E3A5F] transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Zeuge hinzufügen
          </button>
        )}
      </div>
    </Card>
  )
}

export function VsStatusSection() {
  const { fall } = useFall()
  return (
    <Card
      icon={<FileTextIcon className="w-4 h-4 text-claimondo-ondo/70" />}
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
