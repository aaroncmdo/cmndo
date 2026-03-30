'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import {
  addTimelineEntry,
  uploadPflichtdokument,
  setAnschlussschreibenDatum,
  recordZahlung,
  eskalation,
  updateSchadensAdresse,
  sendChatNachricht,
  uploadDatei,
  upsertQcCheckliste,
  qcBestanden,
  qcNachbesserung,
  saveKanzleiAnsprechpartner,
  createFallTask,
  updateTaskStatus,
  createTermin,
  updateTerminStatus,
} from './actions'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import {
  CheckIcon,
  ClockIcon,
  AlertTriangleIcon,
  UploadIcon,
  SendIcon,
  PhoneIcon,
  MailIcon,
  MessageSquareIcon,
  FileTextIcon,
  PlusIcon,
  ExternalLinkIcon,
  BanknoteIcon,
  CarIcon,
  PencilIcon,
  XIcon,
  MapPinIcon,
  ImageIcon,
  DownloadIcon,
  FolderOpenIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  BrainIcon,
  SparklesIcon,
  LoaderIcon,
  TimerIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Fall = Record<string, unknown> & {
  id: string
  fall_nummer: string | null
  status: string
  lead_id: string | null
  schadens_ursache: string | null
  schadens_beschreibung: string | null
  schadens_datum: string | null
  schadens_adresse: string | null
  schadens_plz: string | null
  schadens_ort: string | null
  abtretung_signiert_am: string | null
  vollmacht_signiert_am: string | null
  sv_id: string | null
  sv_zugewiesen_am: string | null
  sv_termin: string | null
  gutachten_eingegangen_am: string | null
  gutachten_betrag: number | null
  kanzlei_uebergeben_am: string | null
  anschlussschreiben_am: string | null
  versicherung_name: string | null
  versicherung_schaden_nr: string | null
  regulierung_betrag: number | null
  regulierung_am: string | null
  filmcheck_ok: boolean
  filmcheck_am: string | null
  notizen: string | null
  created_at: string
  schadenfall_typ: string | null
  kunden_konstellation: string | null
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  fahrzeug_baujahr: number | null
  fahrzeug_typ: string | null
  gegner_name: string | null
  gegner_versicherung: string | null
  gegner_kennzeichen: string | null
  gegner_bekannt: boolean
  polizei_aktenzeichen: string | null
  polizei_bericht_vorhanden: boolean
  personenschaden_flag: boolean
  mietwagen_flag: boolean
  leasing_flag: boolean
  finanzierung_flag: boolean
  gewerbe_flag: boolean
  halter_ungleich_fahrer_flag: boolean
  ust_id: string | null
  leasinggeber_name: string | null
  bank_name: string | null
  anwalt_status: string | null
  prioritaet: string | null
  kundenbetreuer_id: string | null
  leadbearbeiter_id: string | null
  konvertiert_am: string | null
  ki_kalkulation: {
    beschaedigte_teile: string[]
    schweregrad: 'leicht' | 'mittel' | 'schwer'
    geschaetzte_kosten_min: number
    geschaetzte_kosten_max: number
    beschreibung: string
  } | null
  ki_kalkulation_am: string | null
  ki_geschaetzte_kosten_min: number | null
  ki_geschaetzte_kosten_max: number | null
  schadenhoehe_netto: number | null
  vs_eskalationsstufe: string | null
  kanzlei_ansprechpartner_name: string | null
  kanzlei_ansprechpartner_email: string | null
  kanzlei_ansprechpartner_telefon: string | null
  kanzlei_ansprechpartner_position: string | null
  mandatsnummer: string | null
}

type Lead = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  schadenfall_typ: string | null
  kunden_konstellation: string | null
} | null

type Profile = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

type SV = {
  id: string
  paket: string
  profile: { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null
} | null

type Dokument = {
  id: string
  typ: string
  datei_url: string
  datei_name: string | null
  datei_groesse: number | null
  created_at: string
  kategorie: string | null
  hochgeladen_von: string | null
  hochgeladen_von_rolle: string | null
  quelle: string | null
  sichtbar_fuer: string[] | null
}

type Partei = {
  id: string
  rolle: string
  name: string
  versicherung_name: string | null
  versicherung_nr: string | null
  telefon: string | null
  email: string | null
}

type TimelineEntry = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  erstellt_von: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type Pflichtdokument = {
  id: string
  dokument_typ: string
  status: string
  pflicht: boolean
  quelle: string | null
  dokument_url: string | null
  hochgeladen_am: string | null
  created_at: string
}

type Nachricht = {
  id: string
  kanal: string
  sender_id: string | null
  sender_rolle: string | null
  nachricht: string
  hat_anhang: boolean
  anhang_url: string | null
  created_at: string
}

type QcCheckliste = {
  id: string
  fall_id: string
  gutachten_vorhanden: boolean
  gutachten_vollstaendig: boolean
  fin_17_zeichen: boolean
  schadenspositionen_erfasst: boolean
  fotos_ausreichend: boolean
  sa_vorhanden: boolean
  vollmacht_vorhanden: boolean
  kundendaten_vollstaendig: boolean
  vorschaeden_beruecksichtigt: boolean | null
  kommentar: string | null
  geprueft_von: string | null
  geprueft_am: string | null
  status: string
  created_at: string
} | null

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { key: 'ersterfassung', label: 'Ersterfassung' },
  { key: 'sv-zugewiesen', label: 'Gutachter zugew.' },
  { key: 'sv-termin', label: 'Termin vereinbart' },
  { key: 'gutachten-eingegangen', label: 'Gutachten eing.' },
  { key: 'filmcheck', label: 'QC-Pruefung' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei uebergeben' },
  { key: 'anschlussschreiben', label: 'AS gesendet' },
  { key: 'regulierung', label: 'Regulierung' },
  { key: 'abgeschlossen', label: 'Abgeschlossen' },
]

const NEXT_ACTION: Record<string, { label: string; desc: string; color: string }> = {
  ersterfassung: { label: 'Dokumente pruefen', desc: 'FlowLink-Daten pruefen und fehlende Dokumente anfordern.', color: 'blue' },
  'sv-zugewiesen': { label: 'SV-Termin koordinieren', desc: 'Gutachter-Termin mit Kunden abstimmen.', color: 'blue' },
  'sv-termin': { label: 'Auf Gutachten warten', desc: 'Gutachten-Eingang ueberwachen. Kunde informieren.', color: 'yellow' },
  'gutachten-eingegangen': { label: 'Filmcheck durchfuehren', desc: 'Alle Unterlagen pruefen und Fall an Kanzlei uebergeben.', color: 'orange' },
  filmcheck: { label: 'Filmcheck abschliessen', desc: 'Qualitaetskontrolle aller Dokumente.', color: 'orange' },
  'kanzlei-uebergeben': { label: 'Anschlussschreiben senden', desc: 'AS an Versicherung senden und VS-Frist starten.', color: 'purple' },
  anschlussschreiben: { label: 'VS-Frist ueberwachen', desc: 'Tag X von 14 — Frist ueberwachen, ggf. eskalieren.', color: 'red' },
  regulierung: { label: 'Zahlung pruefen', desc: 'Zahlungseingang dokumentieren und Fall abschliessen.', color: 'green' },
  abgeschlossen: { label: 'Fall abgeschlossen', desc: 'Keine Aktion erforderlich.', color: 'green' },
  storniert: { label: 'Fall storniert', desc: 'Keine Aktion erforderlich.', color: 'zinc' },
}

const SF_LABELS: Record<string, string> = {
  'SF-01': 'Unfall mit Gegner',
  'SF-02': 'Teilschuld',
  'SF-03': 'Unfallflucht / Vandalismus',
  'SF-04': 'Selbstverschuldet',
  'SF-05': 'Personenschaden (Zusatz)',
  'SF-06': 'Nutzungsausfall / Mietwagen',
  'sf-01': 'Unfall mit Gegner',
  'sf-02': 'Teilschuld',
  'sf-03': 'Unfallflucht / Vandalismus',
  'sf-04': 'Selbstverschuldet',
  'sf-05': 'Personenschaden (Zusatz)',
  'sf-06': 'Nutzungsausfall / Mietwagen',
}

const KK_LABELS: Record<string, string> = {
  'KK-01': 'Privat (Standard)',
  'KK-02': 'Leasing',
  'KK-03': 'Finanzierung',
  'KK-04': 'Firma',
  'KK-05': 'Halter != Fahrer',
}

const DOK_LABELS: Record<string, string> = {
  fahrzeugschein: 'Fahrzeugschein',
  fuehrerschein: 'Fuehrerschein',
  schadensfotos: 'Schadensfotos',
  schadensfoto: 'Schadensfoto',
  'gegner-daten': 'Gegner-Daten',
  'eigene-versicherung': 'Eigene Versicherung',
  polizeibericht: 'Polizeibericht',
  'eigene-versicherungspolice': 'Versicherungspolice',
  leasingvertrag: 'Leasingvertrag',
  finanzierungsvertrag: 'Finanzierungsvertrag',
  gewerbenachweis: 'Gewerbenachweis',
  'gf-vollmacht': 'GF-Vollmacht',
  'halter-ausweis': 'Ausweis Halter',
  'aerztliches-attest': 'Aerztliches Attest',
  mietwagenvertrag: 'Mietwagenvertrag',
  gutachten: 'Gutachten-PDF',
  'kanzlei-paket': 'Kanzlei-Paket',
}

const WA_TEMPLATES: Record<string, { label: string; text: string }> = {
  ersterfassung: {
    label: 'Willkommen + FlowLink',
    text: 'Hallo {name}, willkommen bei Claimondo! Bitte fuellen Sie Ihren FlowLink aus: {flowlink}',
  },
  'sv-zugewiesen': {
    label: 'Gutachter-Termin',
    text: 'Hallo {name}, Ihr Gutachter-Termin wurde vereinbart. Details folgen in Kuerze.',
  },
  'sv-termin': {
    label: 'Gutachten-Status',
    text: 'Hallo {name}, der Gutachter hat Ihr Fahrzeug begutachtet. Wir warten auf das Gutachten.',
  },
  'kanzlei-uebergeben': {
    label: 'Kanzlei informiert',
    text: 'Hallo {name}, Ihr Fall wurde an unsere Partnerkanzlei uebergeben. Die Kanzlei wird sich bei Ihnen melden.',
  },
  anschlussschreiben: {
    label: 'AS versendet',
    text: 'Hallo {name}, das Anschlussschreiben wurde an die Versicherung gesendet. Wir halten Sie auf dem Laufenden.',
  },
  regulierung: {
    label: 'Zahlung eingegangen',
    text: 'Hallo {name}, die Versicherung hat die Regulierung ueberwiesen. Ihr Fall ist fast abgeschlossen!',
  },
}

const TIMELINE_ICON: Record<string, { bg: string; color: string }> = {
  'status-change': { bg: 'bg-blue-950', color: 'text-blue-400' },
  upload: { bg: 'bg-violet-950', color: 'text-violet-400' },
  notiz: { bg: 'bg-zinc-800', color: 'text-zinc-400' },
  email: { bg: 'bg-green-950', color: 'text-green-400' },
  anruf: { bg: 'bg-yellow-950', color: 'text-yellow-400' },
  whatsapp: { bg: 'bg-emerald-950', color: 'text-emerald-400' },
  system: { bg: 'bg-zinc-800', color: 'text-zinc-500' },
}

const KANAL_ICON: Record<string, typeof PhoneIcon> = {
  whatsapp: MessageSquareIcon,
  email: MailIcon,
  anruf: PhoneIcon,
}

// ─── Kategorisierung + Sichtbarkeit ──────────────────────────────────────────

const KATEGORIE_LABELS: Record<string, string> = {
  kundendokument: 'Kundendokumente',
  schadensfoto: 'Schadensfotos',
  gutachten: 'Gutachten',
  kanzlei: 'Kanzlei-Dokumente',
  unterschrift: 'Unterschriften / Vollmachten',
  'whatsapp-foto': 'WhatsApp-Fotos',
  'gutachter-foto': 'Gutachter-Fotos',
  sonstiges: 'Sonstiges',
}

const KATEGORIE_ORDER = ['kundendokument', 'schadensfoto', 'gutachten', 'gutachter-foto', 'kanzlei', 'unterschrift', 'whatsapp-foto', 'sonstiges']

const KATEGORIE_COLORS: Record<string, string> = {
  kundendokument: 'blue',
  schadensfoto: 'orange',
  gutachten: 'purple',
  kanzlei: 'emerald',
  unterschrift: 'yellow',
  'whatsapp-foto': 'green',
  'gutachter-foto': 'blue',
  sonstiges: 'zinc',
}

const QUELLE_LABELS: Record<string, string> = {
  flowlink: 'FlowLink',
  portal: 'Portal',
  whatsapp: 'WhatsApp',
  gutachter: 'Gutachter',
  admin: 'Admin',
  kanzlei: 'Kanzlei',
}

function kategorieVonTyp(typ: string): string {
  if (['fahrzeugschein', 'fuehrerschein', 'finanzierungsvertrag', 'leasingvertrag', 'gewerbenachweis', 'gf-vollmacht', 'halter-ausweis', 'mietwagenvertrag', 'aerztliches-attest', 'eigene-versicherung', 'eigene-versicherungspolice', 'gegner-daten', 'polizeibericht'].includes(typ)) return 'kundendokument'
  if (['schadensfotos', 'schadensfoto', 'foto-schaden'].includes(typ) || typ.startsWith('foto')) return 'schadensfoto'
  if (typ === 'gutachten') return 'gutachten'
  if (['kanzlei-paket', 'anspruchsschreiben', 'regulierung', 'rechnung'].includes(typ)) return 'kanzlei'
  if (['abtretung', 'vollmacht'].includes(typ)) return 'unterschrift'
  if (typ === 'whatsapp-foto') return 'whatsapp-foto'
  if (typ === 'gutachter-foto') return 'gutachter-foto'
  return 'sonstiges'
}

function sichtbarkeitVonKategorie(kategorie: string): string[] {
  const map: Record<string, string[]> = {
    kundendokument: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
    schadensfoto: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
    gutachten: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
    'gutachter-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger'],
    kanzlei: ['admin', 'kundenbetreuer', 'kunde', 'kanzlei'],
    unterschrift: ['admin', 'kundenbetreuer', 'kanzlei'],
    'whatsapp-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
    sonstiges: ['admin', 'kundenbetreuer'],
  }
  return map[kategorie] ?? ['admin']
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function profileName(p: Profile) {
  if (!p) return '—'
  return `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || p.email || '—'
}

function daysBetween(from: string, to: Date) {
  const a = new Date(from)
  const diff = to.getTime() - a.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-500 text-sm w-40 shrink-0">{label}</span>
      <span className="text-zinc-200 text-sm">{value || '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-500/10 text-red-400 border-red-800/30',
    green: 'bg-green-500/10 text-green-400 border-green-800/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-800/30',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-800/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-800/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-800/30',
    zinc: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-800/30',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colors[color] ?? colors.zinc}`}>
      {children}
    </span>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'uebersicht' | 'dokumente' | 'dateien' | 'qc' | 'timeline' | 'kommunikation' | 'kanzlei' | 'chat' | 'abrechnung' | 'tasks'

type TaskItem = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  status: string
  faellig_am: string | null
  erledigt_am: string | null
  zugewiesen_an: string | null
  prioritaet: string | null
  auto_erstellt: boolean | null
  created_at: string
}

