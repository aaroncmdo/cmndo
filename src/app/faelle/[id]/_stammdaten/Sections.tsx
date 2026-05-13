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
import { SectionCard } from '@/components/shared/SectionCard'
import { SchemaFields } from '@/components/shared/stammdaten'

// AAR-frontend-konsolidierung-p1: dünner Adapter — shared SectionCard mit dem
// 2-Spalten-Feld-Grid das alle Stammdaten-Sections nutzen.
function SectionFieldCard({
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
    <SectionCard
      icon={icon}
      title={title}
      hint={hint}
      bodyClassName="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {children}
    </SectionCard>
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
  return (
    <SectionFieldCard icon={<UserIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Kundendaten">
      <SchemaFields block="kunde" fall={fall} lead={lead} />
    </SectionFieldCard>
  )
}

export function FahrzeugdatenSection() {
  const { fall, lead } = useFall()
  // FIN-Spalte heißt fin_vin (nicht fin). AAR-576 (A2): hsn + tsn wandern jetzt
  // vom Lead auf den Fall (DAT-API-Blocker) — Anzeige mit Fall→Lead-Fallback.
  // AAR-311: Cardentity Typ-B (15€) als manueller Trigger im Fahrzeug-Block.
  // Status (vorschaden_*) lebt auf leads — gemeinsam mit Dispatch + SV-Sicht.
  const fin = (fall.fin_vin as string | null) ?? (lead?.fin as string | null) ?? null
  return (
    <SectionFieldCard
      icon={<CarIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Fahrzeug & Halter"
      hint="ZB1-OCR aus W3 schreibt Halter-Felder + FIN"
    >
      <SchemaFields block="fahrzeug" fall={fall} lead={lead} />
      <SchemaFields block="halter" fall={fall} lead={lead} />
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
    </SectionFieldCard>
  )
}

export function UnfallSection() {
  const { fall, lead } = useFall()
  return (
    <SectionFieldCard icon={<AlertTriangleIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Unfall">
      <SchemaFields block="unfall" fall={fall} lead={lead} />
    </SectionFieldCard>
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
    <div className="sm:col-span-2 bg-claimondo-bg border border-claimondo-border rounded-lg px-3 py-2 space-y-1">
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
  const { fall, lead } = useFall()
  // AAR-545 Cluster D: DB-Felder konsolidiert auf gegner_* Namensraum.
  // schadennummer_versicherung/versicherung_schaden_nr/versicherung_name sind
  // ersatzlos weg. FK auf versicherungen-Stammdaten: gegner_versicherung_id.
  const versicherungId = (fall as Record<string, unknown>).gegner_versicherung_id as string | null ?? null
  return (
    <SectionFieldCard icon={<ShieldIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Gegner & Versicherung">
      <SchemaFields block="gegner" fall={fall} lead={lead} />
      <VersicherungStammdaten versicherungId={versicherungId} />
    </SectionFieldCard>
  )
}

export function VorschaedenSection() {
  const { fall, lead } = useFall()
  // DB-Schema: hat_vorschaeden + vorschaden_anzahl + vorschaden_letzter_datum
  // (vorschaeden_beschreibung liegt auf leads, vorschaden_erkannt=CarDentity, vorschaden_geprueft=KB)
  return (
    <SectionFieldCard icon={<WrenchIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Vorschäden">
      <SchemaFields block="vorschaeden" fall={fall} lead={lead} />
    </SectionFieldCard>
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
    <SectionFieldCard
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
                    ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                    : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-claimondo-bg'
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
    </SectionFieldCard>
  )
}

export function BesichtigungSection() {
  const { fall, lead } = useFall()
  // DB-Schema: nur besichtigungsort_adresse existiert auf faelle.
  // AAR-552 Cluster E: besichtigung_datum ersatzlos entfernt — Termin-Datum
  // kommt via v_faelle_mit_aktuellem_termin.aktueller_termin_start.
  return (
    <SectionFieldCard icon={<MapPinIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Besichtigung">
      <SchemaFields block="besichtigung" fall={fall} lead={lead} />
    </SectionFieldCard>
  )
}

export function KernwerteSection() {
  const { fall, lead } = useFall()
  // DB-Schema: reparaturkosten / wiederbeschaffungswert / restwert / wertminderung /
  // schadens_hoehe_netto — kein kernwert_-Prefix
  return (
    <SectionFieldCard
      icon={<CalculatorIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Gutachten-Kernwerte"
      hint="LexDrive-OCR überschreibt automatisch — Admin-Override möglich"
    >
      <SchemaFields block="kernwerte" fall={fall} lead={lead} />
    </SectionFieldCard>
  )
}

// AAR-633: Freitext-Notizen pro Fall. Admin/KB editierbar, volle Breite.
export function NotizenSection() {
  const { fall, lead } = useFall()
  return (
    <SectionFieldCard icon={<StickyNoteIcon className="w-4 h-4 text-claimondo-ondo/70" />} title="Notizen">
      <SchemaFields block="notizen" fall={fall} lead={lead} />
    </SectionFieldCard>
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
    <SectionFieldCard
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
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg border border-claimondo-border bg-claimondo-bg"
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
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-claimondo-ondo text-white hover:bg-claimondo-shield transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Zeuge hinzufügen
          </button>
        )}
      </div>
    </SectionFieldCard>
  )
}

export function VsStatusSection() {
  const { fall } = useFall()
  return (
    <SectionFieldCard
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
    </SectionFieldCard>
  )
}
