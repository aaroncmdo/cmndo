'use client'

// AAR-164 / W4: ProzessTab Sections (8 Stück).
// AAR-167: Trigger-Buttons für Stellungnahme / Rüge / Klage sind jetzt
// verdrahtet. E-Akte-Übergabe + Nachbesichtigung-Koordination folgen, sobald
// die entsprechenden Server-Actions existieren.

import Link from 'next/link'
import { useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ScaleIcon,
  SendIcon,
  AlertCircleIcon,
  FileTextIcon,
  GavelIcon,
  MapPinIcon,
  BanknoteIcon,
  ShieldAlertIcon,
} from 'lucide-react'
import { useFall } from '../FallContext'
import {
  requestTechnischeStellungnahme,
  freigebeTechnischeStellungnahme,
  startRuege,
  uebergebeFallKlage,
} from '../actions/prozess'

function Card({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="text-xs">
      <span className="text-gray-400 uppercase tracking-wider text-[10px] block">{label}</span>
      <span className="text-gray-800 font-medium">
        {value == null || value === '' ? '—' : String(value)}
      </span>
    </div>
  )
}

function fmtDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  try {
    return new Date(v).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return v
  }
}

// ─── 1. Kanzlei + E-Akte (ab akte-uebergeben) ──────────────────────────────
export function KanzleiEakteSection() {
  const { fall } = useFall()
  const mandatsnummer = fall.mandatsnummer as string | null
  const uebergebenAm = fmtDate(fall.kanzlei_uebergeben_am)
  return (
    <Card
      icon={<ScaleIcon className="w-4 h-4 text-[#4573A2]" />}
      title="Kanzlei + E-Akte"
      subtitle="LexDrive-Partnerkanzlei, 11 Webhook-Events"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Info label="Mandatsnummer" value={mandatsnummer} />
        <Info label="E-Akte übergeben" value={uebergebenAm} />
        <Info label="Service-Typ" value={(fall.service_typ as string) ?? 'komplett'} />
      </div>
      <p className="text-[11px] text-gray-500 italic">
        LexDriveTriggerPanel + E-Akte-Checkliste werden über das W2-Monolith-
        Fallback weiterhin erreichbar sein; volle Extraktion folgt zusammen mit
        W5 (Webhook-Handler-Erweiterung).
      </p>
    </Card>
  )
}

// ─── 2. Anspruchsschreiben (ab as-vorbereitung) ────────────────────────────
// DB-Verify (2026-04-15): `as_versendet_am`, `as_forderungsbetrag` und
// `vs_stufe` existieren NICHT. Echte Spalten: `anschlussschreiben_am`,
// `as_geforderte_summe`, `vs_eskalationsstufe` (bzw. `vs_timer_stufe`).
export function AsSection() {
  const { fall } = useFall()
  const versendetAm = fmtDate(fall.anschlussschreiben_am)
  const betrag = (fall.as_geforderte_summe as number | null) ?? null
  return (
    <Card
      icon={<SendIcon className="w-4 h-4 text-[#4573A2]" />}
      title="Anspruchsschreiben (AS)"
      subtitle="1-2 Werktage nach E-Akte-Übergabe (SLA)"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Info label="AS versendet am" value={versendetAm} />
        <Info label="Forderungsbetrag (€)" value={betrag} />
        <Info label="Eskalationsstufe" value={fall.vs_eskalationsstufe as string | null} />
      </div>
    </Card>
  )
}

// ─── 3. VS-Reaktion (ab vs-reaktion) ───────────────────────────────────────
export function VsReaktionSection() {
  const { fall } = useFall()
  const reguliert = fall.regulierung_am
  const kuerzt = fall.kuerzungs_betrag != null
  const kuerzungGrund = fall.vs_kuerzung_grund as string | null
  return (
    <Card
      icon={<ShieldAlertIcon className="w-4 h-4 text-amber-600" />}
      title="VS-Reaktion"
      subtitle="Reguliert / Kürzt / Ablehnt / Schweigt"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Info label="Regulierung am" value={fmtDate(reguliert)} />
        <Info label="Kürzungsbetrag (€)" value={fall.kuerzungs_betrag as number | null} />
        <Info label="Regulierung-Betrag (€)" value={fall.regulierung_betrag as number | null} />
        <Info label="Status" value={kuerzt ? 'Gekürzt' : reguliert ? 'Reguliert' : 'Offen'} />
      </div>
      {kuerzungGrund && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
          <strong className="block mb-1">Kürzungsgrund:</strong>
          {kuerzungGrund}
        </div>
      )}
    </Card>
  )
}