type Termin = {
  id: string
  typ: string
  datum: string
  dauer_minuten: number
  betreff: string | null
  notiz: string | null
  meet_link: string | null
  status: string
  ergebnis_notiz: string | null
  erstellt_am: string
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FallakteClient({
  fall,
  lead,
  sv,
  kundenbetreuer,
  leadbearbeiter,
  dokumente,
  parteien,
  timeline,
  pflichtdokumente,
  nachrichten,
  qcCheckliste,
  tasks,
  termine,
}: {
  fall: Fall
  lead: Lead
  sv: SV
  kundenbetreuer: Profile
  leadbearbeiter: Profile
  dokumente: Dokument[]
  parteien: Partei[]
  timeline: TimelineEntry[]
  pflichtdokumente: Pflichtdokument[]
  nachrichten: Nachricht[]
  qcCheckliste: QcCheckliste
  tasks: TaskItem[]
  termine: Termin[]
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('uebersicht')
  const [mapsReady, setMapsReady] = useState(
    typeof window !== 'undefined' && typeof google !== 'undefined' && !!google.maps?.places,
  )

  const offeneTasks = tasks.filter(t => t.status !== 'erledigt').length

  const tabs: [Tab, string][] = [
    ['uebersicht', 'Uebersicht'],
    ['dokumente', `Dokumente (${pflichtdokumente.length})`],
    ['dateien', `Dateien (${dokumente.length})`],
    ['qc', `QC-Pruefung${qcCheckliste?.status === 'bestanden' ? ' ✓' : qcCheckliste?.status === 'nachbesserung' ? ' !' : ''}`],
    ['timeline', `Timeline (${timeline.length})`],
    ['kommunikation', 'Kommunikation'],
    ['kanzlei', 'Kanzlei'],
    ['chat', 'Chat'],
    ['abrechnung', 'Abrechnung'],
    ['tasks', `Tasks${offeneTasks > 0 ? ` (${offeneTasks})` : ''}`],
  ]

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`}
          strategy="lazyOnload"
          onReady={() => setMapsReady(true)}
        />
      )}
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <a href="/admin/faelle" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
                ← Alle Faelle
              </a>
            </div>
            <h1 className="text-xl font-semibold text-white">
              Kundenakte{fall.fall_nummer ? ` · ${fall.fall_nummer}` : ''}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || lead.email : '—'}
              {fall.kennzeichen && <span className="ml-2 text-zinc-600">· {fall.kennzeichen}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {fall.prioritaet === 'hoch' && <Badge color="red">Prioritaet</Badge>}
            <StatusBadge status={fall.status} />
          </div>
        </div>

        {/* Vorschaden-Banner */}
        {(fall as Record<string, unknown>).vorschaden_vorhanden === true && (
          <div className="mb-4 bg-amber-950 border border-amber-800 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-amber-300 font-medium text-sm">
                VORSCHADEN GEFUNDEN — {String((fall as Record<string, unknown>).vorschaden_anzahl ?? '?')} Vorschaeden bekannt
              </p>
              {String((fall as Record<string, unknown>).vorschaden_letzter_datum ?? '') && (
                <p className="text-amber-500 text-xs mt-0.5">
                  Letzter Vorschaden: {new Date(String((fall as Record<string, unknown>).vorschaden_letzter_datum)).toLocaleDateString('de-DE')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* VS-Eskalations-Banner */}
        {fall.anschlussschreiben_am && fall.vs_eskalationsstufe && fall.vs_eskalationsstufe !== 'vs-01' && (
          <div className={`mb-4 rounded-2xl p-4 flex items-center gap-3 border ${
            ['vs-06', 'vs-07'].includes(fall.vs_eskalationsstufe)
              ? 'bg-red-950 border-red-800'
              : ['vs-04', 'vs-05'].includes(fall.vs_eskalationsstufe)
              ? 'bg-orange-950 border-orange-800'
              : 'bg-yellow-950 border-yellow-800'
          }`}>
            <TimerIcon className={`w-5 h-5 shrink-0 ${
              ['vs-06', 'vs-07'].includes(fall.vs_eskalationsstufe) ? 'text-red-400' :
              ['vs-04', 'vs-05'].includes(fall.vs_eskalationsstufe) ? 'text-orange-400' :
              'text-yellow-400'
            }`} />
            <div className="flex-1">
              <p className={`font-medium text-sm ${
                ['vs-06', 'vs-07'].includes(fall.vs_eskalationsstufe) ? 'text-red-300' :
                ['vs-04', 'vs-05'].includes(fall.vs_eskalationsstufe) ? 'text-orange-300' :
                'text-yellow-300'
              }`}>
                VS-ESKALATION {fall.vs_eskalationsstufe.toUpperCase()} —{' '}
                {daysBetween(fall.anschlussschreiben_am, new Date())} Tage seit AS
              </p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
              ['vs-06', 'vs-07'].includes(fall.vs_eskalationsstufe) ? 'bg-red-500/20 text-red-400' :
              ['vs-04', 'vs-05'].includes(fall.vs_eskalationsstufe) ? 'bg-orange-500/20 text-orange-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {fall.vs_eskalationsstufe.toUpperCase()}
            </span>
          </div>
        )}

        {/* Pipeline Fortschrittsbalken */}
        <PipelineBar status={fall.status} />

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 border border-zinc-800 overflow-x-auto">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'uebersicht' && (
          <TabUebersicht
            fall={fall}
            lead={lead}
            sv={sv}
            kundenbetreuer={kundenbetreuer}
            leadbearbeiter={leadbearbeiter}
            parteien={parteien}
            dokumente={dokumente}
            termine={termine}
            mapsReady={mapsReady}
            onRefresh={() => router.refresh()}
          />
        )}
        {activeTab === 'dokumente' && (
          <TabDokumente
            fall={fall}
            pflichtdokumente={pflichtdokumente}
            dokumente={dokumente}
            onRefresh={() => router.refresh()}
          />
        )}
        {activeTab === 'dateien' && (
          <TabDateien
            fall={fall}
            dokumente={dokumente}
            onRefresh={() => router.refresh()}
          />
        )}
        {activeTab === 'qc' && (
          <TabQcPruefung
            fall={fall}
            qcCheckliste={qcCheckliste}
            dokumente={dokumente}
            pflichtdokumente={pflichtdokumente}
            onRefresh={() => router.refresh()}
          />
        )}
        {activeTab === 'timeline' && (
          <TabTimeline
            fall={fall}
            timeline={timeline}
            onRefresh={() => router.refresh()}
          />
        )}
        {activeTab === 'kommunikation' && (
          <TabKommunikation
            fall={fall}
            lead={lead}
            timeline={timeline}
          />
        )}
        {activeTab === 'kanzlei' && (
          <TabKanzlei
            fall={fall}
            onRefresh={() => router.refresh()}
          />
        )}
        {activeTab === 'chat' && (
          <TabChat
            fall={fall}
            nachrichten={nachrichten}
            onRefresh={() => router.refresh()}
          />
        )}
        {activeTab === 'abrechnung' && (
          <TabAbrechnung fall={fall} />
        )}
        {activeTab === 'tasks' && (
          <TabTasks
            fall={fall}
            tasks={tasks}
            onRefresh={() => router.refresh()}
          />
        )}
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const step = PIPELINE_STEPS.find((s) => s.key === status)
  const label = step?.label ?? status
  const idx = PIPELINE_STEPS.findIndex((s) => s.key === status)
  const color = status === 'storniert' ? 'zinc' :
    status === 'abgeschlossen' ? 'green' :
    idx <= 1 ? 'blue' :
    idx <= 4 ? 'orange' :
    idx <= 6 ? 'purple' : 'green'

  return (
    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
      color === 'green' ? 'bg-green-500/10 text-green-400 border-green-800/30' :
      color === 'blue' ? 'bg-blue-500/10 text-blue-400 border-blue-800/30' :
      color === 'orange' ? 'bg-orange-500/10 text-orange-400 border-orange-800/30' :
      color === 'purple' ? 'bg-purple-500/10 text-purple-400 border-purple-800/30' :
      'bg-zinc-800 text-zinc-400 border-zinc-700'
    }`}>
      {label}
    </span>
  )
}

// ─── Pipeline Bar ─────────────────────────────────────────────────────────────

