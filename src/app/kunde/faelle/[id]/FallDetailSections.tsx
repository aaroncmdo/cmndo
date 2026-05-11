'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarIcon, SendIcon } from 'lucide-react'
import { terminAnnehmen, terminGegenvorschlag } from '@/lib/actions/termin-actions'
import { waehleGegenvorschlagSlot } from './actions'
import Link from 'next/link'
// AAR-727 Kandidat 1: Shared Download-Liste — Kunde zeigt flat list.
import DokumenteDownloadListe, { type DokumentItem } from '@/components/shared/DokumenteDownloadListe'
// AAR-746 (Phase B): Shared Identity-Header — löst die "Aktueller Status"-
// Section ab. KB + Termin bleiben in einer separaten Detail-Section.
import { FallIdentityHeader } from '@/components/shared/fall-header'
// AAR-754 (Phase C): Shared Stammdaten + Kontakte.
import { StammdatenReadSection } from '@/components/shared/stammdaten'
import { FallKontakteCard } from '@/components/shared/fall-kontakte'
import { Modal } from '@/components/primitives/Modal'
// AAR-759 (Phase 1): Mietwagen-Status-Anzeige
import { MietwagenStatusCard } from '@/components/shared/mietwagen'
// AAR-761 Phase 2: Kunde-Upload-Card fuer Belege
import { BelegUploadCard } from '@/components/kunde/beleg-upload'

type Dokument = { id: string; typ: string; datei_url: string; datei_name: string | null; created_at: string }
type AktiverTermin = { id: string; status: string; start_zeit: string; end_zeit: string; vorgeschlagenes_datum: string | null; gegenvorschlag_von: string | null; gegenvorschlag_grund: string | null; sv_id: string | null; sv_vorgeschlagene_slots?: Array<{ datum: string; uhrzeit: string }> | null }
type Nachricht = { id: string; kanal: string; sender_id: string; sender_rolle: string; nachricht: string; hat_anhang: boolean; anhang_url: string | null; created_at: string }
type ChatTeilnehmer = { user_id: string; rolle: string; vorname: string | null; nachname: string | null; avatar_url?: string | null }

const TABS = [
  { key: 'uebersicht' as const, label: 'Übersicht' },
  { key: 'dokumente' as const, label: 'Dokumente' },
  { key: 'chat' as const, label: 'Chat' },
]

async function markNachrichtenGelesen(_fallId: string): Promise<void> {
  // Pre-Polish stub — Server-Action wurde im polish-sweep entfernt.
  // Cleanup: TODO in Folge-PR durch echte mark-read-action ersetzen.
}

const ROLLE_LABEL: Record<string, string> = { kunde: 'Sie', admin: 'Claimondo', kundenbetreuer: 'Ihr Betreuer', gutachter: 'Gutachter', sachverstaendiger: 'Gutachter', system: 'System' }
const ROLLE_COLOR: Record<string, string> = { kunde: 'bg-claimondo-ondo', admin: 'bg-claimondo-navy', kundenbetreuer: 'bg-claimondo-shield', gutachter: 'bg-claimondo-shield', sachverstaendiger: 'bg-claimondo-shield', system: 'bg-claimondo-ondo/70' }

