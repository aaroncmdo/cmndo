'use client'

// AAR-164 / W4: ProzessTab Sections (8 Stück).
// AAR-167: Trigger-Buttons für Stellungnahme / Rüge / Klage.
// AAR-543 (C6) — 19.04.2026:
// - VsReaktionSection rendert jetzt Quote-Pfad + Pflicht-Banner für
//   vs_kuerzungs_typ + conditional Stellungnahme/Rüge-Action-Buttons
// - NachbesichtigungSection rendert JSONB Kunden-Termin-Vorschläge
// - AuszahlungSection zeigt Split + Rollen-Sichtbarkeits-Hinweis
// - Kritische Felder inline editierbar via InlineEditField

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
  AlertTriangleIcon,
  EyeIcon,
} from 'lucide-react'
import { useFall } from '../FallContext'
import {
  requestTechnischeStellungnahme,
  freigebeTechnischeStellungnahme,
  startRuege,
  uebergebeFallKlage,
} from '../_actions/prozess'
import { triggerLexDriveEventManually } from '../lexdrive-actions'
// AAR-561 (C12): Konfrontations-Dispatch-Lite-Trigger aus KB-Seite
import { triggerKonfrontationFromAdmin } from '../_actions/konfrontation-trigger'
import EndpointRegister from '../_components/LexDriveTriggerPanel'
import InlineEditField from '../_stammdaten/InlineEditField'

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
    <div className="bg-white rounded-xl border border-claimondo-border p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="text-[11px] text-claimondo-ondo mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="text-xs">
      <span className="text-claimondo-ondo/70 uppercase tracking-wider text-[10px] block">{label}</span>
      <span className="text-claimondo-navy font-medium">
        {value == null || value === '' ? '—' : String(value)}
      </span>
    </div>
  )
}

function fmtDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  try {
    return new Date(v).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return v
  }
}

