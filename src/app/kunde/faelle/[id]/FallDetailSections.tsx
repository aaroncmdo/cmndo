'use client'

import { useState, useRef, useEffect } from 'react'
import { SendIcon, FileTextIcon } from 'lucide-react'

type Nachricht = { id: string; kanal: string; sender_id: string; sender_rolle: string; nachricht: string; hat_anhang: boolean | null; anhang_url: string | null; created_at: string }
type Dokument = { id: string; typ: string; datei_url: string; datei_name: string | null; created_at: string }

const ROLLE_LABEL: Record<string, string> = { kunde: 'Sie', admin: 'Claimondo', kundenbetreuer: 'Ihr Betreuer', gutachter: 'Gutachter', system: 'System' }

function fmt(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'uebersicht', label: 'Uebersicht' },
  { key: 'dokumente', label: 'Dokumente' },
  { key: 'chat', label: 'Chat' },
] as const

type TabKey = (typeof TABS)[number]['key']

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FallDetailSections({
  fall, svName, svTelefon, dokumente, nachrichten, userId,
}: {
  fall: Record<string, unknown>
  svName: string | null
  svTelefon: string | null
  dokumente: Dokument[]
  nachrichten: Nachricht[]
  userId: string
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('uebersicht')

  return (
    <div>
      {/* Tab-Leiste */}
      <div className="flex bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#4573A2] text-white'
                : 'text-gray-500 hover:bg-gray-50'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      {activeTab === 'uebersicht' && (
        <div className="space-y-5">
          <Section title="Aktueller Status">
            <InfoRow label="Fallnummer" value={(fall.fall_nummer as string) ?? (fall.id as string)?.slice(0, 8)} />
            <InfoRow label="Status" value={(fall.status as string) ?? '—'} />
            {fall.sv_termin && <InfoRow label="Naechster Termin" value={fmtDateTime(fall.sv_termin as string)} />}
          </Section>

          <Section title="Fahrzeug">
            {fall.kennzeichen && <InfoRow label="Kennzeichen" value={fall.kennzeichen as string} />}
            {fall.fahrzeug_hersteller && <InfoRow label="Marke" value={fall.fahrzeug_hersteller as string} />}
            {fall.fahrzeug_modell && <InfoRow label="Modell" value={fall.fahrzeug_modell as string} />}
            {fall.schadens_datum && <InfoRow label="Schadensdatum" value={fmt(fall.schadens_datum as string)} />}
            {fall.schadens_beschreibung && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Unfallhergang</p>
                <p className="text-sm text-[#0D1B3E] whitespace-pre-wrap">{fall.schadens_beschreibung as string}</p>
              </div>
            )}
          </Section>

          {svName && (
            <Section title="Ihr Gutachter">
              <InfoRow label="Name" value={svName} />
              {svTelefon && <InfoRow label="Telefon" value={svTelefon} />}
              {fall.sv_termin && <InfoRow label="Besichtigungstermin" value={fmtDateTime(fall.sv_termin as string)} />}
              {fall.besichtigungsort_adresse && <InfoRow label="Besichtigungsort" value={fall.besichtigungsort_adresse as string} />}
            </Section>
          )}
        </div>
      )}

      {activeTab === 'dokumente' && (
        <Section title="Dokumente">
          {dokumente.length === 0 ? (
            <p className="text-sm text-gray-400">Noch keine Dokumente vorhanden.</p>
          ) : (
            <div className="space-y-2">
              {dokumente.map(doc => (
                <a key={doc.id} href={doc.datei_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <FileTextIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
                  <span className="text-sm text-[#0D1B3E] truncate flex-1">{doc.datei_name ?? 'Dokument'}</span>
                  <span className="text-[10px] text-gray-400">{fmt(doc.created_at)}</span>
                </a>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === 'chat' && (
        <ChatTab fallId={fall.id as string} nachrichten={nachrichten} userId={userId} hasSv={!!fall.sv_id} />
      )}
    </div>
  )
}

// ─── Section + InfoRow ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-[#0D1B3E] mb-3">{title}</h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-[#0D1B3E] font-medium text-right">{value}</span>
    </div>
  )
}

// ─── Chat Tab — Sub-Tabs [Claimondo] [Gutachter] + WhatsApp ────────────────

function ChatTab({ fallId, nachrichten: initialNachrichten, userId, hasSv }: {
  fallId: string; nachrichten: Nachricht[]; userId: string; hasSv: boolean
}) {
  const [activeKanal, setActiveKanal] = useState<string>('portal-kunde-claimondo')
  const [messages, setMessages] = useState(initialNachrichten)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const filtered = messages.filter(m => m.kanal === activeKanal || m.kanal === 'whatsapp')

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [filtered])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true); setError(null)
    try {
      const { sendNachricht } = await import('./actions')
      await sendNachricht(fallId, text.trim(), activeKanal as 'portal-kunde-claimondo' | 'portal-kunde-gutachter')
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), kanal: activeKanal, sender_id: userId,
        sender_rolle: 'kunde', nachricht: text.trim(), hat_anhang: false, anhang_url: null,
        created_at: new Date().toISOString(),
      }])
      setText('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler beim Senden') }
    finally { setSending(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {/* Sub-Tabs: Claimondo / Gutachter */}
      <div className="flex gap-1 mb-4">
        <button onClick={() => setActiveKanal('portal-kunde-claimondo')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeKanal === 'portal-kunde-claimondo' ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          Claimondo
        </button>
        {hasSv && (
          <button onClick={() => setActiveKanal('portal-kunde-gutachter')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeKanal === 'portal-kunde-gutachter' ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            Gutachter
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Noch keine Nachrichten. Schreiben Sie uns!</p>}
        {filtered.map(msg => {
          const isOwn = msg.sender_id === userId
          const isWhatsApp = msg.kanal === 'whatsapp'
          const isGutachter = msg.sender_rolle === 'gutachter'
          const bubbleColor = isOwn ? 'bg-[#4573A2] text-white' : isGutachter ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-[#0D1B3E]'

          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${bubbleColor}`}>
                <div className="flex items-center gap-1.5">
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${isOwn || isGutachter ? 'text-white/60' : 'text-gray-400'}`}>
                    {ROLLE_LABEL[msg.sender_rolle] ?? msg.sender_rolle}
                  </p>
                  {isWhatsApp && <span className="text-[9px] opacity-60">via WhatsApp</span>}
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.nachricht}</p>
                {msg.hat_anhang && msg.anhang_url && (
                  <a href={msg.anhang_url} target="_blank" rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 mt-1 text-xs underline ${isOwn || isGutachter ? 'text-white/70' : 'text-[#4573A2]'}`}>
                    Anhang
                  </a>
                )}
                <p className={`text-[10px] mt-1 ${isOwn || isGutachter ? 'text-white/50' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
      <form onSubmit={handleSend} className="flex gap-2">
        <input type="text" value={text} onChange={e => setText(e.target.value)}
          placeholder={activeKanal === 'portal-kunde-gutachter' ? 'Nachricht an Gutachter...' : 'Nachricht an Claimondo...'}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-[#0D1B3E] placeholder-gray-400 focus:outline-none focus:border-[#4573A2]" />
        <button type="submit" disabled={sending || !text.trim()}
          className="px-4 py-3 bg-[#4573A2] hover:bg-[#1E3A5F] text-white rounded-xl transition-colors disabled:opacity-40 min-h-12 flex items-center justify-center">
          {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SendIcon className="w-5 h-5" />}
        </button>
      </form>
    </div>
  )
}