function fmt(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Tab-System entfernt — Übersicht + Dokumente werden direkt
// untereinander gerendert.

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FallDetailSections({
  fall, svName, svTelefon, svVerifiziert = false, kbName, dokumente, nachrichten, userId, chatTeilnehmer, aktiverTermin,
}: {
  fall: Record<string, unknown>
  svName: string | null
  svTelefon: string | null
  svVerifiziert?: boolean
  kbName?: string | null
  dokumente: Dokument[]
  /** @deprecated — Chat ist entfernt, Nachrichten gehen ueber Sidebar */
  nachrichten?: unknown[]
  /** @deprecated — userId nur noch fuer Chat genutzt, der ist raus */
  userId?: string
  /** @deprecated — Chat-Teilnehmer nicht mehr noetig */
  chatTeilnehmer?: unknown[]
  aktiverTermin?: AktiverTermin | null
}) {
  const [activeTab, setActiveTab] = useState<'uebersicht' | 'dokumente' | 'chat'>('uebersicht')
  return (
    <div>
      {/* Tab-Leiste */}
      <div className="flex bg-white rounded-xl border border-claimondo-border shadow-sm overflow-hidden mb-5">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => {
            setActiveTab(tab.key)
            if (tab.key === 'chat') markNachrichtenGelesen(fall.id as string)
          }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-claimondo-ondo text-white'
                : 'text-claimondo-ondo hover:bg-claimondo-bg'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      {activeTab === 'uebersicht' && (
        <div className="space-y-5">
          {/* AAR-746: Shared Identity-Header statt handgerollter Aktueller-
              Status-Section. KB + nächster Termin wandern in die Detail-
              Section darunter. */}
          <div className="-mx-4 sm:-mx-0 rounded-none sm:rounded-xl overflow-hidden sm:border sm:border-claimondo-border">
            <FallIdentityHeader
              rolle="kunde"
              fallNummer={(fall.fall_nummer as string) ?? (fall.id as string)?.slice(0, 8)}
              subphaseLabel={(fall.status as string) ?? null}
              className="!border-b-0"
            />
          </div>

          {/* AAR-754: Shared FallKontakteCard — ersetzt die handgerollten
              "Ihr Ansprechpartner" + "Ihr Gutachter" Sections. Kunde-Rolle
              nutzt Labels "Ihr Betreuer" / "Ihr Gutachter" automatisch. */}
          <FallKontakteCard
            rolle="kunde"
            kundenbetreuer={
              kbName
                ? { vorname: kbName, nachname: null, telefon: null, email: null }
                : null
            }
            sv={
              svName
                ? {
                    vorname: svName,
                    nachname: null,
                    telefon: svTelefon,
                    email: null,
                    verifiziert: svVerifiziert,
                  }
                : null
            }
          />

          {/* AAR-754: Shared StammdatenReadSection — ersetzt die inline
              Fahrzeug-Section. Kunde-Rolle filtert eigenen Kontakt + Halter
              automatisch raus. Unfallhergang bleibt separat darunter. */}
          <StammdatenReadSection
            rolle="kunde"
            lead={null}
            fall={fall}
            title="Fahrzeug & Unfall"
          />

          {/* AAR-759: Mietwagen-Status für Kunde (Phase 1 read-only) */}
          <MietwagenStatusCard
            rolle="kunde"
            fall={{
              mietwagen_hat: (fall.mietwagen_hat as boolean | null) ?? null,
              mietwagen_seit_datum: (fall.mietwagen_seit_datum as string | null) ?? null,
              mietwagen_limit_tage: (fall.mietwagen_limit_tage as number | null) ?? null,
              mietwagen_limit_grund: (fall.mietwagen_limit_grund as string | null) ?? null,
              mietwagen_rechnung_vorhanden: (fall.mietwagen_rechnung_vorhanden as boolean | null) ?? null,
              mietwagen_argumentations_puffer: (fall.mietwagen_argumentations_puffer as number | null) ?? null,
              mietwagen_vermieter: (fall.mietwagen_vermieter as string | null) ?? null,
              nutzungsausfall_tage: (fall.nutzungsausfall_tage as number | null) ?? null,
            }}
          />

          {!!fall.schadens_beschreibung && (
            <Section title="Unfallhergang">
              <p className="text-sm text-claimondo-navy whitespace-pre-wrap">
                {fall.schadens_beschreibung as string}
              </p>
            </Section>
          )}

          {/* KFZ-134: SV-Gegenvorschlag Banner (altes Format: 1 Datum) */}
          {aktiverTermin && aktiverTermin.status === 'gegenvorschlag' && aktiverTermin.gegenvorschlag_von === 'sv' && aktiverTermin.vorgeschlagenes_datum && !aktiverTermin.sv_vorgeschlagene_slots?.length && (
            <GegenvorschlagBanner
              fallId={fall.id as string}
              svName={svName ?? 'Sachverständiger'}
              vorgeschlagenesDatum={aktiverTermin.vorgeschlagenes_datum}
              grund={aktiverTermin.gegenvorschlag_grund}
            />
          )}

          {/* KFZ-192: SV hat mehrere alternative Slots vorgeschlagen */}
          {aktiverTermin && aktiverTermin.status === 'gegenvorschlag' && aktiverTermin.sv_vorgeschlagene_slots && aktiverTermin.sv_vorgeschlagene_slots.length > 0 && (
            <SlotAuswahlBanner
              fallId={fall.id as string}
              terminId={aktiverTermin.id}
              svName={svName ?? 'Sachverständiger'}
              slots={aktiverTermin.sv_vorgeschlagene_slots}
            />
          )}
        </div>
      )}

      {activeTab === 'dokumente' && (
        <div className="space-y-5">
          {/* AAR-761 Phase 2: Upload-Card mit Typ-Auswahl + OCR */}
          <BelegUploadCard fallId={fall.id as string} />

          <Section title="Hochgeladene Dokumente">
            <DokumenteDownloadListe
              variant="list"
              rolle="kunde"
              emptyTitle="Noch keine Dokumente vorhanden."
              dokumente={dokumente.map<DokumentItem>(doc => ({
                id: doc.id,
                name: doc.datei_name ?? 'Dokument',
                url: doc.datei_url,
                typ: doc.typ,
                createdAt: doc.created_at,
              }))}
            />
          </Section>
        </div>
      )}

      {activeTab === 'chat' && (
        <ChatTab fallId={fall.id as string} nachrichten={(nachrichten ?? []) as Nachricht[]} userId={userId ?? ''} teilnehmer={(chatTeilnehmer ?? []) as ChatTeilnehmer[]} />
      )}
    </div>
  )
}

// ─── Section + InfoRow ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-5">
      <h3 className="text-sm font-semibold text-claimondo-navy mb-3">{title}</h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-claimondo-border last:border-0">
      <span className="text-sm text-claimondo-ondo">{label}</span>
      <span className="text-sm text-claimondo-navy font-medium text-right">{value}</span>
    </div>
  )
}