// ─── 4. Technische Stellungnahme (NEU, ab vs-kuerzt + technisch) ───────────
export function StellungnahmeSection() {
  const { fall, refreshFall } = useFall()
  const [pending, startTransition] = useTransition()
  const status = fall.technische_stellungnahme_status as string | null
  const beauftragtAm = fmtDate(fall.technische_stellungnahme_beauftragt_am)
  const hochgeladenAm = fmtDate(fall.technische_stellungnahme_hochgeladen_am)
  const freigabeAm = fmtDate(fall.technische_stellungnahme_freigabe_am)
  const kannBeauftragen = !status || status === 'nicht-angefordert'
  const kannFreigeben = status === 'hochgeladen'
  function trigger(action: () => Promise<{ success: boolean; error?: string }>, label: string) {
    startTransition(async () => {
      const r = await action()
      if (r.success) {
        toast.success(`${label} erfolgreich`)
        refreshFall()
      } else toast.error(r.error ?? `${label} fehlgeschlagen`)
    })
  }
  return (
    <Card
      icon={<FileTextIcon className="w-4 h-4 text-[#4573A2]" />}
      title="Technische Stellungnahme SV"
      subtitle="SLA: 72h / 3 WT nach Beauftragung — WA-Reminder 48h, KB-Eskalation 72h"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Info label="Status" value={status ?? 'ausstehend'} />
        <Info label="Beauftragt am" value={beauftragtAm} />
        <Info label="Hochgeladen am" value={hochgeladenAm} />
        <Info label="Freigabe am" value={freigabeAm} />
      </div>
      <div className="flex flex-wrap gap-2">
        {kannBeauftragen && (
          <button
            type="button"
            disabled={pending}
            onClick={() => trigger(() => requestTechnischeStellungnahme(fall.id), 'Stellungnahme beauftragt')}
            className="px-3 py-1.5 rounded-md bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E] disabled:opacity-50"
          >
            SV mit Stellungnahme beauftragen
          </button>
        )}
        {kannFreigeben && (
          <button
            type="button"
            disabled={pending}
            onClick={() => trigger(() => freigebeTechnischeStellungnahme(fall.id), 'Freigabe')}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            Freigeben (Kanzlei kann Rüge vorbereiten)
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
        SV-Portal: StellungnahmeCard in Fallakte{' '}
        <code className="text-[10px]">/gutachter/fall/{String(fall.id).slice(0, 8)}</code>
      </p>
    </Card>
  )
}

// ─── 5. Rüge (Refactoring, ab vs-kuerzt) ──────────────────────────────────
export function RuegeSection() {
  const { fall, refreshFall } = useFall()
  const [pending, startTransition] = useTransition()
  const counter = (fall.ruege_counter as number | null) ?? 0
  const betrag = fall.ruege_betrag as number | null
  function starteRuege() {
    startTransition(async () => {
      const r = await startRuege(fall.id)
      if (r.success) {
        toast.success(`Rüge ${r.runde} gestartet`)
        refreshFall()
      } else toast.error(r.error ?? 'Rüge fehlgeschlagen')
    })
  }
  return (
    <Card
      icon={<AlertCircleIcon className="w-4 h-4 text-orange-600" />}
      title="Rüge-Prozess"
      subtitle="Max 2 Runden, danach Klage-Entscheidung (rein juristisch oder mit SV-Stellungnahme)"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Info label="Rüge-Runde" value={`${counter} / 2`} />
        <Info label="Differenzbetrag (€)" value={betrag} />
        <Info label="Versendet SLA" value="1-2 WT nach Stellungnahme" />
      </div>
      {counter < 2 ? (
        <button
          type="button"
          disabled={pending}
          onClick={starteRuege}
          className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-50"
        >
          {counter === 0 ? 'Rüge 1 starten' : 'Rüge 2 starten'}
        </button>
      ) : (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-[11px] text-red-700">
          Max. Rüge-Runden erreicht — Klage-Entscheidung erforderlich.
        </div>
      )}
    </Card>
  )
}

// ─── 6. Nachbesichtigung (NEU, ab nachbesichtigung-laeuft) ─────────────────
export function NachbesichtigungSection() {
  const { fall } = useFall()
  const status = fall.nachbesichtigung_status as string | null
  const angefordertAm = fmtDate(fall.nachbesichtigung_angefordert_am)
  const terminAm = fmtDate(fall.nachbesichtigung_termin_datum)
  const konfrontation = fall.nachbesichtigung_konfrontation as boolean | null
  const ergebnis = fall.nachbesichtigung_ergebnis as string | null
  return (
    <Card
      icon={<MapPinIcon className="w-4 h-4 text-violet-600" />}
      title="Nachbesichtigung"
      subtitle="Kunde wählt Termin im Portal (KEIN Dispatch); Konfrontations-Termin KB-Entscheidung"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Info label="Status" value={status ?? 'offen'} />
        <Info label="Angefordert am" value={angefordertAm} />
        <Info label="Termin" value={terminAm} />
        <Info
          label="Konfrontation"
          value={konfrontation === true ? 'Ja' : konfrontation === false ? 'Nein' : null}
        />
      </div>
      {ergebnis && (
        <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-[11px] text-gray-700">
          <strong className="block mb-1">Ergebnis:</strong>
          {ergebnis}
        </div>
      )}
      <p className="text-[11px] text-gray-500">
        Kunden-Portal-Route: <code className="text-[10px]">/kunde/nachbesichtigung</code> —
        existiert, Slot-Picker wird in W5 verkabelt.
      </p>
    </Card>
  )
}

// ─── 7. Klage-Übergabe (NEU, ab klage) ─────────────────────────────────────
export function KlageSection() {
  const { fall, refreshFall } = useFall()
  const [pending, startTransition] = useTransition()
  const bereitsInKlage = fall.status === 'klage' || fall.status === 'abgeschlossen'
  function uebergeben() {
    const grund = window.prompt(
      'Grund für Klage-Übergabe (wird in geschlossen_grund gespeichert):',
      'Nach 2 Rüge-Runden — LexDrive übernimmt',
    )
    if (grund === null) return
    startTransition(async () => {
      const r = await uebergebeFallKlage(fall.id, grund || undefined)
      if (r.success) {
        toast.success('Fall an LexDrive übergeben')
        refreshFall()
      } else toast.error(r.error ?? 'Übergabe fehlgeschlagen')
    })
  }
  return (
    <Card
      icon={<GavelIcon className="w-4 h-4 text-red-600" />}
      title="Klage-Übergabe an LexDrive"
      subtitle='Fall für Claimondo = „abgeschlossen mit Klage" — Kanzlei übernimmt individuell'
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Info label="Status" value={fall.status as string | null} />
        <Info label="Geschlossen-Grund" value={fall.geschlossen_grund as string | null} />
      </div>
      {!bereitsInKlage && (
        <button
          type="button"
          disabled={pending}
          onClick={uebergeben}
          className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
        >
          Fall an LexDrive übergeben
        </button>
      )}
      <div className="rounded-md bg-red-50 border border-red-200 p-3 text-[11px] text-red-700">
        Übergabe-Screen: Termin mit LexDrive-Rechtsberater koordinieren. Kein fixer
        Schwellenwert — die Kanzlei entscheidet individuell ob Klage sinnvoll ist.
      </div>
    </Card>
  )
}

// ─── 8. Auszahlung (Refactoring, ab zahlung-eingegangen) ───────────────────
// DB-Verify (2026-04-15): `abrechnungsbetrag` existiert NICHT auf faelle —
// die Kanzlei-Abrechnung lebt via FK `kanzlei_abrechnung_id` in einer eigenen
// Tabelle. Für die Fallakte reichen zahlung_betrag + regulierung_betrag.
export function AuszahlungSection() {
  const { fall } = useFall()
  const betrag = fall.zahlung_betrag as number | null
  const eingangAm = fmtDate(fall.zahlung_eingegangen_am)
  const regulierungBetrag = fall.regulierung_betrag as number | null
  return (
    <Card
      icon={<BanknoteIcon className="w-4 h-4 text-green-600" />}
      title="Auszahlung an Kunden"
      subtitle="Kanzlei überweist (Teilbetrag bei Kürzung möglich) — Info-WA an Kunde"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Info label="Zahlung eingegangen" value={eingangAm} />
        <Info label="Betrag (€)" value={betrag} />
        <Info label="Regulierungs-Betrag (€)" value={regulierungBetrag} />
      </div>
    </Card>
  )
}