function PipelineBar({ status }: { status: string }) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === status)

  return (
    <div className="mb-6 bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
      <div className="flex items-center gap-1">
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = i === currentIdx
          const isPast = i < currentIdx
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={`w-full h-2 rounded-full transition-all ${
                  isPast ? 'bg-blue-500' :
                  isActive ? 'bg-blue-400 animate-pulse' :
                  'bg-zinc-800'
                }`}
              />
              <span className={`text-[10px] font-medium tracking-wider ${
                isActive ? 'text-blue-400' :
                isPast ? 'text-zinc-400' :
                'text-zinc-600'
              }`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── KI-Schaetzung ───────────────────────────────────────────────────────────

const SCHWEREGRAD_BADGE: Record<string, string> = {
  leicht: 'bg-green-500/10 text-green-400 border-green-800/30',
  mittel: 'bg-yellow-500/10 text-yellow-400 border-yellow-800/30',
  schwer: 'bg-red-500/10 text-red-400 border-red-800/30',
}

function KiSchaetzungSection({ fall, dokumente, onRefresh }: { fall: Fall; dokumente: Dokument[]; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [textMode, setTextMode] = useState(false)
  const [beschreibung, setBeschreibung] = useState('')

  const schadensfotos = dokumente.filter(d =>
    d.kategorie === 'schadensfoto' || d.kategorie === 'whatsapp-foto' || d.typ === 'schadensfotos'
  )

  async function runEstimate(modus: 'fotos' | 'text') {
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { fall_id: fall.id, modus }
      if (modus === 'fotos') {
        body.bild_urls = schadensfotos.map(d => d.datei_url).slice(0, 8)
      } else {
        body.schadensbeschreibung = beschreibung
        body.fahrzeug_typ = fall.fahrzeug_typ
        body.fahrzeug_hersteller = fall.fahrzeug_hersteller
        body.fahrzeug_baujahr = fall.fahrzeug_baujahr
      }
      const res = await fetch('/api/schadenkalkulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Fehler')
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  const ki = fall.ki_kalkulation
  const abweichung = ki && fall.schadenhoehe_netto
    ? Math.round(((fall.schadenhoehe_netto - (ki.geschaetzte_kosten_min + ki.geschaetzte_kosten_max) / 2) / fall.schadenhoehe_netto) * 100)
    : null

  return (
    <Section title="KI-Schaetzung">
      {ki ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <SparklesIcon className="w-4 h-4 text-violet-400" />
            <span className="text-violet-400 text-sm font-medium">
              {fmtCurrency(ki.geschaetzte_kosten_min)} — {fmtCurrency(ki.geschaetzte_kosten_max)}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SCHWEREGRAD_BADGE[ki.schweregrad] ?? SCHWEREGRAD_BADGE.mittel}`}>
              {ki.schweregrad}
            </span>
            {abweichung !== null && (
              <span className={`text-xs ${Math.abs(abweichung) > 20 ? 'text-red-400' : 'text-zinc-500'}`}>
                Abw. {abweichung > 0 ? '+' : ''}{abweichung}%
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ki.beschaedigte_teile.map(t => (
              <span key={t} className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded-full text-xs border border-zinc-700">{t}</span>
            ))}
          </div>
          <p className="text-zinc-400 text-xs">{ki.beschreibung}</p>
          <p className="text-zinc-600 text-xs">Geschaetzt am {fmt(fall.ki_kalkulation_am)}</p>
          {fall.schadenhoehe_netto && (
            <div className="border-t border-zinc-800/50 pt-2 mt-2">
              <InfoRow label="Gutachten (real)" value={fmtCurrency(fall.schadenhoehe_netto)} />
              <InfoRow label="KI-Schaetzung" value={`${fmtCurrency(ki.geschaetzte_kosten_min)} — ${fmtCurrency(ki.geschaetzte_kosten_max)}`} />
            </div>
          )}
          <p className="text-zinc-600 text-[10px] mt-1">Dies ist eine KI-Schaetzung. Der endgueltige Wert wird durch das Gutachten bestimmt.</p>
          <button
            onClick={() => runEstimate(schadensfotos.length > 0 ? 'fotos' : 'text')}
            disabled={loading}
            className="text-xs text-violet-400 hover:text-violet-300 mt-1"
          >
            {loading ? 'Wird geschaetzt...' : 'Erneut schaetzen'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-zinc-500 text-sm">Noch keine KI-Schaetzung vorhanden.</p>
          {error && <p className="text-red-400 text-xs">{error}</p>}

          {schadensfotos.length > 0 && (
            <button
              onClick={() => runEstimate('fotos')}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <BrainIcon className="w-4 h-4" />}
              Aus Fotos schaetzen ({schadensfotos.length} Fotos)
            </button>
          )}

          {!textMode ? (
            <button
              onClick={() => setTextMode(true)}
              className="text-xs text-zinc-400 hover:text-zinc-300"
            >
              Oder: Aus Beschreibung schaetzen
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder="Schadensbeschreibung eingeben..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none"
                rows={3}
              />
              <button
                onClick={() => runEstimate('text')}
                disabled={loading || !beschreibung.trim()}
                className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                Schaetzen
              </button>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ─── TAB 1: Uebersicht ───────────────────────────────────────────────────────

function TabUebersicht({
  fall,
  lead,
  sv,
  kundenbetreuer,
  leadbearbeiter,
  parteien,
  dokumente,
  termine,
  mapsReady,
  onRefresh,
}: {
  fall: Fall
  lead: Lead
  sv: SV
  kundenbetreuer: Profile
  leadbearbeiter: Profile
  parteien: Partei[]
  dokumente: Dokument[]
  termine: Termin[]
  mapsReady: boolean
  onRefresh: () => void
}) {
  const [editingAdresse, setEditingAdresse] = useState(false)
  const [savingAdresse, setSavingAdresse] = useState(false)
  const [adresseError, setAdresseError] = useState<string | null>(null)
  const [showTerminModal, setShowTerminModal] = useState(false)

  const handlePlaceSelect = useCallback(async (result: PlaceResult) => {
    setSavingAdresse(true)
    setAdresseError(null)
    try {
      // Extract city/ort from the formatted address (portion before the PLZ, or after)
      // The formatted address is like "Musterstr. 1, 12345 Berlin, Germany"
      // We'll extract the city from the address string by removing the street part and country
      let ort = ''
      const parts = result.adresse.split(',').map(s => s.trim())
      // Typically: "Street Nr", "PLZ City", "Country"
      if (parts.length >= 2) {
        const plzCity = parts[1] // e.g. "12345 Berlin"
        const plzMatch = plzCity.match(/^\d{5}\s+(.+)$/)
        if (plzMatch) {
          ort = plzMatch[1]
        } else {
          ort = plzCity
        }
      }
      await updateSchadensAdresse(fall.id, {
        adresse: result.adresse,
        plz: result.plz,
        ort,
      })
      setEditingAdresse(false)
      onRefresh()
    } catch (e) {
      setAdresseError(e instanceof Error ? e.message : 'Fehler beim Speichern')
    }
    setSavingAdresse(false)
  }, [fall.id, onRefresh])

  const action = NEXT_ACTION[fall.status]
  const flags = [
    fall.personenschaden_flag && { label: 'Personenschaden', color: 'red' },
    fall.mietwagen_flag && { label: 'Mietwagen', color: 'blue' },
    fall.leasing_flag && { label: 'Leasing', color: 'purple' },
    fall.finanzierung_flag && { label: 'Finanzierung', color: 'orange' },
    fall.gewerbe_flag && { label: 'Gewerbe', color: 'yellow' },
    fall.halter_ungleich_fahrer_flag && { label: 'Halter != Fahrer', color: 'zinc' },
    fall.polizei_bericht_vorhanden && { label: 'Polizeibericht', color: 'emerald' },
  ].filter(Boolean) as { label: string; color: string }[]

  // Gutachtertermin-Karte Logik
  const svTermin = fall.sv_termin ? new Date(fall.sv_termin) : null
  const svName = sv?.profile ? `${sv.profile.vorname ?? ''} ${sv.profile.nachname ?? ''}`.trim() : null
  const showTerminKarte = svTermin && !['besichtigung', 'gutachten-eingegangen', 'filmcheck', 'kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'abgeschlossen', 'storniert'].includes(fall.status)
  const terminIsToday = svTermin && svTermin.toDateString() === new Date().toDateString()
  const terminIsOverdue = svTermin && svTermin < new Date() && !terminIsToday
  const terminCountdown = svTermin ? Math.ceil((svTermin.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0

  // Dokumenten-Checkliste Logik
  const pflichtDocsStatus = [
    { name: 'Sicherungsabtretung', done: !!fall.abtretung_signiert_am, date: fall.abtretung_signiert_am },
    { name: 'Vollmacht', done: !!fall.vollmacht_signiert_am, date: fall.vollmacht_signiert_am },
    { name: 'Fahrzeugschein', done: dokumente.some(d => d.kategorie === 'fahrzeugschein'), date: null },
    { name: 'Fuehrerschein', done: dokumente.some(d => d.kategorie === 'fuehrerschein'), date: null },
    { name: 'Schadensfotos', done: dokumente.filter(d => d.kategorie === 'schadensfotos').length >= 4, date: null },
  ]
  const docsComplete = pflichtDocsStatus.filter(d => d.done).length
  const docsTotal = pflichtDocsStatus.length
  const docsPct = Math.round((docsComplete / docsTotal) * 100)

  // FIN
  const finVin = (fall as Record<string, unknown>).fin_vin as string | null
  const vorschadenVorhanden = (fall as Record<string, unknown>).vorschaden_vorhanden as boolean | null
  const vorschadenAnzahl = (fall as Record<string, unknown>).vorschaden_anzahl as number | null

  return (
    <div className="space-y-4">
      {/* GUTACHTERTERMIN-KARTE (prominent, volle Breite) */}
      {showTerminKarte && svTermin && (
        <div className={`rounded-2xl p-5 border ${
          terminIsToday ? 'border-green-600 bg-green-950/30' :
          terminIsOverdue ? 'border-red-600 bg-red-950/30' :
          'border-blue-600/40 bg-blue-950/20'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Gutachtertermin</p>
              {svName && (
                <p className="text-white text-sm font-medium mb-1">{svName}</p>
              )}
              <p className={`text-2xl font-bold ${terminIsToday ? 'text-green-400' : terminIsOverdue ? 'text-red-400' : 'text-white'}`}>
                {svTermin.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                {' '}
                {svTermin.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </p>
              {fall.schadens_adresse && (
                <p className="text-zinc-400 text-sm mt-1">{[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ')}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              {terminIsToday && (
                <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">HEUTE</span>
              )}
              {terminIsOverdue && (
                <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">UEBERFAELLIG</span>
              )}
              {!terminIsToday && !terminIsOverdue && (
                <span className="bg-blue-600/20 text-blue-400 text-xs font-medium px-3 py-1 rounded-full">
                  In {terminCountdown} Tagen
                </span>
              )}
            </div>
          </div>
          {/* Warnung wenn Docs fehlen */}
          {docsComplete < docsTotal && terminCountdown <= 2 && terminCountdown >= 0 && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-950/50 border border-amber-800/40">
              <p className="text-amber-400 text-xs font-semibold">
                ACHTUNG: Gutachtertermin in {terminCountdown} Tagen aber {docsTotal - docsComplete} Pflichtdokumente fehlen noch!
              </p>
            </div>
          )}
        </div>
      )}

      {/* KUNDENBETREUER-TERMINE */}
      <TermineKarte termine={termine} fallId={fall.id} onOpenModal={() => setShowTerminModal(true)} onRefresh={onRefresh} />

      {/* Termin-Modal */}
      {showTerminModal && (
        <TerminModal fallId={fall.id} onClose={() => setShowTerminModal(false)} onRefresh={onRefresh} />
      )}

      {/* DOKUMENTEN-CHECKLISTE (kompakt) */}
      <Section title={`Pflichtdokumente (${docsComplete}/${docsTotal})`}>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all ${docsPct === 100 ? 'bg-emerald-500' : docsPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${docsPct}%` }}
          />
        </div>
        <div className="space-y-1.5">
          {pflichtDocsStatus.map(doc => (
            <div key={doc.name} className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${doc.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {doc.done ? '\u2713' : '\u2717'}
              </span>
              <span className={`text-sm ${doc.done ? 'text-zinc-300' : 'text-red-400 font-medium'}`}>
                {doc.name}
                {doc.done && doc.date && <span className="text-zinc-600 text-xs ml-2">{new Date(doc.date).toLocaleDateString('de-DE')}</span>}
                {!doc.done && <span className="text-red-500 text-xs ml-2">FEHLT</span>}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Betreuer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Section title="Kundenbetreuer">
          {kundenbetreuer ? (
            <div className="space-y-1">
              <p className="text-white text-sm font-medium">{profileName(kundenbetreuer)}</p>
              {kundenbetreuer.telefon && (
                <a href={`tel:${kundenbetreuer.telefon}`} className="flex items-center gap-2 text-blue-400 text-sm hover:text-blue-300">
                  <PhoneIcon className="w-3.5 h-3.5" /> {kundenbetreuer.telefon}
                </a>
              )}
              {kundenbetreuer.email && (
                <a href={`mailto:${kundenbetreuer.email}`} className="flex items-center gap-2 text-blue-400 text-sm hover:text-blue-300">
                  <MailIcon className="w-3.5 h-3.5" /> {kundenbetreuer.email}
                </a>
              )}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">Nicht zugewiesen</p>
          )}
        </Section>

        <Section title="Leadbearbeiter">
          {leadbearbeiter ? (
            <p className="text-zinc-400 text-sm">{profileName(leadbearbeiter)}</p>
          ) : (
            <p className="text-zinc-600 text-sm">—</p>
          )}
        </Section>
      </div>

      {/* Naechste Aktion */}
      {action && fall.status !== 'abgeschlossen' && fall.status !== 'storniert' && (
        <div className={`rounded-2xl p-5 border ${
          action.color === 'red' ? 'border-red-800/50 bg-red-500/5' :
          action.color === 'orange' ? 'border-orange-800/50 bg-orange-500/5' :
          action.color === 'purple' ? 'border-purple-800/50 bg-purple-500/5' :
          action.color === 'green' ? 'border-green-800/50 bg-green-500/5' :
          action.color === 'yellow' ? 'border-yellow-800/50 bg-yellow-500/5' :
          'border-blue-800/50 bg-blue-500/5'
        }`}>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Naechste Aktion</p>
          <p className={`text-base font-semibold ${
            action.color === 'red' ? 'text-red-400' :
            action.color === 'orange' ? 'text-orange-400' :
            action.color === 'purple' ? 'text-purple-400' :
            action.color === 'green' ? 'text-green-400' :
            action.color === 'yellow' ? 'text-yellow-400' :
            'text-blue-400'
          }`}>{action.label}</p>
          <p className="text-sm text-zinc-400 mt-1">{action.desc}</p>
        </div>
      )}

      {/* Stammdaten */}
      {lead && (
        <Section title="Stammdaten">
          <InfoRow label="Name" value={`${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()} />
          <InfoRow label="E-Mail" value={lead.email} />
          <InfoRow label="Telefon" value={lead.telefon} />
          <InfoRow label="Schadenfall-Typ" value={
            <Badge color="blue">{SF_LABELS[fall.schadenfall_typ ?? ''] ?? fall.schadenfall_typ ?? '—'}</Badge>
          } />
          <InfoRow label="Konstellation" value={
            <Badge color="purple">{KK_LABELS[fall.kunden_konstellation ?? ''] ?? fall.kunden_konstellation ?? '—'}</Badge>
          } />
        </Section>
      )}

      {/* Schadensadresse */}
      <Section title="Schadensadresse">
        {editingAdresse ? (
          <div className="space-y-3">
            {mapsReady ? (
              <GooglePlaceAutocomplete
                defaultValue={[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ')}
                placeholder="Schadensadresse eingeben..."
                onSelect={handlePlaceSelect}
              />
            ) : (
              <p className="text-zinc-500 text-sm">Google Maps wird geladen...</p>
            )}
            {savingAdresse && <p className="text-zinc-500 text-xs">Speichert...</p>}
            {adresseError && <p className="text-red-400 text-xs">{adresseError}</p>}
            <button
              onClick={() => { setEditingAdresse(false); setAdresseError(null) }}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
            >
              <XIcon className="w-3 h-3" /> Abbrechen
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <MapPinIcon className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-zinc-200 text-sm">
                {[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
            <button
              onClick={() => setEditingAdresse(true)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
              title="Adresse bearbeiten"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </Section>

      {/* Fahrzeugdaten + FIN */}
      <Section title="Fahrzeugdaten">
        <div className="space-y-0">
          {(fall.fahrzeug_hersteller || fall.fahrzeug_modell) && (
            <p className="text-white text-lg font-medium mb-1">
              {[fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')}
            </p>
          )}
          {fall.kennzeichen && (
            <span className="inline-block bg-blue-950 text-blue-300 text-sm font-mono font-medium px-3 py-1 rounded-lg mb-2">
              {fall.kennzeichen}
            </span>
          )}
        </div>
        {fall.fahrzeug_baujahr && <InfoRow label="Baujahr" value={String(fall.fahrzeug_baujahr)} />}
        {fall.fahrzeug_typ && <InfoRow label="Typ" value={fall.fahrzeug_typ} />}
        {fall.schadenhoehe_netto && (
          <InfoRow label="Schadenhoehe" value={
            <span className="text-amber-400 font-semibold">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(fall.schadenhoehe_netto)}
            </span>
          } />
        )}

        {/* FIN */}
        <div className="border-t border-zinc-800/50 mt-2 pt-2">
          {finVin ? (
            <div>
              <InfoRow label="FIN" value={<span className="font-mono text-sm">{finVin}</span>} />
              {vorschadenVorhanden !== null && (
                <InfoRow label="Vorschaden" value={
                  vorschadenVorhanden
                    ? <span className="text-red-400 font-medium">{vorschadenAnzahl ?? '?'} Vorschaeden gefunden</span>
                    : <span className="text-emerald-400">Keine Vorschaeden</span>
                } />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="bg-amber-950 text-amber-400 text-xs font-medium px-2 py-0.5 rounded">FIN fehlt noch</span>
              <span className="text-zinc-500 text-xs">Wird aus Fahrzeugschein extrahiert (OCR)</span>
            </div>
          )}
        </div>
      </Section>

      {/* Gegner-Daten */}
      {fall.gegner_bekannt && fall.gegner_name && (
        <Section title="Gegner-Daten">
          <InfoRow label="Name" value={fall.gegner_name} />
          <InfoRow label="Versicherung" value={fall.gegner_versicherung} />
          <InfoRow label="Kennzeichen" value={fall.gegner_kennzeichen} />
          {fall.polizei_aktenzeichen && <InfoRow label="Polizei-Aktenzeichen" value={fall.polizei_aktenzeichen} />}
        </Section>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <Section title="Flags">
          <div className="flex flex-wrap gap-2">
            {flags.map((f) => (
              <Badge key={f.label} color={f.color}>{f.label}</Badge>
            ))}
          </div>
        </Section>
      )}

      {/* SV + Gutachten */}
      <Section title="Sachverstaendiger & Gutachten">
        {sv ? (
          <>
            <InfoRow label="SV" value={
              sv.profile
                ? `${sv.profile.vorname ?? ''} ${sv.profile.nachname ?? ''}`.trim() || '—'
                : '—'
            } />
            <InfoRow label="Paket" value={sv.paket} />
            <InfoRow label="Zugewiesen am" value={fmt(fall.sv_zugewiesen_am)} />
            <InfoRow label="SV-Termin" value={fmt(fall.sv_termin)} />
          </>
        ) : (
          <p className="text-zinc-600 text-sm">Noch kein SV zugewiesen</p>
        )}
        <div className="border-t border-zinc-800/50 mt-2 pt-2">
          <InfoRow label="Gutachten am" value={fmt(fall.gutachten_eingegangen_am)} />
          <InfoRow label="Gutachten-Betrag" value={fmtCurrency(fall.gutachten_betrag)} />
        </div>
      </Section>

      {/* Nutzungsausfall (nach Gutachten sichtbar) */}
      {fall.gutachten_eingegangen_am && (
        <Section title="Nutzungsausfall">
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Nutzungsausfall berechtigt" value={
              (fall as Record<string, unknown>).nutzungsausfall_berechtigt
                ? <span className="text-emerald-400">Ja</span>
                : <span className="text-zinc-500">Nein / Nicht geprueft</span>
            } />
            <InfoRow label="Tage" value={String((fall as Record<string, unknown>).nutzungsausfall_tage ?? '\u2014')} />
            <InfoRow label="Tagessatz" value={fmtCurrency((fall as Record<string, unknown>).nutzungsausfall_tagessatz as number | null)} />
            <InfoRow label="Gesamt" value={
              fmtCurrency(
                ((fall as Record<string, unknown>).nutzungsausfall_tage as number ?? 0) *
                ((fall as Record<string, unknown>).nutzungsausfall_tagessatz as number ?? 0) || null
              )
            } />
          </div>
          <div className="border-t border-zinc-800/50 mt-2 pt-2 grid grid-cols-2 gap-3">
            <InfoRow label="Mietwagen genutzt" value={
              (fall as Record<string, unknown>).mietwagen_genutzt ? <span className="text-blue-400">Ja</span> : <span className="text-zinc-500">Nein</span>
            } />
            <InfoRow label="Mietwagen-Kosten" value={fmtCurrency((fall as Record<string, unknown>).mietwagen_kosten as number | null)} />
          </div>
        </Section>
      )}

      {/* KI-Schaetzung */}
      <KiSchaetzungSection fall={fall} dokumente={dokumente} onRefresh={onRefresh} />

      {/* Unterschriften */}
      <Section title="Unterschriften">
        <InfoRow label="Abtretung" value={
          fall.abtretung_signiert_am
            ? <span className="text-green-400">Signiert am {fmt(fall.abtretung_signiert_am)}</span>
            : <span className="text-zinc-600">Ausstehend</span>
        } />
        <InfoRow label="Vollmacht" value={
          fall.vollmacht_signiert_am
            ? <span className="text-green-400">Signiert am {fmt(fall.vollmacht_signiert_am)}</span>
            : <span className="text-zinc-600">Ausstehend</span>
        } />
      </Section>

      {/* Notizen */}
      {fall.notizen && (
        <Section title="Notizen">
          <p className="text-zinc-300 text-sm whitespace-pre-wrap">{fall.notizen}</p>
        </Section>
      )}
    </div>
  )
}

// ─── TAB 2: Dokumente ─────────────────────────────────────────────────────────

function TabDokumente({
  fall,
  pflichtdokumente,
  dokumente,
  onRefresh,
}: {
  fall: Fall
  pflichtdokumente: Pflichtdokument[]
  dokumente: Dokument[]
  onRefresh: () => void
}) {
  const [uploading, setUploading] = useState<string | null>(null)

  async function handleUpload(pflichtdok: Pflichtdokument, file: File) {
    setUploading(pflichtdok.id)
    const supabase = createClient()

    try {
      const ext = file.name.split('.').pop() ?? 'pdf'
      const path = `admin/${fall.id}/${pflichtdok.dokument_typ}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('dokumente')
        .upload(path, file, { contentType: file.type })
      if (uploadErr) throw new Error(uploadErr.message)
      const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path)

      const kat = kategorieVonTyp(pflichtdok.dokument_typ)
      await supabase.from('dokumente').insert({
        fall_id: fall.id,
        typ: pflichtdok.dokument_typ,
        datei_url: publicUrl,
        datei_name: file.name,
        datei_groesse: file.size,
        kategorie: kat,
        quelle: 'admin',
        hochgeladen_von_rolle: 'admin',
        sichtbar_fuer: sichtbarkeitVonKategorie(kat),
      })

      await uploadPflichtdokument(fall.id, pflichtdok.id, publicUrl)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(null)
    }
  }

  const gutachtenDoks = dokumente.filter((d) => d.typ === 'gutachten')
  const statusColors: Record<string, { badge: string; color: string }> = {
    ausstehend: { badge: 'red', color: 'text-red-400' },
    hochgeladen: { badge: 'green', color: 'text-green-400' },
    geprueft: { badge: 'blue', color: 'text-blue-400' },
  }

  return (
    <div className="space-y-4">
      <Section title="Pflichtdokumente">
        {pflichtdokumente.length === 0 ? (
          <p className="text-zinc-600 text-sm">Keine Pflichtdokumente angelegt.</p>
        ) : (
          <div className="space-y-2">
            {pflichtdokumente.map((dok) => {
              const sc = statusColors[dok.status] ?? statusColors.ausstehend
              return (
                <div key={dok.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800/30 border border-zinc-800">
                  {dok.status === 'hochgeladen' || dok.status === 'geprueft' ? (
                    <CheckIcon className={`w-4 h-4 flex-shrink-0 ${sc.color}`} />
                  ) : (
                    <ClockIcon className="w-4 h-4 flex-shrink-0 text-red-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200">{DOK_LABELS[dok.dokument_typ] ?? dok.dokument_typ}</span>
                      {dok.pflicht && <span className="text-[10px] text-red-400">PFLICHT</span>}
                    </div>
                    {dok.hochgeladen_am && (
                      <p className="text-xs text-zinc-600 mt-0.5">Hochgeladen am {fmt(dok.hochgeladen_am)}</p>
                    )}
                  </div>
                  <Badge color={sc.badge}>{dok.status}</Badge>
                  {dok.dokument_url && (
                    <a href={dok.dokument_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                      <ExternalLinkIcon className="w-4 h-4" />
                    </a>
                  )}
                  {dok.status === 'ausstehend' && (
                    <FileUploadButton loading={uploading === dok.id} onFile={(f) => handleUpload(dok, f)} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {gutachtenDoks.length > 0 && (
        <Section title="Gutachten-PDF">
          {gutachtenDoks.map((d) => (
            <a key={d.id} href={d.datei_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 transition-colors">
              <FileTextIcon className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-zinc-200">{d.datei_name ?? 'Gutachten'}</span>
              <span className="text-xs text-zinc-600 ml-auto">{fmt(d.created_at)}</span>
            </a>
          ))}
        </Section>
      )}

      {fall.filmcheck_ok && (
        <Section title="Kanzlei-Paket">
          <a href={`/api/pdf/kanzlei-paket/${fall.id}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-800/30 hover:border-blue-700/50 transition-colors">
            <FileTextIcon className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-blue-300">Kanzlei-Paket PDF herunterladen</span>
          </a>
        </Section>
      )}

      {dokumente.length > 0 && (
        <Section title={`Alle Dokumente (${dokumente.length})`}>
          <div className="space-y-1">
            {dokumente.map((d) => (
              <a key={d.id} href={d.datei_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-800 transition-colors">
                {d.typ.startsWith('foto') || d.typ === 'schadensfoto' ? (
                  <img src={d.datei_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <FileTextIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                )}
                <span className="text-zinc-400 text-xs uppercase tracking-wider w-28 shrink-0">
                  {DOK_LABELS[d.typ] ?? d.typ}
                </span>
                <span className="text-zinc-200 text-sm truncate">{d.datei_name ?? d.datei_url.split('/').pop()}</span>
                <span className="text-zinc-600 text-xs ml-auto shrink-0">{fmt(d.created_at)}</span>
              </a>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function FileUploadButton({ loading, onFile }: { loading: boolean; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={loading}
        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-40 transition-colors">
        {loading ? '...' : <UploadIcon className="w-3.5 h-3.5" />}
      </button>
      <input ref={ref} type="file" accept="image/*,.pdf"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        className="hidden" />
    </>
  )
}

// ─── TAB: Dateien ────────────────────────────────────────────────────────────

function TabDateien({
  fall,
  dokumente,
  onRefresh,
}: {
  fall: Fall
  dokumente: Dokument[]
  onRefresh: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Group by kategorie
  const grouped = dokumente.reduce<Record<string, Dokument[]>>((acc, d) => {
    const kat = d.kategorie || kategorieVonTyp(d.typ)
    if (!acc[kat]) acc[kat] = []
    acc[kat].push(d)
    return acc
  }, {})

  async function handleUpload(file: File) {
    setUploading(true)
    const supabase = createClient()
    try {
      const ext = file.name.split('.').pop() ?? 'bin'
      const isImage = file.type.startsWith('image/')
      const kat = isImage ? 'schadensfoto' : 'sonstiges'
      const path = `admin/${fall.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('dokumente')
        .upload(path, file, { contentType: file.type })
      if (uploadErr) throw new Error(uploadErr.message)
      const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path)

      await supabase.from('dokumente').insert({
        fall_id: fall.id,
        typ: isImage ? 'schadensfoto' : 'sonstiges',
        datei_url: publicUrl,
        datei_name: file.name,
        datei_groesse: file.size,
        kategorie: kat,
        quelle: 'admin',
        hochgeladen_von_rolle: 'admin',
        sichtbar_fuer: sichtbarkeitVonKategorie(kat),
      })
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  const isImage = (d: Dokument) => {
    const name = (d.datei_name ?? d.datei_url).toLowerCase()
    return name.match(/\.(jpg|jpeg|png|webp|gif)$/) || d.kategorie === 'schadensfoto' || d.kategorie === 'whatsapp-foto' || d.kategorie === 'gutachter-foto'
  }

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Datei hochladen</h3>
        </div>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-6 cursor-pointer transition-colors">
          <UploadIcon className="w-6 h-6 text-zinc-500" />
          <span className="text-zinc-400 text-sm">{uploading ? 'Wird hochgeladen...' : 'Datei auswaehlen oder hierher ziehen'}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {/* Grouped by Kategorie */}
      {dokumente.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800 text-center">
          <FolderOpenIcon className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-zinc-600 text-sm">Noch keine Dateien vorhanden.</p>
        </div>
      ) : (
        KATEGORIE_ORDER.filter((k) => grouped[k]?.length).map((kat) => (
          <Section key={kat} title={`${KATEGORIE_LABELS[kat] ?? kat} (${grouped[kat].length})`}>
            <div className="space-y-1">
              {grouped[kat].map((d) => (
                <a
                  key={d.id}
                  href={d.datei_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-zinc-800/60 transition-colors group"
                >
                  {/* Thumbnail or Icon */}
                  {isImage(d) ? (
                    <img src={d.datei_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-zinc-700" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                      <FileTextIcon className="w-4 h-4 text-zinc-500" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 text-sm truncate">{d.datei_name ?? d.datei_url.split('/').pop()}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge color={KATEGORIE_COLORS[d.kategorie ?? 'sonstiges'] ?? 'zinc'}>
                        {DOK_LABELS[d.typ] ?? d.typ}
                      </Badge>
                      {d.hochgeladen_von_rolle && (
                        <span className="text-zinc-600 text-xs">von {d.hochgeladen_von_rolle}</span>
                      )}
                      {d.quelle && (
                        <span className="text-zinc-600 text-xs">· {QUELLE_LABELS[d.quelle] ?? d.quelle}</span>
                      )}
                      <span className="text-zinc-700 text-xs">· {fmt(d.created_at)}</span>
                    </div>
                    {d.sichtbar_fuer && d.sichtbar_fuer.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {d.sichtbar_fuer.map((r) => (
                          <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700/50">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Download */}
                  <DownloadIcon className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          </Section>
        ))
      )}
    </div>
  )
}

// ─── TAB 3: Timeline ──────────────────────────────────────────────────────────

function TabTimeline({
  fall,
  timeline,
  onRefresh,
}: {
  fall: Fall
  timeline: TimelineEntry[]
  onRefresh: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [newTyp, setNewTyp] = useState('notiz')
  const [newTitel, setNewTitel] = useState('')
  const [newBeschreibung, setNewBeschreibung] = useState('')
  const [newKanal, setNewKanal] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!newTitel.trim()) return
    setSaving(true)
    try {
      await addTimelineEntry(fall.id, {
        typ: newTyp,
        titel: newTitel.trim(),
        beschreibung: newBeschreibung.trim() || undefined,
        kanal: newKanal || undefined,
      })
      setNewTitel('')
      setNewBeschreibung('')
      setNewKanal('')
      setShowForm(false)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <button onClick={() => setShowForm(!showForm)}
          className="w-full flex items-center gap-2 px-5 py-3 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          <PlusIcon className="w-4 h-4" /> Eintrag hinzufuegen
        </button>
        {showForm && (
          <div className="px-5 pb-5 space-y-3 border-t border-zinc-800 pt-4">
            <div className="flex gap-2 flex-wrap">
              {['notiz', 'anruf', 'email', 'whatsapp', 'system'].map((t) => (
                <button key={t} onClick={() => setNewTyp(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    newTyp === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <input value={newTitel} onChange={(e) => setNewTitel(e.target.value)} placeholder="Titel"
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
            <textarea value={newBeschreibung} onChange={(e) => setNewBeschreibung(e.target.value)}
              placeholder="Beschreibung (optional)" rows={2}
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none" />
            <select value={newKanal} onChange={(e) => setNewKanal(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm focus:outline-none focus:border-zinc-500">
              <option value="">Kanal (optional)</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-Mail</option>
              <option value="anruf">Anruf</option>
            </select>
            <button onClick={handleAdd} disabled={saving || !newTitel.trim()}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40 transition-all">
              {saving ? 'Speichere ...' : 'Hinzufuegen'}
            </button>
          </div>
        )}
      </div>

      {timeline.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
          <p className="text-zinc-500">Noch keine Aktivitaeten vorhanden.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-800" />
          <div className="space-y-0">
            {timeline.map((entry) => {
              const style = TIMELINE_ICON[entry.typ] ?? TIMELINE_ICON.system
              const kanal = (entry.metadata as Record<string, string> | null)?.kanal
              const KanalIcon = kanal ? KANAL_ICON[kanal] : null
              return (
                <div key={entry.id} className="relative pl-11 pb-6 last:pb-0">
                  <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ring-2 ring-zinc-950 ${style.bg} ${style.color}`} />
                  <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium">{entry.titel}</p>
                        {entry.beschreibung && (
                          <p className="text-zinc-400 text-sm mt-1 whitespace-pre-wrap">{entry.beschreibung}</p>
                        )}
                      </div>
                      <span className="text-zinc-600 text-xs whitespace-nowrap shrink-0">{fmtDateTime(entry.created_at)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.color}`}>
                        {entry.typ}
                      </span>
                      {KanalIcon && (
                        <span className="flex items-center gap-1 text-xs text-zinc-500">
                          <KanalIcon className="w-3 h-3" /> {kanal}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB 4: Kommunikation ─────────────────────────────────────────────────────

function TabKommunikation({
  fall,
  lead,
  timeline,
}: {
  fall: Fall
  lead: Lead
  timeline: TimelineEntry[]
}) {
  const waMessages = timeline.filter(
    (t) => t.typ === 'whatsapp' || (t.metadata as Record<string, string> | null)?.kanal === 'whatsapp',
  )

  const telefon = lead?.telefon
  const kundenName = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : ''

  function openWhatsApp(text: string) {
    if (!telefon) return
    const nr = telefon.replace(/[^0-9+]/g, '').replace(/^0/, '49')
    const encoded = encodeURIComponent(
      text
        .replace('{name}', kundenName || 'Kunde')
        .replace('{flowlink}', `${window.location.origin}/flow/${fall.lead_id}`),
    )
    window.open(`https://wa.me/${nr}?text=${encoded}`, '_blank')
  }

  const template = WA_TEMPLATES[fall.status]

  return (
    <div className="space-y-4">
      <Section title="Nachricht senden">
        {telefon ? (
          <div className="space-y-3">
            {template && (
              <button onClick={() => openWhatsApp(template.text)}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border border-emerald-800/50 bg-emerald-500/5 hover:border-emerald-700/50 transition-all active:scale-[0.98]">
                <MessageSquareIcon className="w-5 h-5 text-emerald-400" />
                <div className="text-left">
                  <p className="text-sm text-emerald-300 font-medium">{template.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">WhatsApp-Vorlage fuer aktuelle Phase</p>
                </div>
                <SendIcon className="w-4 h-4 text-emerald-400 ml-auto" />
              </button>
            )}
            <p className="text-xs text-zinc-500 uppercase tracking-wider mt-4 mb-2">Alle Vorlagen</p>
            {Object.entries(WA_TEMPLATES).map(([key, tpl]) => (
              <button key={key} onClick={() => openWhatsApp(tpl.text)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors text-left">
                <MessageSquareIcon className="w-4 h-4 text-zinc-500" />
                <span className="text-sm text-zinc-300">{tpl.label}</span>
                <Badge color={key === fall.status ? 'emerald' : 'zinc'}>{key}</Badge>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-zinc-600 text-sm">Keine Telefonnummer vorhanden.</p>
        )}
      </Section>

      <Section title={`WhatsApp-Verlauf (${waMessages.length})`}>
        {waMessages.length === 0 ? (
          <p className="text-zinc-600 text-sm">Keine WhatsApp-Nachrichten protokolliert.</p>
        ) : (
          <div className="space-y-2">
            {waMessages.map((msg) => (
              <div key={msg.id} className="px-4 py-3 rounded-xl bg-zinc-800/30 border border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-zinc-200">{msg.titel}</p>
                  <span className="text-xs text-zinc-600 shrink-0">{fmtDateTime(msg.created_at)}</span>
                </div>
                {msg.beschreibung && <p className="text-xs text-zinc-400 mt-1">{msg.beschreibung}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── TAB: QC-Pruefung ────────────────────────────────────────────────────────

const QC_ITEMS: { key: string; label: string; desc: string }[] = [
  { key: 'gutachten_vorhanden', label: 'Gutachten vorhanden', desc: 'PDF-Gutachten wurde hochgeladen' },
  { key: 'gutachten_vollstaendig', label: 'Gutachten vollstaendig', desc: 'Alle Positionen und Werte enthalten' },
  { key: 'fin_17_zeichen', label: 'FIN korrekt (17 Zeichen)', desc: 'Fahrzeug-Identifizierungsnummer geprueft' },
  { key: 'schadenspositionen_erfasst', label: 'Schadenspositionen erfasst', desc: 'Alle Schadenspositionen im Gutachten vorhanden' },
  { key: 'fotos_ausreichend', label: 'Fotos ausreichend', desc: 'Mindestens 4 Perspektiven vorhanden' },
  { key: 'sa_vorhanden', label: 'Schadensanzeige vorhanden', desc: 'Unterschriebene SA liegt vor' },
  { key: 'vollmacht_vorhanden', label: 'Vollmacht vorhanden', desc: 'Unterschriebene Vollmacht liegt vor' },
  { key: 'kundendaten_vollstaendig', label: 'Kundendaten vollstaendig', desc: 'Name, Adresse, Kontaktdaten geprueft' },
]

function TabQcPruefung({
  fall,
  qcCheckliste,
  dokumente,
  pflichtdokumente,
  onRefresh,
}: {
  fall: Fall
  qcCheckliste: QcCheckliste
  dokumente: Dokument[]
  pflichtdokumente: Pflichtdokument[]
  onRefresh: () => void
}) {
  const hasGutachten = dokumente.some((d) => d.kategorie === 'gutachten' || d.typ === 'gutachten')
  const hasSA = pflichtdokumente.some((d) => d.dokument_typ === 'schadensanzeige' && d.status === 'hochgeladen')
    || dokumente.some((d) => d.typ === 'unterschrift' || d.kategorie === 'unterschrift')
  const hasVollmacht = pflichtdokumente.some((d) => d.dokument_typ === 'vollmacht' && d.status === 'hochgeladen')
    || (fall.vollmacht_signiert_am != null)
  const hasFin = !!(fall as Record<string, unknown>).fin_vin
    && String((fall as Record<string, unknown>).fin_vin).length === 17
  const fotoCount = dokumente.filter((d) => d.kategorie === 'schadensfoto' || d.kategorie === 'gutachter-foto').length
    + pflichtdokumente.filter((d) => d.dokument_typ === 'schadensfotos' && d.status === 'hochgeladen').length
  const hasEnoughPhotos = fotoCount >= 4
  const hasKundendaten = !!(fall as Record<string, unknown>).schadens_adresse
    && !!(fall as Record<string, unknown>).schadens_plz

  const autoDefaults: Record<string, boolean> = {
    gutachten_vorhanden: hasGutachten,
    fin_17_zeichen: hasFin,
    fotos_ausreichend: hasEnoughPhotos,
    sa_vorhanden: hasSA,
    vollmacht_vorhanden: hasVollmacht,
    kundendaten_vollstaendig: hasKundendaten,
  }

  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const item of QC_ITEMS) {
      initial[item.key] = qcCheckliste
        ? !!(qcCheckliste as Record<string, unknown>)[item.key]
        : (autoDefaults[item.key] ?? false)
    }
    return initial
  })

  const showVorschaeden = (fall as Record<string, unknown>).vorschaden_vorhanden === true
  const [vorschaedenOk, setVorschaedenOk] = useState<boolean>(
    qcCheckliste?.vorschaeden_beruecksichtigt ?? false,
  )
  const [kommentar, setKommentar] = useState(qcCheckliste?.kommentar ?? '')
  const [saving, setSaving] = useState(false)
  const isDone = qcCheckliste?.status === 'bestanden' || qcCheckliste?.status === 'nachbesserung'

  const allChecked = Object.values(checks).every(Boolean) && (!showVorschaeden || vorschaedenOk)
  const checkedCount = Object.values(checks).filter(Boolean).length + (showVorschaeden && vorschaedenOk ? 1 : 0)
  const totalCount = QC_ITEMS.length + (showVorschaeden ? 1 : 0)

  function toggleCheck(key: string) {
    if (isDone) return
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: Record<string, boolean | null> = { ...checks }
      if (showVorschaeden) payload.vorschaeden_beruecksichtigt = vorschaedenOk
      await upsertQcCheckliste(fall.id, payload)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleBestanden() {
    setSaving(true)
    try {
      await qcBestanden(fall.id, kommentar)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleNachbesserung() {
    if (!kommentar.trim()) {
      alert('Bitte Kommentar eingeben, was nachgebessert werden muss.')
      return
    }
    setSaving(true)
    try {
      await qcNachbesserung(fall.id, kommentar)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {isDone && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
          qcCheckliste?.status === 'bestanden'
            ? 'bg-green-500/5 border-green-800/50'
            : 'bg-orange-500/5 border-orange-800/50'
        }`}>
          {qcCheckliste?.status === 'bestanden'
            ? <ShieldCheckIcon className="w-5 h-5 text-green-400" />
            : <ShieldAlertIcon className="w-5 h-5 text-orange-400" />}
          <div>
            <p className={`font-medium text-sm ${
              qcCheckliste?.status === 'bestanden' ? 'text-green-300' : 'text-orange-300'
            }`}>
              {qcCheckliste?.status === 'bestanden' ? 'QC bestanden' : 'Nachbesserung angefordert'}
              {qcCheckliste?.geprueft_am && (
                <span className="text-zinc-500 ml-2 font-normal">
                  {new Date(qcCheckliste.geprueft_am).toLocaleDateString('de-DE')}
                </span>
              )}
            </p>
            {qcCheckliste?.kommentar && (
              <p className="text-zinc-400 text-xs mt-0.5">{qcCheckliste.kommentar}</p>
            )}
          </div>
        </div>
      )}

      <Section title={`Checkliste (${checkedCount}/${totalCount})`}>
        <div className="mb-4">
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allChecked ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${(checkedCount / totalCount) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {QC_ITEMS.map((item) => (
            <label
              key={item.key}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                checks[item.key]
                  ? 'bg-green-500/5 border-green-800/30'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              } ${isDone ? 'pointer-events-none opacity-75' : ''}`}
            >
              <input
                type="checkbox"
                checked={checks[item.key]}
                onChange={() => toggleCheck(item.key)}
                disabled={isDone}
                className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-green-500 focus:ring-0 focus:ring-offset-0 accent-green-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${checks[item.key] ? 'text-green-300' : 'text-zinc-300'}`}>
                    {item.label}
                  </span>
                  {autoDefaults[item.key] !== undefined && autoDefaults[item.key] && (
                    <span className="text-[10px] uppercase tracking-wider text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">auto</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
              </div>
              {checks[item.key]
                ? <CheckIcon className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                : <XIcon className="w-4 h-4 text-zinc-700 mt-0.5 shrink-0" />}
            </label>
          ))}

          {showVorschaeden && (
            <label
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                vorschaedenOk
                  ? 'bg-green-500/5 border-green-800/30'
                  : 'bg-amber-500/5 border-amber-800/30'
              } ${isDone ? 'pointer-events-none opacity-75' : ''}`}
            >
              <input
                type="checkbox"
                checked={vorschaedenOk}
                onChange={() => !isDone && setVorschaedenOk(!vorschaedenOk)}
                disabled={isDone}
                className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-green-500 focus:ring-0 focus:ring-offset-0 accent-green-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${vorschaedenOk ? 'text-green-300' : 'text-amber-300'}`}>
                    Vorschaeden beruecksichtigt
                  </span>
                  <Badge color="orange">Vorschaden</Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Gutachten beruecksichtigt die {String((fall as Record<string, unknown>).vorschaden_anzahl ?? '')} bekannten Vorschaeden
                </p>
              </div>
              {vorschaedenOk
                ? <CheckIcon className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                : <AlertTriangleIcon className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />}
            </label>
          )}
        </div>
      </Section>

      <Section title="Kommentar">
        <textarea
          value={kommentar}
          onChange={(e) => setKommentar(e.target.value)}
          disabled={isDone}
          placeholder="Anmerkungen zur QC-Pruefung..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none disabled:opacity-60"
        />
      </Section>

      {!isDone && (
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium disabled:opacity-40 transition-all"
          >
            {saving ? 'Speichern ...' : 'Zwischenspeichern'}
          </button>
          <button
            onClick={handleNachbesserung}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold disabled:opacity-40 transition-all"
          >
            Nachbesserung
          </button>
          <button
            onClick={handleBestanden}
            disabled={saving || !allChecked}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-40 transition-all"
          >
            QC Bestanden
          </button>
        </div>
      )}
    </div>
  )
}

const ESKALATIONSSTUFEN_DETAIL = [
  { key: 'vs-01', tage: 0,  label: 'Anspruchsschreiben gesendet (14-Tage-Frist)', borderActive: 'border-green-800',  bgActive: 'bg-green-500/5',  textActive: 'text-green-400' },
  { key: 'vs-02', tage: 7,  label: 'Schadensabfrage eingegangen',                 borderActive: 'border-yellow-800', bgActive: 'bg-yellow-500/5', textActive: 'text-yellow-400' },
  { key: 'vs-03', tage: 14, label: 'Frist abgelaufen - Nachfrage',                borderActive: 'border-yellow-800', bgActive: 'bg-yellow-500/5', textActive: 'text-yellow-400' },
  { key: 'vs-04', tage: 21, label: 'Regulierung angekuendigt',                    borderActive: 'border-orange-800', bgActive: 'bg-orange-500/5', textActive: 'text-orange-400' },
  { key: 'vs-05', tage: 28, label: '1. Mahnung + Verzugszinsen',                  borderActive: 'border-orange-800', bgActive: 'bg-orange-500/5', textActive: 'text-orange-400' },
  { key: 'vs-06', tage: 42, label: '2. Mahnung + Klageankuendigung',              borderActive: 'border-red-800',    bgActive: 'bg-red-500/5',    textActive: 'text-red-400' },
  { key: 'vs-07', tage: 60, label: 'Klage-Entscheidung',                          borderActive: 'border-red-800',    bgActive: 'bg-red-500/5',    textActive: 'text-red-400' },
]

// ─── TAB 5: Kanzlei ──────────────────────────────────────────────────────────

function TabKanzlei({
  fall,
  onRefresh,
}: {
  fall: Fall
  onRefresh: () => void
}) {
  const [betrag, setBetrag] = useState('')
  const [saving, setSaving] = useState(false)

  const asDate = fall.anschlussschreiben_am
  const vsTage = asDate ? daysBetween(asDate, new Date()) : null
  const vsFristAbgelaufen = vsTage !== null && vsTage > 14

  const ESKALATIONSSTUFEN = ['VS-03', 'VS-04', 'VS-05', 'VS-06', 'VS-07']

  async function handleAS() {
    setSaving(true)
    try {
      await setAnschlussschreibenDatum(fall.id)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleZahlung() {
    const val = parseFloat(betrag.replace(',', '.'))
    if (isNaN(val) || val <= 0) return
    setSaving(true)
    try {
      await recordZahlung(fall.id, val)
      setBetrag('')
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleEskalation(stufe: string) {
    setSaving(true)
    try {
      await eskalation(fall.id, stufe)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  const [kName, setKName] = useState(fall.kanzlei_ansprechpartner_name ?? '')
  const [kEmail, setKEmail] = useState(fall.kanzlei_ansprechpartner_email ?? '')
  const [kTelefon, setKTelefon] = useState(fall.kanzlei_ansprechpartner_telefon ?? '')
  const [kPosition, setKPosition] = useState(fall.kanzlei_ansprechpartner_position ?? '')
  const [kSaving, setKSaving] = useState(false)

  async function handleSaveKanzlei() {
    setKSaving(true)
    try {
      await saveKanzleiAnsprechpartner(fall.id, { name: kName, email: kEmail, telefon: kTelefon, position: kPosition })
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setKSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Kanzlei-Ansprechpartner Formular */}
      <Section title="Kanzlei-Ansprechpartner">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Name</label>
            <input value={kName} onChange={e => setKName(e.target.value)} placeholder="z.B. RA Dr. Müller" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Position</label>
            <input value={kPosition} onChange={e => setKPosition(e.target.value)} placeholder="z.B. Rechtsanwalt" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">E-Mail</label>
            <input value={kEmail} onChange={e => setKEmail(e.target.value)} type="email" placeholder="anwalt@kanzlei.de" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Telefon</label>
            <input value={kTelefon} onChange={e => setKTelefon(e.target.value)} type="tel" placeholder="+49 221 12345" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
        </div>
        <button onClick={handleSaveKanzlei} disabled={kSaving} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40">
          {kSaving ? 'Speichert...' : 'Speichern'}
        </button>
      </Section>

      {/* Mandatsnummer prominent */}
      {fall.mandatsnummer && (
        <div className="bg-gradient-to-r from-cyan-950/50 to-blue-950/50 border border-cyan-800/40 rounded-2xl p-5">
          <p className="text-xs text-cyan-400 font-medium mb-1">Mandatsnummer</p>
          <p className="text-2xl font-bold text-white font-mono tracking-wide">{fall.mandatsnummer}</p>
        </div>
      )}

      <Section title="Kanzlei-Status">
        <InfoRow label="Uebergeben am" value={fmt(fall.kanzlei_uebergeben_am)} />
        {fall.mandatsnummer && <InfoRow label="Mandatsnummer" value={<span className="font-mono text-cyan-400">{fall.mandatsnummer}</span>} />}
        <InfoRow label="Filmcheck" value={
          fall.filmcheck_ok
            ? <span className="text-green-400">Bestanden ({fmt(fall.filmcheck_am)})</span>
            : <span className="text-zinc-600">Ausstehend</span>
        } />
        <InfoRow label="Versicherung" value={fall.versicherung_name} />
        <InfoRow label="Schadennummer" value={fall.versicherung_schaden_nr} />
        {/* Kanzlei-Paket PDF Download */}
        <div className="mt-3">
          <a
            href={`/api/pdf/kanzlei-paket/${fall.id}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm text-white transition-colors"
          >
            Kanzlei-Paket PDF herunterladen
          </a>
        </div>
      </Section>

      <Section title="Anschlussschreiben (AS)">
        {asDate ? (
          <div>
            <InfoRow label="AS gesendet am" value={fmt(asDate)} />
            <div className="mt-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">VS-Timer</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      vsFristAbgelaufen ? 'bg-red-500' :
                      (vsTage ?? 0) > 10 ? 'bg-orange-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(((vsTage ?? 0) / 14) * 100, 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-semibold tabular-nums ${
                  vsFristAbgelaufen ? 'text-red-400' :
                  (vsTage ?? 0) > 10 ? 'text-orange-400' :
                  'text-blue-400'
                }`}>
                  Tag {vsTage} / 14
                </span>
              </div>
              {vsFristAbgelaufen && (
                <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-800/50">
                  <AlertTriangleIcon className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400">Frist abgelaufen! Eskalation erforderlich.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-zinc-600 text-sm">Noch kein Anschlussschreiben gesendet.</p>
            {fall.filmcheck_ok && (
              <button onClick={handleAS} disabled={saving}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold disabled:opacity-40 transition-all">
                {saving ? 'Wird gespeichert ...' : 'AS als gesendet markieren (startet VS-Timer)'}
              </button>
            )}
          </div>
        )}
      </Section>

      {asDate && (
        <Section title="Eskalationsstufe">
          <div className="space-y-2">
            {ESKALATIONSSTUFEN_DETAIL.map((stufe) => {
              const isActive = fall.vs_eskalationsstufe === stufe.key
              const isPast = ESKALATIONSSTUFEN_DETAIL.findIndex(s => s.key === fall.vs_eskalationsstufe) >= ESKALATIONSSTUFEN_DETAIL.findIndex(s => s.key === stufe.key)
              return (
                <div key={stufe.key}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors ${
                    isActive
                      ? `${stufe.borderActive} ${stufe.bgActive}`
                      : isPast
                      ? 'border-zinc-700 bg-zinc-800/30'
                      : 'border-zinc-800/50 bg-transparent'
                  }`}
                >
                  <span className={`text-xs font-bold w-12 ${isActive ? stufe.textActive : isPast ? 'text-zinc-500' : 'text-zinc-700'}`}>
                    {stufe.key.toUpperCase()}
                  </span>
                  <span className={`text-sm flex-1 ${isActive ? 'text-zinc-200' : isPast ? 'text-zinc-500' : 'text-zinc-700'}`}>
                    {stufe.label}
                  </span>
                  <span className={`text-xs ${isActive ? 'text-zinc-400' : 'text-zinc-700'}`}>Tag {stufe.tage}</span>
                  {isActive && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
                </div>
              )
            })}
          </div>
          {vsFristAbgelaufen && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ESKALATIONSSTUFEN.map((stufe) => (
                <button key={stufe} onClick={() => handleEskalation(stufe)} disabled={saving}
                  className="px-4 py-3 rounded-xl border border-red-800/50 bg-red-500/5 text-red-400 text-sm font-medium hover:bg-red-500/10 disabled:opacity-40 transition-all active:scale-[0.98]">
                  {stufe} manuell setzen
                </button>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section title="Zahlungseingang">
        {fall.regulierung_am ? (
          <div>
            <InfoRow label="Regulierungsbetrag" value={fmtCurrency(fall.regulierung_betrag)} />
            <InfoRow label="Reguliert am" value={fmt(fall.regulierung_am)} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <BanknoteIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input type="text" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)}
                  placeholder="Betrag in EUR"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
              </div>
              <button onClick={handleZahlung} disabled={saving || !betrag.trim()}
                className="px-5 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-40 transition-all">
                {saving ? '...' : 'Eintragen'}
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── TAB 6: Chat ─────────────────────────────────────────────────────────────

const CHAT_CHANNELS: { key: string; label: string; readonly: boolean }[] = [
  { key: 'whatsapp', label: 'WhatsApp', readonly: true },
  { key: 'portal-kunde-claimondo', label: 'Kunde\u2194Claimondo', readonly: false },
  { key: 'portal-kunde-gutachter', label: 'Kunde\u2194Gutachter', readonly: true },
]

function TabChat({
  fall,
  nachrichten,
  onRefresh,
}: {
  fall: Fall
  nachrichten: Nachricht[]
  onRefresh: () => void
}) {
  const [activeChannel, setActiveChannel] = useState('portal-kunde-claimondo')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const channelMessages = nachrichten.filter((n) => n.kanal === activeChannel)
  const channel = CHAT_CHANNELS.find((c) => c.key === activeChannel)!

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await sendChatNachricht(fall.id, activeChannel, trimmed)
      setText('')
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function fmtChatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  function fmtChatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function rolleLabel(rolle: string | null) {
    if (!rolle) return 'Unbekannt'
    const labels: Record<string, string> = {
      admin: 'Admin',
      kunde: 'Kunde',
      gutachter: 'Gutachter',
      kanzlei: 'Kanzlei',
      sv: 'Sachverstaendiger',
    }
    return labels[rolle] ?? rolle
  }

  function rolleColor(rolle: string | null) {
    const colors: Record<string, string> = {
      admin: 'bg-blue-500/10 text-blue-400 border-blue-800/30',
      kunde: 'bg-emerald-500/10 text-emerald-400 border-emerald-800/30',
      gutachter: 'bg-purple-500/10 text-purple-400 border-purple-800/30',
      kanzlei: 'bg-orange-500/10 text-orange-400 border-orange-800/30',
      sv: 'bg-purple-500/10 text-purple-400 border-purple-800/30',
    }
    return colors[rolle ?? ''] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'
  }

  // Track last rendered date for date separators
  let lastDate = ''

  return (
    <div className="space-y-4">
      {/* Channel Sub-Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
        {CHAT_CHANNELS.map((ch) => {
          const count = nachrichten.filter((n) => n.kanal === ch.key).length
          return (
            <button
              key={ch.key}
              onClick={() => setActiveChannel(ch.key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeChannel === ch.key
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {ch.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs text-zinc-500">({count})</span>
              )}
            </button>
          )
        })}
      </div>

      {/* WhatsApp placeholder note */}
      {activeChannel === 'whatsapp' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-800/50">
          <MessageSquareIcon className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-400">WhatsApp-Integration als Platzhalter</span>
        </div>
      )}

      {/* Chat Messages Area */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 flex flex-col" style={{ height: '500px' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {channelMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-zinc-600 text-sm">Keine Nachrichten in diesem Kanal.</p>
            </div>
          ) : (
            <>
              {channelMessages.map((msg) => {
                const isOwnSide = msg.sender_rolle === 'admin' || msg.sender_rolle === 'kanzlei'
                const msgDate = fmtChatDate(msg.created_at)
                let showDateSep = false
                if (msgDate !== lastDate) {
                  showDateSep = true
                  lastDate = msgDate
                }

                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 my-3">
                        <div className="flex-1 h-px bg-zinc-800" />
                        <span className="text-xs text-zinc-600 shrink-0">{msgDate}</span>
                        <div className="flex-1 h-px bg-zinc-800" />
                      </div>
                    )}
                    <div className={`flex ${isOwnSide ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] ${isOwnSide ? 'items-end' : 'items-start'}`}>
                        {/* Sender badge + time */}
                        <div className={`flex items-center gap-2 mb-1 ${isOwnSide ? 'justify-end' : 'justify-start'}`}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${rolleColor(msg.sender_rolle)}`}>
                            {rolleLabel(msg.sender_rolle)}
                          </span>
                          <span className="text-[10px] text-zinc-600">{fmtChatTime(msg.created_at)}</span>
                        </div>
                        {/* Bubble */}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isOwnSide
                            ? 'bg-blue-600/20 text-blue-100 border border-blue-800/30 rounded-tr-md'
                            : 'bg-zinc-800/60 text-zinc-200 border border-zinc-700/50 rounded-tl-md'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{msg.nachricht}</p>
                          {msg.hat_anhang && msg.anhang_url && (
                            <a
                              href={msg.anhang_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              <FileTextIcon className="w-3.5 h-3.5" />
                              Anhang oeffnen
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        {!channel.readonly ? (
          <div className="p-3 border-t border-zinc-800">
            <div className="flex gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nachricht schreiben..."
                rows={1}
                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-all shrink-0"
              >
                <SendIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-600 text-center">Dieser Kanal ist nur lesbar.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TAB 9: Abrechnung ──────────────────────────────────────────────────────

function TabAbrechnung({ fall }: { fall: Fall }) {
  const gutachtenBetrag = fall.gutachten_betrag ?? 0
  const schadenNetto = (fall as Record<string, unknown>).schadenhoehe_netto as number ?? 0
  const regulierungBetrag = fall.regulierung_betrag ?? 0

  // Typische Kalkulation
  const nutzungsausfall = 0 // Could be from gutachten data
  const gutachterkosten = Math.round(gutachtenBetrag * 0.12) // ~12% of damage
  const anwaltskosten = Math.round(gutachtenBetrag * 0.08) // ~8% estimate
  const gesamtforderung = gutachtenBetrag + nutzungsausfall + gutachterkosten + anwaltskosten

  return (
    <div className="space-y-6">
      {/* Forderungsaufstellung */}
      <Section title="Forderungsaufstellung">
        <div className="space-y-2">
          <AbrechnungRow label="Reparaturkosten (netto)" value={gutachtenBetrag} />
          <AbrechnungRow label="Schadenhöhe (netto, Gutachten)" value={schadenNetto} />
          <AbrechnungRow label="Nutzungsausfall" value={nutzungsausfall} />
          <AbrechnungRow label="Gutachterkosten" value={gutachterkosten} />
          <AbrechnungRow label="Anwaltskosten (RVG)" value={anwaltskosten} />
          <div className="border-t border-zinc-700 pt-2 mt-3">
            <AbrechnungRow label="Gesamtforderung" value={gesamtforderung} bold />
          </div>
        </div>
      </Section>

      {/* Zahlungseingang */}
      <Section title="Zahlungseingang">
        <div className="space-y-2">
          <AbrechnungRow label="Regulierungsbetrag VS" value={regulierungBetrag} />
          <AbrechnungRow label="Differenz" value={gesamtforderung - regulierungBetrag} />
        </div>
        {regulierungBetrag > 0 && regulierungBetrag < gesamtforderung && (
          <div className="mt-3 bg-amber-950/40 border border-amber-800/40 rounded-xl p-3">
            <p className="text-amber-400 text-xs font-medium">Kürzung erkannt — ggf. Restwertgutachten / Nachforderung prüfen</p>
          </div>
        )}
        {regulierungBetrag >= gesamtforderung && regulierungBetrag > 0 && (
          <div className="mt-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3">
            <p className="text-emerald-400 text-xs font-medium">Vollständig reguliert</p>
          </div>
        )}
      </Section>

      {/* Abrechnung Factoring */}
      <Section title="Abrechnung / Factoring">
        <div className="space-y-2 text-sm text-zinc-400">
          <div className="flex justify-between">
            <span>DSR24 Factoring</span>
            <span className="text-zinc-300">{regulierungBetrag > 0 ? 'Aktiv' : 'Ausstehend'}</span>
          </div>
          <div className="flex justify-between">
            <span>RVG-Gebühren (Kanzlei)</span>
            <span className="text-zinc-300">{fmtEur(anwaltskosten)}</span>
          </div>
          <div className="flex justify-between">
            <span>Restbetrag an Kunden</span>
            <span className="text-zinc-300 font-medium">
              {fmtEur(Math.max(0, regulierungBetrag - gutachterkosten - anwaltskosten))}
            </span>
          </div>
        </div>
      </Section>
    </div>
  )
}

function AbrechnungRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'text-white font-semibold' : 'text-zinc-400'}`}>
      <span>{label}</span>
      <span className={bold ? 'text-white' : 'text-zinc-300'}>{fmtEur(value)}</span>
    </div>
  )
}

function fmtEur(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}

// ─── TAB 10: Tasks ──────────────────────────────────────────────────────────

function TabTasks({
  fall,
  tasks,
  onRefresh,
}: {
  fall: Fall
  tasks: TaskItem[]
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [deadline, setDeadline] = useState('')
  const [prio, setPrio] = useState('normal')
  const [saving, setSaving] = useState(false)

  const offene = tasks.filter(t => t.status !== 'erledigt')
  const erledigte = tasks.filter(t => t.status === 'erledigt')

  async function handleCreate() {
    if (!titel.trim()) return
    setSaving(true)
    try {
      await createFallTask(fall.id, {
        titel: titel.trim(),
        beschreibung: beschreibung.trim() || null,
        faellig_am: deadline ? new Date(deadline).toISOString() : null,
        prioritaet: prio,
      })
      setTitel('')
      setBeschreibung('')
      setDeadline('')
      setPrio('normal')
      setAdding(false)
      onRefresh()
    } catch { /* */ }
    setSaving(false)
  }

  async function handleToggle(taskId: string, newStatus: string) {
    try {
      await updateTaskStatus(taskId, newStatus)
      onRefresh()
    } catch { /* */ }
  }

  return (
    <div className="space-y-6">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">
          {offene.length} offen · {erledigte.length} erledigt
        </h3>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          + Task erstellen
        </button>
      </div>

      {/* Create form */}
      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <input
            type="text"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            placeholder="Task-Titel..."
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <textarea
            value={beschreibung}
            onChange={e => setBeschreibung(e.target.value)}
            placeholder="Beschreibung (optional)"
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-3">
            <input
              type="datetime-local"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={prio}
              onChange={e => setPrio(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="normal">Normal</option>
              <option value="dringend">Dringend</option>
              <option value="kritisch">Kritisch</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !titel.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-xl transition-colors"
            >
              {saving ? 'Erstellt...' : 'Erstellen'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-zinc-500 hover:text-zinc-300 text-sm px-3 py-2 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Offene Tasks */}
      {offene.length > 0 && (
        <div className="space-y-2">
          {offene.map(task => (
            <TaskCard key={task.id} task={task} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {offene.length === 0 && !adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-zinc-500 text-sm">Keine offenen Tasks.</p>
        </div>
      )}

      {/* Erledigte Tasks */}
      {erledigte.length > 0 && (
        <details className="group">
          <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors">
            {erledigte.length} erledigte Tasks anzeigen
          </summary>
          <div className="space-y-2 mt-2 opacity-60">
            {erledigte.map(task => (
              <TaskCard key={task.id} task={task} onToggle={handleToggle} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function TaskCard({
  task,
  onToggle,
}: {
  task: TaskItem
  onToggle: (id: string, status: string) => void
}) {
  const isErledigt = task.status === 'erledigt'
  const isOverdue = !isErledigt && task.faellig_am && new Date(task.faellig_am) < new Date()

  return (
    <div className={`flex items-start gap-3 bg-zinc-900 border rounded-xl p-3 ${
      isOverdue ? 'border-red-800/50' : 'border-zinc-800'
    }`}>
      <button
        onClick={() => onToggle(task.id, isErledigt ? 'offen' : 'erledigt')}
        className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isErledigt
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'border-zinc-600 hover:border-blue-500'
        }`}
      >
        {isErledigt && <span className="text-[10px]">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isErledigt ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
          {task.titel}
        </p>
        {task.beschreibung && (
          <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1">{task.beschreibung}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[10px]">
          {task.prioritaet === 'kritisch' && (
            <span className="bg-red-950 text-red-400 px-1.5 py-0.5 rounded font-semibold">KRITISCH</span>
          )}
          {task.prioritaet === 'dringend' && (
            <span className="bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded font-semibold">DRINGEND</span>
          )}
          {task.faellig_am && (
            <span className={`${isOverdue ? 'text-red-400' : 'text-zinc-600'}`}>
              Fällig: {new Date(task.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {task.auto_erstellt && (
            <span className="text-zinc-700">Auto</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Termine Karte (KFZ-41) ──────────────────────────────────────────────────

function TermineKarte({ termine, fallId, onOpenModal, onRefresh }: { termine: Termin[]; fallId: string; onOpenModal: () => void; onRefresh: () => void }) {
  const [closingId, setClosingId] = useState<string | null>(null)
  const [closeNotiz, setCloseNotiz] = useState('')

  const now = new Date()
  const upcoming = termine.filter(t => t.status === 'geplant' || t.status === 'bestaetigt')
  const past = termine.filter(t => t.status === 'durchgefuehrt' || t.status === 'abgesagt' || t.status === 'nicht-erschienen')
  const nextTermin = upcoming.length > 0 ? upcoming.reduce((a, b) => new Date(a.datum) < new Date(b.datum) ? a : b) : null

  async function closeTermin(id: string, status: string) {
    await updateTerminStatus(id, status, closeNotiz || undefined)
    setClosingId(null)
    setCloseNotiz('')
    onRefresh()
  }

  return (
    <Section title="Kundentermine">
      <div className="space-y-3">
        {/* Button: Termin vereinbaren */}
        <button onClick={onOpenModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
          <ClockIcon className="w-4 h-4" /> Termin vereinbaren
        </button>

        {/* Nächster Termin */}
        {nextTermin && (() => {
          const d = new Date(nextTermin.datum)
          const isToday = d.toDateString() === now.toDateString()
          const isOverdue = d < now && !isToday
          return (
            <div className={`rounded-xl p-4 border ${isToday ? 'border-green-600 bg-green-950/30' : isOverdue ? 'border-red-600 bg-red-950/30' : 'border-blue-600/40 bg-blue-950/20'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {nextTermin.typ === 'video-call' ? (
                      <span className="text-purple-400 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/20">Video-Call</span>
                    ) : (
                      <span className="text-blue-400 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/20">Telefonat</span>
                    )}
                    {isToday && <span className="bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">HEUTE</span>}
                    {isOverdue && <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">UEBERFAELLIG</span>}
                  </div>
                  <p className="text-white font-semibold text-lg">
                    {d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}{' '}
                    {d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {nextTermin.betreff && <p className="text-zinc-400 text-sm mt-0.5">{nextTermin.betreff}</p>}
                  <p className="text-zinc-600 text-xs mt-1">{nextTermin.dauer_minuten} Min</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {nextTermin.meet_link && (
                    <a href={nextTermin.meet_link} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg font-medium text-center">
                      Meet beitreten
                    </a>
                  )}
                  {closingId === nextTermin.id ? (
                    <div className="space-y-1.5">
                      <input value={closeNotiz} onChange={e => setCloseNotiz(e.target.value)} placeholder="Notiz..."
                        className="w-32 bg-zinc-800 border border-zinc-700 text-xs text-white rounded px-2 py-1" />
                      <div className="flex gap-1">
                        <button onClick={() => closeTermin(nextTermin.id, 'durchgefuehrt')} className="flex-1 text-[10px] bg-emerald-600 text-white px-2 py-1 rounded">Erledigt</button>
                        <button onClick={() => closeTermin(nextTermin.id, 'nicht-erschienen')} className="flex-1 text-[10px] bg-red-600 text-white px-2 py-1 rounded">N/E</button>
                      </div>
                      <button onClick={() => setClosingId(null)} className="text-[10px] text-zinc-500 w-full text-center">Abbrechen</button>
                    </div>
                  ) : (
                    <button onClick={() => setClosingId(nextTermin.id)} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg font-medium">
                      Abschliessen
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Vergangene Termine */}
        {past.length > 0 && (
          <div className="space-y-1">
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Vergangene Termine</p>
            {past.slice(0, 5).map(t => {
              const d = new Date(t.datum)
              return (
                <div key={t.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-zinc-900/50">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'durchgefuehrt' ? 'bg-emerald-500' : t.status === 'nicht-erschienen' ? 'bg-red-500' : 'bg-zinc-600'}`} />
                  <span className="text-zinc-400 text-xs tabular-nums shrink-0">{d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
                  <span className="text-zinc-300 text-xs truncate flex-1">{t.betreff ?? (t.typ === 'video-call' ? 'Video-Call' : 'Telefonat')}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.status === 'durchgefuehrt' ? 'bg-emerald-500/20 text-emerald-400' : t.status === 'nicht-erschienen' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {t.status === 'durchgefuehrt' ? 'Erledigt' : t.status === 'nicht-erschienen' ? 'Nicht ersch.' : t.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Section>
  )
}

// ─── Termin-Modal (KFZ-41) ───────────────────────────────────────────────────

function TerminModal({ fallId, onClose, onRefresh }: { fallId: string; onClose: () => void; onRefresh: () => void }) {
  const [typ, setTyp] = useState('telefonat')
  const [datum, setDatum] = useState('')
  const [dauer, setDauer] = useState(30)
  const [betreff, setBetreff] = useState('')
  const [notiz, setNotiz] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!datum || !betreff) return
    setSaving(true)
    try {
      await createTermin(fallId, { typ, datum, dauer_minuten: dauer, betreff, notiz: notiz || undefined })
      onRefresh()
      onClose()
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">Termin vereinbaren</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><XIcon className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          {/* Typ */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1">Typ</label>
            <div className="flex gap-2">
              <button onClick={() => setTyp('telefonat')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${typ === 'telefonat' ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                Telefonat
              </button>
              <button onClick={() => setTyp('video-call')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${typ === 'video-call' ? 'bg-purple-600/20 border-purple-600 text-purple-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                Video-Call
              </button>
            </div>
          </div>

          {/* Datum + Uhrzeit */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1">Datum & Uhrzeit</label>
            <input type="datetime-local" value={datum} onChange={e => setDatum(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {/* Dauer */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1">Dauer</label>
            <div className="flex gap-2">
              {[15, 30, 60].map(d => (
                <button key={d} onClick={() => setDauer(d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${dauer === d ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                  {d} Min
                </button>
              ))}
            </div>
          </div>

          {/* Betreff */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1">Betreff</label>
            <input type="text" value={betreff} onChange={e => setBetreff(e.target.value)} placeholder="z.B. Rueckfragen zum Gutachten"
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-600" />
          </div>

          {/* Notiz */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1">Notiz (optional)</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} placeholder="Interne Notiz..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-600 resize-y" />
          </div>

          {typ === 'video-call' && (
            <p className="text-purple-400 text-xs bg-purple-500/10 rounded-lg px-3 py-2">
              Ein Google Meet Link wird automatisch generiert.
            </p>
          )}

          <button onClick={handleSave} disabled={saving || !datum || !betreff}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
            {saving ? 'Speichert...' : 'Termin erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