// ─── Chat Tab — KFZ-129: Gruppen-Chat mit Teilnehmer-Header ──────────────

function ChatTab({ fallId, nachrichten: initialNachrichten, userId, teilnehmer }: {
  fallId: string; nachrichten: Nachricht[]; userId: string; teilnehmer: ChatTeilnehmer[]
}) {
  const [messages, setMessages] = useState(initialNachrichten)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Teilnehmer-Map fuer Namen-Lookup
  const teilnehmerMap = Object.fromEntries(teilnehmer.map(t => [t.user_id, t]))

  function getSenderName(msg: Nachricht): string {
    if (msg.sender_id === userId) return 'Sie'
    const t = teilnehmerMap[msg.sender_id]
    if (t) return [t.vorname, t.nachname].filter(Boolean).join(' ') || ROLLE_LABEL[t.rolle] || t.rolle
    return ROLLE_LABEL[msg.sender_rolle] ?? msg.sender_rolle
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true); setError(null)
    try {
      const { sendNachricht } = await import('./actions')
      await sendNachricht(fallId, text.trim(), 'chat_kb_kunde')
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), kanal: 'gruppe', sender_id: userId,
        sender_rolle: 'kunde', nachricht: text.trim(), hat_anhang: false, anhang_url: null,
        created_at: new Date().toISOString(),
      }])
      setText('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler beim Senden') }
    finally { setSending(false) }
  }

  // Andere Teilnehmer (nicht der Kunde selbst)
  const otherTeilnehmer = teilnehmer.filter(t => t.user_id !== userId)

  return (
    <div className="bg-white rounded-xl border border-claimondo-border shadow-sm overflow-hidden">
      {/* KFZ-129: Teilnehmer-Header */}
      {otherTeilnehmer.length > 0 && (
        <div className="px-4 py-3 bg-claimondo-navy/5 border-b border-claimondo-border">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-2">Ihre Ansprechpartner</p>
          <div className="flex flex-wrap gap-3">
            {otherTeilnehmer.map(t => {
              const name = [t.vorname, t.nachname].filter(Boolean).join(' ') || 'Unbekannt'
              const rolleLabel = t.rolle === 'kundenbetreuer' ? 'Kundenbetreuer' : t.rolle === 'gutachter' ? 'Gutachter' : t.rolle === 'admin' ? 'Admin' : t.rolle
              const avatarBg = ROLLE_COLOR[t.rolle] ?? 'bg-claimondo-ondo/70'
              const initials = [t.vorname?.[0], t.nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'
              return (
                <div key={t.user_id} className="flex items-center gap-2">
                  {t.avatar_url ? (
                    <img src={t.avatar_url} alt={name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className={`w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-xs font-bold`}>
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-claimondo-navy">{name}</p>
                    <p className="text-[10px] text-claimondo-ondo/70">{rolleLabel}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Messages — ein Stream fuer alle */}
      <div className="space-y-3 p-4 max-h-96 overflow-y-auto">
        {messages.length === 0 && <p className="text-sm text-claimondo-ondo/70 text-center py-8">Noch keine Nachrichten. Schreiben Sie uns!</p>}
        {messages.map(msg => {
          const isOwn = msg.sender_id === userId
          const isSystem = msg.sender_rolle === 'system'
          const isWhatsApp = msg.kanal === 'whatsapp'

          // KFZ-134: System-Nachrichten zentriert mit eigenem Style
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-claimondo-bg border border-claimondo-light-blue/30 rounded-xl px-4 py-2 max-w-[85%]">
                  <p className="text-xs text-claimondo-navy text-center whitespace-pre-wrap">{msg.nachricht}</p>
                  <p className="text-[9px] text-claimondo-ondo/70 text-center mt-1">
                    {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          }

          const senderName = getSenderName(msg)
          const bubbleColor = isOwn ? 'bg-claimondo-ondo text-white' : 'bg-claimondo-bg text-claimondo-navy'
          const lightText = isOwn ? 'text-white/60' : 'text-claimondo-ondo/70'

          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${bubbleColor}`}>
                <div className="flex items-center gap-1.5">
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${lightText}`}>
                    {senderName}
                  </p>
                  {isWhatsApp && <span className={`text-[9px] ${lightText}`}>via WhatsApp</span>}
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.nachricht}</p>
                {msg.hat_anhang && msg.anhang_url && (
                  <a href={msg.anhang_url} target="_blank" rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 mt-1 text-xs underline ${isOwn ? 'text-white/70' : 'text-claimondo-ondo'}`}>
                    Anhang
                  </a>
                )}
                <p className={`text-[10px] mt-1 ${lightText}`}>
                  {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-claimondo-border">
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input type="text" value={text} onChange={e => setText(e.target.value)}
            placeholder="Nachricht schreiben..."
            // AAR-452: text-base (16px) verhindert iOS-Autozoom beim Fokus
            className="flex-1 bg-claimondo-bg border border-claimondo-border rounded-xl px-4 py-3 text-base text-claimondo-navy placeholder-gray-400 focus:outline-none focus:border-claimondo-ondo" />
          <button type="submit" disabled={sending || !text.trim()}
            className="px-4 py-3 bg-claimondo-ondo hover:bg-claimondo-shield text-white rounded-xl transition-colors disabled:opacity-40 min-h-12 flex items-center justify-center">
            {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SendIcon className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── KFZ-134: Gegenvorschlag-Banner (Kunde sieht SV-Vorschlag) ────────────

function GegenvorschlagBanner({ fallId, svName, vorgeschlagenesDatum, grund }: {
  fallId: string; svName: string; vorgeschlagenesDatum: string; grund: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [neuerTermin, setNeuerTermin] = useState('')
  const [kundeGrund, setKundeGrund] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const datumStr = new Date(vorgeschlagenesDatum).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  async function handleAnnehmen() {
    setLoading(true)
    const result = await terminAnnehmen({ source: 'kunde', fallId })
    setLoading(false)
    if (result.success) {
      setDone('Termin bestätigt! Der Sachverständige wird informiert.')
    }
  }

  async function handleGegenvorschlag() {
    if (!neuerTermin) return
    setLoading(true)
    const result = await terminGegenvorschlag({ neuesDatum: neuerTermin, grund: kundeGrund, source: 'kunde', fallId })
    setLoading(false)
    if (result.success) {
      setShowModal(false)
      setDone('Ihr Gegenvorschlag wurde übermittelt. Der Sachverständige wird informiert.')
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm text-green-700 font-medium">{done}</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-claimondo-ondo/5 border border-claimondo-light-blue/30 rounded-xl p-5">
        <p className="text-sm font-semibold text-claimondo-navy mb-2">Neuer Terminvorschlag vom Sachverständigen</p>
        <p className="text-sm text-claimondo-shield mb-1">
          {svName} hat einen alternativen Termin vorgeschlagen: <strong>{datumStr}</strong>
        </p>
        {grund && <p className="text-xs text-claimondo-ondo mb-3">Grund: {grund}</p>}
        {!grund && <div className="mb-3" />}

        <div className="space-y-2">
          <button onClick={handleAnnehmen} disabled={loading}
            className="w-full py-3 rounded-xl bg-claimondo-ondo text-white font-medium text-sm hover:bg-claimondo-shield transition-colors disabled:opacity-40">
            {loading ? 'Wird verarbeitet...' : 'Vorschlag annehmen'}
          </button>
          <button onClick={() => setShowModal(true)} disabled={loading}
            className="w-full py-3 rounded-xl bg-white text-claimondo-shield font-medium text-sm border border-claimondo-shield hover:bg-claimondo-bg transition-colors disabled:opacity-40">
            Anderen Termin vorschlagen
          </button>
          <Link href={`/kunde/faelle/${fallId}/kalender`}
            className="w-full py-3 rounded-xl bg-white text-claimondo-shield font-medium text-sm border border-claimondo-light-blue/30 hover:bg-claimondo-bg transition-colors flex items-center justify-center gap-2">
            <CalendarIcon className="w-4 h-4" /> Kalender des Gutachters öffnen
          </Link>
        </div>
      </div>

      {/* Modal: Anderen Termin vorschlagen */}
      <Modal open={showModal} onClose={() => setShowModal(false)} maxWidth={384} ariaLabel="Anderen Termin vorschlagen">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">Anderen Termin vorschlagen</h3>
        <p className="text-sm text-claimondo-ondo mb-4">Wählen Sie einen für Sie passenden Termin:</p>

        {/* AAR-452: text-base (16px) + min-h-[44px] für iOS-Kompatibilität */}
        <input type="datetime-local" value={neuerTermin} onChange={e => setNeuerTermin(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="w-full border border-claimondo-border rounded-lg px-3 min-h-[44px] text-base text-claimondo-navy mb-3 focus:outline-none focus:border-claimondo-ondo" />
        <textarea value={kundeGrund} onChange={e => setKundeGrund(e.target.value)}
          placeholder="Begründung (optional)"
          className="w-full border border-claimondo-border rounded-lg px-3 py-2.5 text-base text-claimondo-navy mb-4 focus:outline-none focus:border-claimondo-ondo resize-none" rows={2} />

        <div className="flex gap-2">
          <button onClick={() => setShowModal(false)}
            className="flex-1 min-h-[44px] rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors">
            Abbrechen
          </button>
          <button onClick={handleGegenvorschlag} disabled={loading || !neuerTermin}
            className="flex-1 min-h-[44px] rounded-lg text-sm font-medium text-white bg-claimondo-ondo hover:bg-claimondo-shield transition-colors disabled:opacity-50">
            {loading ? 'Wird gesendet...' : 'Vorschlag senden'}
          </button>
        </div>
      </Modal>
    </>
  )
}

// ─── KFZ-192: Slot-Auswahl Banner (Kunde wählt aus SV-Gegenvorschlägen) ─────

function SlotAuswahlBanner({
  fallId,
  terminId,
  svName,
  slots,
}: {
  fallId: string
  terminId: string
  svName: string
  slots: Array<{ datum: string; uhrzeit: string }>
}) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleWahl(slot: { datum: string; uhrzeit: string }) {
    setLoading(true)
    setError(null)
    const result = await waehleGegenvorschlagSlot(fallId, terminId, slot)
    setLoading(false)
    if (result.success) {
      const datumStr = (() => {
        try {
          return new Date(`${slot.datum}T${slot.uhrzeit}`).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        } catch {
          return `${slot.datum} ${slot.uhrzeit}`
        }
      })()
      setDone(`Termin am ${datumStr} wurde bestätigt! Der Sachverständige wird informiert.`)
    } else {
      setError(result.error ?? 'Fehler beim Bestätigen')
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm text-green-700 font-medium">{done}</p>
      </div>
    )
  }

  return (
    <div className="bg-claimondo-ondo/5 border border-claimondo-light-blue/30 rounded-xl p-5">
      <p className="text-sm font-semibold text-claimondo-navy mb-1">
        {svName} hat alternative Termine vorgeschlagen
      </p>
      <p className="text-xs text-claimondo-ondo mb-4">
        Bitte wählen Sie einen der folgenden Termine:
      </p>
      <div className="space-y-2">
        {slots.map((slot, idx) => {
          const datumStr = (() => {
            try {
              return new Date(`${slot.datum}T${slot.uhrzeit}`).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })
            } catch {
              return `${slot.datum} ${slot.uhrzeit}`
            }
          })()
          return (
            <button
              key={idx}
              onClick={() => handleWahl(slot)}
              disabled={loading}
              className="w-full text-left px-4 py-3 rounded-xl border border-claimondo-light-blue/40 bg-white hover:bg-claimondo-ondo/5 hover:border-claimondo-ondo transition-colors disabled:opacity-40"
            >
              <span className="text-sm font-medium text-claimondo-navy">{datumStr}</span>
              <span className="block text-xs text-claimondo-ondo mt-0.5">Diesen Termin wählen →</span>
            </button>
          )
        })}
      </div>
      {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
    </div>
  )
}