function fmtEuro(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

const KUERZUNGSTYP_LABEL: Record<string, { label: string; color: string }> = {
  technisch: { label: 'Technisch', color: 'bg-[#f8f9fb] text-claimondo-navy border-claimondo-border' },
  argumentativ: { label: 'Argumentativ', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  gemischt: { label: 'Gemischt', color: 'bg-amber-50 text-amber-800 border-amber-200' },
}

// ─── 1. Kanzlei + E-Akte ───────────────────────────────────────────────────
export function KanzleiEakteSection() {
  const { fall, userRolle } = useFall()
  const mandatsnummer = fall.mandatsnummer as string | null
  const uebergebenAm = fmtDate(fall.kanzlei_uebergeben_am)
  const canTrigger = userRolle === 'admin' || userRolle === 'kundenbetreuer'
  return (
    <Card
      icon={<ScaleIcon className="w-4 h-4 text-claimondo-ondo" />}
      title="Kanzlei + E-Akte"
      subtitle="LexDrive-Partnerkanzlei, 24+ Events (manuell + Webhook)"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Info label="Mandatsnummer" value={mandatsnummer} />
        <Info label="E-Akte übergeben" value={uebergebenAm} />
        <Info label="Service-Typ" value={(fall.service_typ as string) ?? 'komplett'} />
      </div>
      {canTrigger && (
        <div className="pt-2">
          <EndpointRegister fallId={fall.id} />
        </div>
      )}
    </Card>
  )
}

// ─── 2. Anspruchsschreiben ─────────────────────────────────────────────────
export function AsSection() {
  const { fall } = useFall()
  return (
    <Card
      icon={<SendIcon className="w-4 h-4 text-claimondo-ondo" />}
      title="Anspruchsschreiben (AS)"
      subtitle="1-2 Werktage nach E-Akte-Übergabe (SLA)"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InlineEditField
          label="AS versendet am"
          fieldName="anschlussschreiben_am"
          value={fall.anschlussschreiben_am as string | null}
          type="date"
        />
        <InlineEditField
          label="Forderungsbetrag (€)"
          fieldName="as_geforderte_summe"
          value={fall.as_geforderte_summe as number | null}
          type="number"
        />
        <Info label="Eskalationsstufe" value={fall.vs_eskalationsstufe as string | null} />
      </div>
    </Card>
  )
}

// ─── 3. VS-Reaktion (inkl. Quote + Pflicht-Banner) ─────────────────────────
export function VsReaktionSection() {
  const { fall, refreshFall } = useFall()
  const [pending, startTransition] = useTransition()
  const reaktionTyp = fall.vs_reaktion_typ as string | null
  const kuerzungstyp = fall.vs_kuerzungs_typ as string | null
  const isQuote = reaktionTyp === 'quotiert'
  const isKuerzt = reaktionTyp === 'gekuerzt'

  // Quote-Berechnung: Quote-Betrag = as_geforderte_summe * prozent / 100
  const quoteProzent = fall.vs_quote_prozent as number | null
  const geforderteSumme = fall.as_geforderte_summe as number | null
  const quoteBetrag =
    typeof quoteProzent === 'number' && typeof geforderteSumme === 'number'
      ? (geforderteSumme * quoteProzent) / 100
      : null
  const quoteAkzeptiertAm = fmtDate(fall.vs_quote_akzeptiert_am)

  function trigger(action: () => Promise<{ success: boolean; error?: string }>, label: string) {
    startTransition(async () => {
      const r = await action()
      if (r.success) {
        toast.success(`${label} erfolgreich`)
        refreshFall()
      } else toast.error(r.error ?? `${label} fehlgeschlagen`)
    })
  }

  function triggerQuoteAkzeptieren() {
    trigger(
      () =>
        triggerLexDriveEventManually(fall.id, 'vs_quote_akzeptiert', {
          akzeptiert_am: new Date().toISOString().slice(0, 10),
        }),
      'Quote akzeptiert',
    )
  }

  function triggerTechnischeStellungnahme() {
    trigger(() => requestTechnischeStellungnahme(fall.id), 'Stellungnahme beauftragt')
  }

  return (
    <Card
      icon={<ShieldAlertIcon className="w-4 h-4 text-amber-600" />}
      title="VS-Reaktion"
      subtitle="Reguliert / Kürzt / Quotiert / Ablehnt / Schweigt"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Info label="Reaktions-Typ" value={reaktionTyp ?? 'offen'} />
        <InlineEditField
          label="Regulierung-Betrag (€)"
          fieldName="regulierung_betrag"
          value={fall.regulierung_betrag as number | null}
          type="number"
        />
        <InlineEditField
          label="Kürzungs-Betrag (€)"
          fieldName="kuerzungs_betrag"
          value={fall.kuerzungs_betrag as number | null}
          type="number"
        />
      </div>

      {/* Quote-Pfad */}
      {isQuote && (
        <div className="rounded-md border border-purple-200 bg-purple-50 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-purple-900">VS quotiert</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Info label="Quote (%)" value={quoteProzent} />
            <Info label="Geforderte Summe" value={fmtEuro(geforderteSumme)} />
            <Info label="Quote-Betrag" value={fmtEuro(quoteBetrag)} />
          </div>
          <InlineEditField
            label="Quote-Begründung"
            fieldName="vs_quote_grund"
            value={fall.vs_quote_grund as string | null}
            type="textarea"
          />
          {quoteAkzeptiertAm ? (
            <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
              ✓ Quote akzeptiert am {quoteAkzeptiertAm}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={triggerQuoteAkzeptieren}
                className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Quote akzeptieren
              </button>
              <p className="text-[11px] text-purple-700 self-center">
                Ablehnen → öffnet Rüge-Vorbereitung (Phase-Header „Kanzlei-Paket einlesen&quot;).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Kürzungs-Pfad mit Pflicht-Banner für vs_kuerzungs_typ */}
      {isKuerzt && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-amber-900">VS kürzt</h4>
          <InlineEditField
            label="Kürzungs-Grund"
            fieldName="vs_kuerzung_grund"
            value={fall.vs_kuerzung_grund as string | null}
            type="textarea"
          />
          {kuerzungstyp && KUERZUNGSTYP_LABEL[kuerzungstyp] ? (
            <span
              className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded border ${KUERZUNGSTYP_LABEL[kuerzungstyp].color}`}
            >
              Typ: {KUERZUNGSTYP_LABEL[kuerzungstyp].label}
            </span>
          ) : (
            <div className="rounded-md border border-red-300 bg-red-50 p-2 flex items-start gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-[11px] font-semibold text-red-800">
                  Kürzungstyp fehlt — bitte ergänzen, damit Stellungnahme-Logik greifen kann.
                </p>
                <InlineEditField
                  label="vs_kuerzungs_typ (technisch | argumentativ | gemischt)"
                  fieldName="vs_kuerzungs_typ"
                  value={kuerzungstyp}
                  placeholder="technisch"
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(kuerzungstyp === 'technisch' || kuerzungstyp === 'gemischt') &&
              !fall.technische_stellungnahme_status && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={triggerTechnischeStellungnahme}
                  className="px-3 py-1.5 rounded-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
                >
                  Stellungnahme von SV anfordern
                </button>
              )}
            {kuerzungstyp === 'argumentativ' && !fall.ruege_gesendet_am && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  toast.info(
                    'Rüge 1 ohne Stellungnahme: Paket im Phase-Header unter „Kanzlei-Paket einlesen" → Rüge 1.',
                  )
                }
                className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                Rüge 1 vorbereiten (ohne Stellungnahme)
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── 4. Technische Stellungnahme ───────────────────────────────────────────
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
      icon={<FileTextIcon className="w-4 h-4 text-claimondo-ondo" />}
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
            onClick={() =>
              trigger(() => requestTechnischeStellungnahme(fall.id), 'Stellungnahme beauftragt')
            }
            className="px-3 py-1.5 rounded-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
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
      <p className="text-[11px] text-claimondo-ondo">
        SV-Portal: StellungnahmeCard in Fallakte{' '}
        <code className="text-[10px]">/gutachter/fall/{String(fall.id).slice(0, 8)}</code>
      </p>
    </Card>
  )
}

// ─── 5. Rüge ───────────────────────────────────────────────────────────────
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

// ─── 6. Nachbesichtigung (mit JSONB-Vorschläge + Konfrontations-Flow) ─────
// AAR-727: Nur rendern wenn tatsächlich angefordert. Whitelist spiegelt die
// Self-Gating-Logik aus components/gutachter NachbesichtigungCard.tsx.
const NACHBESICHTIGUNG_AKTIVE_STATES = new Set([
  'angefordert',
  'termin-gewaehlt',
  'durchgefuehrt',
  'ergebnis-eingegangen',
])

export function NachbesichtigungSection() {
  const { fall, refreshFall } = useFall()
  const [pending, startTransition] = useTransition()
  const status = fall.nachbesichtigung_status as string | null

  // Gate: nur rendern wenn Nachbesichtigung aktiv angefordert wurde.
  if (!status || !NACHBESICHTIGUNG_AKTIVE_STATES.has(status)) return null

  const angefordertAm = fmtDate(fall.nachbesichtigung_angefordert_am)
  const terminAm = fmtDate(fall.nachbesichtigung_termin_datum)
  const svKonfroGewuenscht = fall.nachbesichtigung_sv_konfrontation_gewuenscht as boolean | null
  const konfrontation = fall.nachbesichtigung_konfrontation as boolean | null
  const ergebnis = fall.nachbesichtigung_ergebnis as string | null

  // JSONB-Array: [{ datum: 'YYYY-MM-DD', uhrzeit: 'HH:mm' }]
  const vorschlaegeRaw = fall.nachbesichtigung_kunde_termin_vorschlaege
  const vorschlaege: Array<{ datum: string; uhrzeit: string }> = Array.isArray(vorschlaegeRaw)
    ? (vorschlaegeRaw as Array<{ datum: string; uhrzeit: string }>)
    : []

  function bestaetige(termin: { datum: string; uhrzeit: string }) {
    const iso = `${termin.datum}T${termin.uhrzeit}:00`
    startTransition(async () => {
      const r = await triggerLexDriveEventManually(fall.id, 'vs_nachbesichtigung_ergebnis', {
        datum: iso,
        bestaetigt_am: new Date().toISOString(),
        nachbesichtigung_termin: iso,
        konfrontation: !!svKonfroGewuenscht,
      })
      if (!r.success) {
        toast.error(r.error ?? 'Bestätigung fehlgeschlagen')
        return
      }
      toast.success(`Termin ${termin.datum} ${termin.uhrzeit} bestätigt`)

      // AAR-561 (C12): Konfrontations-Dispatch-Lite — nur wenn Kunde (via C9)
      // SV-Präsenz gewünscht hat. Erstellt einen gutachter_termine-Row mit
      // typ='konfrontation', bezahlt=false, und triggert SV-Mitteilung.
      if (svKonfroGewuenscht) {
        const konfro = await triggerKonfrontationFromAdmin({
          fallId: fall.id,
          terminIso: new Date(iso).toISOString(),
        })
        if (konfro.success) {
          toast.success('Konfrontations-Dispatch-Lite ausgelöst — SV wurde benachrichtigt')
        } else {
          toast.error(konfro.error ?? 'Konfrontations-Dispatch-Lite fehlgeschlagen')
        }
      }

      refreshFall()
    })
  }

  return (
    <Card
      icon={<MapPinIcon className="w-4 h-4 text-violet-600" />}
      title="Nachbesichtigung"
      subtitle="Kunde wählt Termin im Portal; Konfrontations-Termin löst Dispatch-Lite (C12) aus"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Info label="Status" value={status ?? 'offen'} />
        <Info label="Angefordert am" value={angefordertAm} />
        <Info label="Termin" value={terminAm} />
        <Info
          label="SV-Konfrontation gewünscht"
          value={
            svKonfroGewuenscht === true
              ? 'Ja (triggert Dispatch-Lite)'
              : svKonfroGewuenscht === false
                ? 'Nein'
                : null
          }
        />
      </div>

      {vorschlaege.length > 0 && !terminAm && (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-violet-900">Termin-Vorschläge vom Kunden</h4>
          <ul className="space-y-1.5">
            {vorschlaege.map((t, i) => (
              <li
                key={`${t.datum}-${t.uhrzeit}-${i}`}
                className="flex items-center justify-between gap-2 text-[11px] bg-white border border-violet-100 rounded px-2 py-1.5"
              >
                <span className="font-medium text-claimondo-navy">
                  {fmtDate(t.datum)} · {t.uhrzeit}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => bestaetige(t)}
                  className="px-2 py-1 rounded bg-violet-600 text-white text-[10px] font-medium hover:bg-violet-700 disabled:opacity-50"
                >
                  Bestätigen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ergebnis && (
        <div className="rounded-md bg-[#f8f9fb] border border-claimondo-border p-3 text-[11px] text-claimondo-navy">
          <strong className="block mb-1">Ergebnis:</strong>
          {ergebnis}
        </div>
      )}

      {konfrontation === true && (
        <div className="rounded-md bg-violet-50 border border-violet-200 p-2 text-[11px] text-violet-800">
          Konfrontations-Termin aktiv — SV-Dispatch-Lite (AAR-561 C12) wurde
          ausgelöst. SV wurde benachrichtigt und kann in seiner Fallakte annehmen.
        </div>
      )}

      <p className="text-[11px] text-claimondo-ondo">
        Kunden-Portal-Route: <code className="text-[10px]">/kunde/nachbesichtigung</code>
      </p>
    </Card>
  )
}

// ─── 7. Klage-Übergabe ─────────────────────────────────────────────────────
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

// ─── 8. Auszahlung (mit Split + Rollen-Sichtbarkeits-Banner) ──────────────
export function AuszahlungSection() {
  const { fall, userRolle } = useFall()
  const regulierungAm = fmtDate(fall.regulierung_am)
  const regulierungBetrag = fall.regulierung_betrag as number | null
  const zahlungsweg = fall.zahlungsweg as string | null
  const kundenBetrag = fall.auszahlung_kunde_betrag as number | null
  const kundenEingangAm = fmtDate(fall.auszahlung_kunde_eingegangen_am)
  const honorar = fall.gutachter_honorar as number | null
  const svEingangAm = fmtDate(fall.auszahlung_gutachter_eingegangen_am)

  const isAdminSicht = userRolle === 'admin' || userRolle === 'kundenbetreuer'

  return (
    <Card
      icon={<BanknoteIcon className="w-4 h-4 text-green-600" />}
      title="Auszahlung"
      subtitle="Brutto von VS → Split an Kunde + SV-Honorar. Info-WA an Kunde bei Eingang."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Info label="Brutto-Regulierung von VS" value={fmtEuro(regulierungBetrag)} />
        <Info label="Regulierung am" value={regulierungAm} />
        <Info label="Zahlungsweg" value={zahlungsweg} />
      </div>

      {isAdminSicht ? (
        <div className="rounded-md border border-[#EBF1F8] bg-claimondo-bg p-3 space-y-2">
          <h4 className="text-xs font-semibold text-claimondo-navy">Split (Admin-Sicht)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded border border-claimondo-border bg-white p-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">Kunde</p>
              <InlineEditField
                label="Betrag (€)"
                fieldName="auszahlung_kunde_betrag"
                value={kundenBetrag}
                type="number"
              />
              <InlineEditField
                label="Eingegangen am"
                fieldName="auszahlung_kunde_eingegangen_am"
                value={fall.auszahlung_kunde_eingegangen_am as string | null}
                type="date"
              />
              <p className="text-[11px] text-claimondo-ondo">
                {kundenEingangAm ? `✓ ${kundenEingangAm}` : '⏳ ausstehend'}
              </p>
            </div>
            <div className="rounded border border-claimondo-border bg-white p-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">SV / Gutachter</p>
              <InlineEditField
                label="Honorar Soll (€)"
                fieldName="gutachter_honorar"
                value={honorar}
                type="number"
              />
              <InlineEditField
                label="Eingegangen am"
                fieldName="auszahlung_gutachter_eingegangen_am"
                value={fall.auszahlung_gutachter_eingegangen_am as string | null}
                type="date"
              />
              <p className="text-[11px] text-claimondo-ondo">
                {svEingangAm ? `✓ ${svEingangAm}` : '⏳ ausstehend'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-[#EBF1F8] bg-white p-2">
            <EyeIcon className="w-3.5 h-3.5 text-[#4573A2] mt-0.5 shrink-0" />
            <p className="text-[11px] text-claimondo-ondo">
              Sichtbarkeit: Kunde sieht nur Kunden-Betrag (<code>faelle_kunde_view</code>),
              SV nur das Honorar (<code>faelle_sv_view</code>). Admin/KB sehen den vollen Split.
            </p>
          </div>
          <p className="text-[11px] text-claimondo-ondo">
            Split eintragen: Phase-Header „Kanzlei-Paket einlesen&quot; → „Auszahlung eingegangen (Split)&quot;.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-claimondo-border bg-[#f8f9fb] p-3 text-[11px] text-claimondo-navy">
          Split-Anzeige nur für Admin + Kundenbetreuer sichtbar.
        </div>
      )}
    </Card>
  )
}
