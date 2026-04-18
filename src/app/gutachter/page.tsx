'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavigationIcon, CameraIcon, CheckIcon, MapPinIcon, ArrowLeftIcon, CalendarIcon, ClipboardCheckIcon, MessageCircleIcon, BanknoteIcon, InfoIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PhoneButton from '@/components/shared/PhoneButton'
// AAR-355: Vor-Ort-Fallback für fehlende Pflichtdokumente
import CockpitPflichtUpload from '@/components/gutachter/CockpitPflichtUpload'

type Termin = { id: string; uhrzeit: string; kunde: string; telefon: string | null; email: string | null; adresse: string; kennzeichen: string | null; fahrzeug: string | null; schadentyp: string | null }
type Auftrag = { id: string; kunde: string; kennzeichen: string | null; schadentyp: string | null; datum: string }
type Task = { id: string; titel: string; fallId: string | null; faelligAm: string | null }
type DoneTask = { id: string; titel: string }
type TLEvent = { zeit: string; uhrzeit: string; typ: 'termin' | 'task-offen' | 'task-done' | 'nachricht' | 'system' | 'zahlung'; titel: string; detail: string; fallId?: string }
type Mode = 'overview' | 'navigation' | 'onsite'

const FOTO = ['Vorne', 'Hinten', 'Links', 'Rechts']

export default function GutachterCockpit() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState(''); const [datum, setDatum] = useState('')
  const [termine, setTermine] = useState<Termin[]>([]); const [auftraege, setAuftraege] = useState<Auftrag[]>([]); const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState({ faelle: 0, max: 25, monat: 0 })
  const [routeUrl, setRouteUrl] = useState<string | null>(null)
  const [faellig, setFaellig] = useState<{ id: string; kunde: string } | null>(null)
  const [finanz, setFinanz] = useState({ eingegangen: 0, offen: 0, leadpreise: 0 })
  const [svLat, setSvLat] = useState<number | null>(null); const [svLng, setSvLng] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [doneTasks, setDoneTasks] = useState<DoneTask[]>([]); const [showDone, setShowDone] = useState(false)
  const [tlEvents, setTlEvents] = useState<TLEvent[]>([])
  const [mode, setMode] = useState<Mode>('overview'); const [active, setActive] = useState<Termin | null>(null)
  const [fotos, setFotos] = useState<Record<string, boolean>>({}); const [fin, setFin] = useState(''); const [km, setKm] = useState(''); const [notizen, setNotizen] = useState('')
  const [uploading, setUploading] = useState(false); const [completing, setCompleting] = useState(false)
  const [mTab, setMTab] = useState<'route' | 'kunde' | 'uploads'>('route')

  const load = useCallback(async () => {
    try {
    const user = (await supabase.auth.getUser())?.data?.user ?? null; if (!user) { setLoading(false); return }
    let { data: sv } = await supabase.from('sachverstaendige').select('id, standort_lat, standort_lng, paket_faelle_genutzt, paket_faelle_gesamt, offene_faelle').eq('profile_id', user.id).single()
    if (!sv) { const r = await supabase.from('sachverstaendige').select('id, standort_lat, standort_lng, paket_faelle_genutzt, paket_faelle_gesamt, offene_faelle').eq('user_id', user.id).single(); sv = r.data }
    if (!sv) { setLoading(false); return }
    const { data: p } = await supabase.from('profiles').select('vorname').eq('id', user.id).single()
    const now = new Date(); const h = now.getHours()
    setGreeting(`${h < 12 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'}${p?.vorname ? ` ${p.vorname}` : ''}`)
    const isToday = selectedDate.toDateString() === now.toDateString()
    setDatum(isToday ? `HEUTE ${selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}` : selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }))
    setSvLat(sv.standort_lat ? Number(sv.standort_lat) : null); setSvLng(sv.standort_lng ? Number(sv.standort_lng) : null)
    setStats({ faelle: sv.offene_faelle ?? sv.paket_faelle_genutzt ?? 0, max: sv.paket_faelle_gesamt ?? 25, monat: 0 })

    const ds = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).toISOString()
    const de = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1).toISOString()

    const [tR, nR, tkR, fR, doneR] = await Promise.all([
      supabase.from('faelle').select('id, fall_nummer, schadens_adresse, schadens_plz, schadens_ort, sv_termin, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadens_fall_typ').eq('sv_id', sv.id).gte('sv_termin', ds).lt('sv_termin', de).not('status', 'in', '("abgeschlossen","storniert")').order('sv_termin', { ascending: true }),
      supabase.from('faelle').select('id, lead_id, kennzeichen, schadens_fall_typ, created_at').eq('sv_id', sv.id).is('sv_termin', null).not('status', 'in', '("abgeschlossen","storniert")').limit(10),
      supabase.from('tasks').select('id, titel, fall_id, faellig_am').or(`zugewiesen_an.eq.${user.id},empfaenger_user_id.eq.${user.id}`).in('status', ['offen', 'in-bearbeitung']).lte('faellig_am', de).limit(15),
      supabase.from('faelle').select('id, lead_id').eq('sv_id', sv.id).not('sv_termin', 'is', null).lt('sv_termin', now.toISOString()).is('gutachten_eingegangen_am', null).not('status', 'in', '("abgeschlossen","storniert")').limit(1),
      supabase.from('tasks').select('id, titel, updated_at').or(`zugewiesen_an.eq.${user.id},empfaenger_user_id.eq.${user.id}`).eq('status', 'erledigt').gte('updated_at', ds).lt('updated_at', de).limit(10),
    ])

    const ids = [...new Set([...(tR.data ?? []), ...(nR.data ?? []), ...(fR.data ?? [])].map(f => f.lead_id).filter(Boolean) as string[])]
    const lm: Record<string, { n: string; t: string | null; e: string | null }> = {}
    if (ids.length) { const { data: ls } = await supabase.from('leads').select('id, vorname, nachname, telefon, email').in('id', ids); for (const l of ls ?? []) lm[l.id] = { n: [l.vorname, l.nachname].filter(Boolean).join(' ') || '—', t: l.telefon, e: l.email } }

    setTermine((tR.data ?? []).map(f => ({ id: f.id, uhrzeit: f.sv_termin ? new Date(f.sv_termin).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—', kunde: lm[f.lead_id ?? '']?.n ?? '—', telefon: lm[f.lead_id ?? '']?.t ?? null, email: lm[f.lead_id ?? '']?.e ?? null, adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '), kennzeichen: f.kennzeichen ?? null, fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || null, schadentyp: f.schadens_fall_typ ?? null })))
    setAuftraege((nR.data ?? []).map(f => ({ id: f.id, kunde: lm[f.lead_id ?? '']?.n ?? '—', kennzeichen: f.kennzeichen ?? null, schadentyp: f.schadens_fall_typ ?? null, datum: f.created_at ? new Date(f.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '' })))
    setTasks((tkR.data ?? []).map(t => ({ id: t.id, titel: t.titel, fallId: t.fall_id, faelligAm: t.faellig_am ?? null })))
    setDoneTasks((doneR.data ?? []).map(t => ({ id: t.id, titel: t.titel })))
    const ff = (fR.data ?? [])[0]; setFaellig(ff ? { id: ff.id, kunde: lm[ff.lead_id ?? '']?.n ?? '—' } : null)

    const stops = (tR.data ?? []).map(f => [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', ')).filter(Boolean)
    setRouteUrl(stops.length ? `https://www.google.com/maps/dir/${stops.map(s => encodeURIComponent(s)).join('/')}` : null)

    // Finanz quick
    const { data: cf } = await supabase.from('faelle').select('gutachten_betrag, status').eq('sv_id', sv.id).not('gutachten_betrag', 'is', null)
    const ein = (cf ?? []).filter(f => ['abgeschlossen', 'regulierung'].includes(f.status)).reduce((s, f) => s + Number(f.gutachten_betrag ?? 0) * 0.12, 0)
    const off = (cf ?? []).filter(f => !['abgeschlossen', 'storniert'].includes(f.status)).reduce((s, f) => s + Number(f.gutachten_betrag ?? 0) * 0.12, 0)
    setFinanz({ eingegangen: Math.round(ein), offen: Math.round(off), leadpreise: 0 })

    // ─── Tages-Timeline ───
    const allFallIds = [...new Set([...(tR.data ?? []), ...(nR.data ?? [])].map(f => f.id))]
    const tl: TLEvent[] = []
    const fmt = (d: string | null) => d ? new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

    // Termine
    for (const f of tR.data ?? []) {
      tl.push({ zeit: f.sv_termin ?? ds, uhrzeit: fmt(f.sv_termin), typ: 'termin', titel: `Termin bei ${lm[f.lead_id ?? '']?.n ?? '—'}`, detail: [f.kennzeichen, f.schadens_adresse, f.schadens_plz].filter(Boolean).join(', '), fallId: f.id })
    }
    // Tasks fällig
    for (const t of tkR.data ?? []) {
      tl.push({ zeit: t.faellig_am ?? de, uhrzeit: fmt(t.faellig_am), typ: 'task-offen', titel: t.titel, detail: 'Fällig', fallId: t.fall_id ?? undefined })
    }
    // Tasks erledigt
    for (const t of doneR.data ?? []) {
      const ua = (t as Record<string, unknown>).updated_at as string | null
      tl.push({ zeit: ua ?? ds, uhrzeit: fmt(ua), typ: 'task-done', titel: t.titel, detail: 'Erledigt' })
    }

    // Nachrichten + Timeline-Events + Zahlungen
    if (allFallIds.length > 0) {
      const [msgR, evR, zahlR] = await Promise.all([
        supabase.from('nachrichten').select('id, fall_id, nachricht, sender_rolle, created_at').in('fall_id', allFallIds).gte('created_at', ds).lt('created_at', de).order('created_at', { ascending: true }).limit(20),
        supabase.from('timeline').select('id, fall_id, titel, beschreibung, created_at').in('fall_id', allFallIds).gte('created_at', ds).lt('created_at', de).order('created_at', { ascending: true }).limit(20),
        supabase.from('gutachter_abrechnungen').select('id, fall_id, schadenhoehe, leadpreis, abgerechnet_am').eq('sv_id', sv.id).gte('abgerechnet_am', ds).lt('abgerechnet_am', de).limit(10),
      ])
      for (const m of msgR.data ?? []) {
        tl.push({ zeit: m.created_at ?? ds, uhrzeit: fmt(m.created_at), typ: 'nachricht', titel: `Nachricht von ${m.sender_rolle === 'sachverstaendiger' ? 'Dir' : m.sender_rolle ?? 'KB'}`, detail: (m.nachricht ?? '').slice(0, 80), fallId: m.fall_id ?? undefined })
      }
      for (const e of evR.data ?? []) {
        tl.push({ zeit: e.created_at ?? ds, uhrzeit: fmt(e.created_at), typ: 'system', titel: e.titel ?? 'System', detail: (e.beschreibung ?? '').slice(0, 80), fallId: e.fall_id ?? undefined })
      }
      for (const z of zahlR.data ?? []) {
        tl.push({ zeit: z.abgerechnet_am ?? ds, uhrzeit: fmt(z.abgerechnet_am), typ: 'zahlung', titel: `Leadpreis ${Number(z.leadpreis ?? 0)}€`, detail: `Schadenhöhe ${Number(z.schadenhoehe ?? 0)}€`, fallId: z.fall_id ?? undefined })
      }
    }
    tl.sort((a, b) => new Date(a.zeit).getTime() - new Date(b.zeit).getTime())
    setTlEvents(tl.slice(0, 50))

    setLoading(false)
    } catch (err) {
      // AAR-260: Spinner hing wenn irgendein Query fehlschlug. Try/catch +
      // setLoading(false) in beiden Pfaden (success + error) sichert dass
      // die Seite immer rendert, auch bei Teilausfall der Queries.
      console.error('[AAR-260] Gutachter-Dashboard load fehlgeschlagen:', err)
      setLoading(false)
    }
  }, [supabase, selectedDate])

  useEffect(() => { load() }, [load])

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  function startNav(t: Termin) { if (!isToday) return; setActive(t); setMode('navigation'); setFotos({}); setFin(''); setKm(''); setNotizen(''); setMTab('route') }

  async function handleFoto(slot: string, file: File) {
    if (!active) return
    setUploading(true)
    try {
      // AAR-363: Offline-Fallback — wenn Browser keine Verbindung sieht, den
      // Upload in die IndexedDB-Outbox legen statt direkt zu versuchen.
      // Der sync-outbox-Listener arbeitet die Queue bei Online-Wiederkehr ab.
      const ext = file.name.split('.').pop() ?? 'jpg'
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { addToOutbox } = await import('@/lib/offline/outbox')
        await addToOutbox({
          fall_id: active.id,
          dokument_typ: `schadensfoto_${slot.toLowerCase()}`,
          file_blob: file,
          file_name: `${slot}.${ext}`,
          file_size: file.size,
          content_type: file.type || 'image/jpeg',
          ist_pflicht: false,
          ab_phase: null,
        })
        setFotos(p => ({ ...p, [slot]: true }))
        setUploading(false)
        return
      }
      // Online-Pfad (AAR-553: fall-dokumente-Bucket + fall_dokumente-Tabelle)
      const path = `${active.id}/gutachter-fotos/${slot.toLowerCase()}_${Date.now()}.${ext}`
      await supabase.storage.from('fall-dokumente').upload(path, file, { contentType: file.type })
      await supabase.from('fall_dokumente').insert({
        fall_id: active.id,
        dokument_typ: 'schadensfoto',
        storage_path: path,
        original_filename: `${slot}.${ext}`,
        groesse_bytes: file.size,
        mime_type: file.type || 'image/jpeg',
        kategorie: 'schadensfotos',
        uploaded_by_sv: true,
        quelle: 'gutachter-app',
      })
      setFotos(p => ({ ...p, [slot]: true }))
    } catch {
      /* */
    }
    setUploading(false)
  }

  async function complete() { if (!active) return; setCompleting(true); try { const u: Record<string, unknown> = {}; if (fin.length === 17) u.fin_vin = fin.toUpperCase(); if (Object.keys(u).length) await supabase.from('faelle').update(u).eq('id', active.id); const { transitionFallStatus } = await import('@/lib/faelle/state-machine'); try { await transitionFallStatus(active.id, 'besichtigung') } catch { /* Transition evtl. nicht erlaubt */ }; setMode('overview'); setActive(null); load() } catch { /* */ } setCompleting(false) }

  const fc = FOTO.filter(s => fotos[s]).length
  const mk = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const embed = active && mk && svLat && svLng ? `https://www.google.com/maps/embed/v1/directions?key=${mk}&origin=${svLat},${svLng}&destination=${encodeURIComponent(active.adresse)}&mode=driving` : null
  const navUrl = active ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(active.adresse)}` : null

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-[var(--brand-secondary)] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="h-full overflow-hidden flex flex-col">

      {/* ═══ STATS-LEISTE ═══ */}
      <div className="h-10 flex items-center justify-between px-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          {mode !== 'overview' && <button onClick={() => { setMode('overview'); setActive(null) }} className="text-gray-400 hover:text-gray-600 mr-1"><ArrowLeftIcon className="w-4 h-4" /></button>}
          <span className="text-sm font-semibold text-gray-900">{greeting}</span>
          {/* Tages-Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))} aria-label="Vorheriger Tag" className="text-gray-500 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 text-xs">◀</button>
            <button onClick={() => setSelectedDate(new Date())} aria-label="Zurück zu heute" className="text-xs text-gray-600 hover:text-gray-800 px-1.5 py-0.5 rounded hover:bg-gray-100">{datum}</button>
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))} aria-label="Nächster Tag" className="text-gray-500 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 text-xs">▶</button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-medium">
          <span className="bg-[var(--brand-secondary)]/5 text-[var(--brand-primary)] px-2 py-0.5 rounded-full">{termine.length} Termine</span>
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full hidden sm:inline">{tasks.length} Tasks</span>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full hidden md:inline">{stats.faelle}/{stats.max}</span>
        </div>
      </div>

      {/* Mobile tabs */}
      {mode !== 'overview' && <div className="flex lg:hidden border-b border-gray-200 flex-shrink-0">{(['route', 'kunde', 'uploads'] as const).map(t => <button key={t} onClick={() => setMTab(t)} className={`flex-1 py-2 text-xs font-medium border-b-2 ${mTab === t ? 'border-[var(--brand-secondary)] text-[var(--brand-secondary)]' : 'border-transparent text-gray-400'}`}>{t === 'route' ? (mode === 'onsite' ? 'Erfassung' : 'Route') : t === 'kunde' ? 'Kunde' : 'Uploads'}</button>)}</div>}

      {/* ═══ HAUPTBEREICH ═══ */}
      <div className="flex-1 min-h-0">

        {/* ÜBERSICHT */}
        {mode === 'overview' && <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
          <div className="overflow-y-auto p-4 border-r border-gray-200 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-800">Heutige Termine</span>
              {routeUrl && <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-medium px-2.5 py-1 rounded-lg"><NavigationIcon className="w-3 h-3" /> Alle navigieren</a>}
            </div>
            {termine.length === 0 ? <div className="bg-gray-50 rounded-xl p-10 text-center"><p className="text-gray-400">Keine Termine für heute</p></div>
            : termine.map((t, i) => (
              <div key={t.id}>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-3"><span className="text-lg font-bold text-[var(--brand-secondary)] tabular-nums w-14 shrink-0">{t.uhrzeit}</span><div className="flex-1 min-w-0"><span className="text-sm font-semibold text-gray-900">{t.kunde}</span>{t.kennzeichen && <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.kennzeichen}</span>}<p className="text-xs text-gray-500 truncate mt-0.5">{t.adresse}</p>{t.schadentyp && <span className="text-[9px] bg-[var(--brand-secondary)]/5 text-[var(--brand-secondary)] px-1 py-0.5 rounded mt-0.5 inline-block">{t.schadentyp.toUpperCase()}</span>}</div></div>
                  <div className="flex gap-2 mt-2"><button onClick={() => startNav(t)} className="flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium px-3 py-1.5 rounded-lg"><NavigationIcon className="w-3 h-3" /> Route starten</button>{t.telefon && <PhoneButton nummer={t.telefon} variant="inline" label="Anrufen" className="!flex !items-center !gap-1 !bg-[var(--brand-secondary)]/5 hover:!bg-[var(--brand-secondary)]/10 !text-[var(--brand-primary)] !text-xs !font-medium !px-3 !py-1.5 !rounded-lg" />}<Link href={`/gutachter/fall/${t.id}`} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">Details</Link></div>
                </div>
                {i < termine.length - 1 && <p className="text-[10px] text-gray-400 text-center py-1">↓</p>}
              </div>
            ))}

            {/* ═══ TAGES-TIMELINE ═══ */}
            <TagesTimeline events={tlEvents} selectedDate={selectedDate} isToday={isToday} loading={loading} ersterTermin={termine[0]?.uhrzeit ?? null} onNavigate={(fallId) => router.push(`/gutachter/fall/${fallId}`)} />
          </div>
          <div className="overflow-y-auto p-4 space-y-3 hidden lg:block">
            {auftraege.length > 0 && <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-sm font-semibold text-gray-800 mb-2">Neue Aufträge ({auftraege.length})</p>{auftraege.map(a => <div key={a.id} onClick={() => router.push(`/gutachter/fall/${a.id}`)} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"><div className="flex-1 min-w-0"><p className="text-sm text-gray-900 truncate">{a.kunde}</p><div className="flex gap-1 mt-0.5">{a.kennzeichen && <span className="text-[9px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded">{a.kennzeichen}</span>}{a.schadentyp && <span className="text-[9px] bg-[var(--brand-secondary)]/5 text-[var(--brand-secondary)] px-1 py-0.5 rounded">{a.schadentyp.toUpperCase()}</span>}</div></div></div>)}</div>}
            {tasks.length > 0 && <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-sm font-semibold text-gray-800 mb-2">Heutige Aufgaben ({tasks.length})</p>{tasks.slice(0, 8).map(t => { const overdue = t.faelligAm && new Date(t.faelligAm) < new Date(new Date().toDateString()); return <div key={t.id} onClick={() => t.fallId && router.push(`/gutachter/fall/${t.fallId}`)} className="flex items-center gap-2 py-1.5 cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded px-1"><span className="text-xs text-gray-700 truncate flex-1">{t.titel}</span>{overdue ? <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">Überfällig</span> : <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">Heute</span>}</div> })}</div>}
            {doneTasks.length > 0 && <div className="bg-white border border-gray-200 rounded-lg p-3"><button onClick={() => setShowDone(!showDone)} className="flex items-center gap-2 text-sm font-semibold text-gray-600 w-full"><CheckIcon className="w-4 h-4 text-green-500" /><span>Am {selectedDate.toLocaleDateString('de-DE')} erledigt ({doneTasks.length})</span><span className="ml-auto text-gray-400 text-xs">{showDone ? '▲' : '▼'}</span></button>{showDone && <div className="mt-2 space-y-1">{doneTasks.map(t => <p key={t.id} className="text-xs text-gray-500 flex items-center gap-1.5"><CheckIcon className="w-3 h-3 text-green-400 shrink-0" /><span className="line-through">{t.titel}</span></p>)}</div>}</div>}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/gutachter/faelle" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-[var(--brand-secondary)]/30"><p className="text-lg font-bold text-gray-900">{stats.faelle}/{stats.max}</p><p className="text-[10px] text-gray-500">Fälle</p></Link>
              <Link href="/gutachter/abrechnung" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-[var(--brand-secondary)]/30"><p className="text-lg font-bold text-gray-900">{finanz.eingegangen}€</p><p className="text-[10px] text-gray-500">Eingegangen</p></Link>
            </div>
            {faellig && <Link href={`/gutachter/fall/${faellig.id}`} className="block bg-amber-50 border border-amber-200 rounded-lg p-3 hover:bg-amber-100"><p className="text-xs font-semibold text-amber-700">Gutachten fällig</p><p className="text-sm text-gray-900 mt-0.5">{faellig.kunde}</p></Link>}
            {/* Finanz-Quick */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center"><p className="text-sm font-bold text-green-600">{finanz.eingegangen}€</p><p className="text-[9px] text-gray-500">Eingegangen</p></div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center"><p className="text-sm font-bold text-amber-600">{finanz.offen}€</p><p className="text-[9px] text-gray-500">Offen</p></div>
              <div className="bg-[var(--brand-secondary)]/5 border border-[var(--brand-secondary)]/20 rounded-lg p-2 text-center"><p className="text-sm font-bold text-[var(--brand-secondary)]">{finanz.eingegangen - finanz.leadpreise}€</p><p className="text-[9px] text-gray-500">Saldo</p></div>
            </div>
          </div>
        </div>}

        {/* NAVIGATION + VOR-ORT */}
        {mode !== 'overview' && active && <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
          <div className={`flex flex-col ${mTab === 'kunde' ? 'hidden lg:flex' : ''}`}>
            {mode === 'navigation' && <>{embed ? <iframe src={embed} className="flex-1 w-full border-0" allowFullScreen loading="lazy" /> : <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">Karte nicht verfügbar</div>}<div className="h-16 flex-shrink-0 p-2 border-t border-gray-200 flex gap-2">{navUrl && <a href={navUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg"><NavigationIcon className="w-4 h-4" /> Google Maps</a>}<button onClick={() => setMode('onsite')} className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white text-sm font-medium rounded-lg"><MapPinIcon className="w-4 h-4" /> Bin angekommen</button></div></>}
            {mode === 'onsite' && <div className="flex-1 overflow-y-auto p-4 space-y-3"><p className="text-sm font-semibold text-white">Vor-Ort Dokumentation</p><div className="h-1.5 bg-gray-200 rounded-full"><div className="h-full bg-[var(--brand-secondary)] rounded-full transition-all" style={{ width: `${((fc + (fin.length === 17 ? 1 : 0) + (km ? 1 : 0)) / (FOTO.length + 2)) * 100}%` }} /></div><div className="grid grid-cols-2 gap-2">{FOTO.map(s => <label key={s} className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed cursor-pointer min-h-[48px] ${fotos[s] ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-[var(--brand-secondary)]/30'}`}>{fotos[s] ? <CheckIcon className="w-5 h-5" /> : <CameraIcon className="w-5 h-5" />}<span className="text-sm font-medium">{s}</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFoto(s, e.target.files[0]) }} disabled={uploading} /></label>)}</div><div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2"><div><label className="text-xs text-gray-500 block mb-1">FIN</label><input type="text" value={fin} onChange={e => setFin(e.target.value.toUpperCase().slice(0, 17))} maxLength={17} placeholder="WVWZZZ3CZWE123456" className="w-full bg-white border border-gray-300 text-sm font-mono rounded-lg px-3 py-2 tracking-wider" /></div><div><label className="text-xs text-gray-500 block mb-1">KM-Stand</label><input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="45230" className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2" /></div><div><label className="text-xs text-gray-500 block mb-1">Notizen</label><textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={2} placeholder="Bemerkungen..." className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 resize-none" /></div></div>{/* AAR-355: Fehlende Pflichtdokumente vor Ort einsammeln */}<CockpitPflichtUpload fallId={active.id} /><button onClick={complete} disabled={completing || fc < 4} className="w-full bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary)] disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl min-h-[48px]">{completing ? 'Speichert...' : 'Besichtigung abschließen'}</button>{fc < 4 && <p className="text-gray-400 text-[10px] text-center">Min. 4 Fotos</p>}</div>}
          </div>
          <div className={`overflow-y-auto p-4 space-y-2 border-l border-gray-200 ${mTab !== 'kunde' ? 'hidden lg:block' : ''}`}>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Kunde</p><p className="text-base font-semibold text-gray-900">{active.kunde}</p>{active.telefon && <PhoneButton nummer={active.telefon} variant="inline" label={active.telefon} className="!flex !items-center !gap-1.5 !text-[var(--brand-secondary)] !text-sm !mt-1" />}</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Fahrzeug</p>{active.kennzeichen && <p className="text-sm font-mono font-semibold text-gray-900">{active.kennzeichen}</p>}{active.fahrzeug && <p className="text-xs text-gray-500">{active.fahrzeug}</p>}{active.schadentyp && <span className="text-[10px] bg-[var(--brand-secondary)]/5 text-[var(--brand-secondary)] px-1.5 py-0.5 rounded mt-1 inline-block">{active.schadentyp.toUpperCase()}</span>}</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Termin</p><p className="text-sm text-gray-700">{active.adresse}</p><p className="text-xs text-gray-500 mt-1">{active.uhrzeit} Uhr</p></div>
            {active.telefon && <PhoneButton nummer={active.telefon} variant="inline" label="Kunden anrufen" className="!flex !items-center !justify-center !gap-2 !bg-green-50 hover:!bg-green-100 !text-green-700 !text-sm !font-medium !py-2.5 !rounded-xl !w-full" />}
          </div>
        </div>}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAGES-TIMELINE COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const TL_CFG: Record<string, { dot: string; ico: typeof CalendarIcon; fg: string }> = {
  termin:       { dot: 'bg-[var(--brand-secondary)]', ico: CalendarIcon,       fg: 'text-[var(--brand-secondary)]' },
  'task-offen': { dot: 'bg-amber-500', ico: ClipboardCheckIcon, fg: 'text-amber-500' },
  'task-done':  { dot: 'bg-green-500', ico: CheckIcon,          fg: 'text-green-500' },
  nachricht:    { dot: 'bg-purple-500',ico: MessageCircleIcon,  fg: 'text-purple-500' },
  system:       { dot: 'bg-gray-400',  ico: InfoIcon,           fg: 'text-gray-400' },
  zahlung:      { dot: 'bg-emerald-500',ico: BanknoteIcon,      fg: 'text-emerald-500' },
}

function TagesTimeline({ events, selectedDate, isToday, loading, ersterTermin, onNavigate }: {
  events: TLEvent[]; selectedDate: Date; isToday: boolean; loading: boolean; ersterTermin: string | null; onNavigate: (fallId: string) => void
}) {
  const nowMs = Date.now()
  const todayStart = new Date(new Date().toDateString())
  const isPast = selectedDate < todayStart
  const isFuture = selectedDate > new Date(todayStart.getTime() + 86400000 - 1)

  // JETZT position
  let jetztIdx = -1
  if (isToday && events.length > 0) {
    jetztIdx = events.findIndex(e => new Date(e.zeit).getTime() > nowMs)
    if (jetztIdx === -1) jetztIdx = events.length
  }

  if (events.length === 0 && !loading) {
    return (
      <div className="mt-4 bg-gray-50 rounded-xl p-8 text-center">
        <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500 text-sm font-medium">Heute passiert noch nichts</p>
        {ersterTermin && <p className="text-xs text-gray-400 mt-1">Erster Termin um {ersterTermin}</p>}
      </div>
    )
  }

  if (events.length === 0) return null

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--brand-primary)]">Tagesverlauf</h3>
        {isPast && <span className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Vergangen</span>}
        {isFuture && <span className="text-[9px] bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)] px-2 py-0.5 rounded-full font-medium">Geplant</span>}
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[23px] top-2 bottom-2 w-0.5 bg-gray-200" />

        {events.map((ev, idx) => {
          const cfg = TL_CFG[ev.typ] ?? TL_CFG.system
          const Icon = cfg.ico
          const past = isToday ? new Date(ev.zeit).getTime() < nowMs : isPast

          return (
            <div key={`${ev.typ}-${ev.zeit}-${idx}`}>
              {/* JETZT marker — inserted before the first future event */}
              {isToday && idx === jetztIdx && (
                <div className="flex items-center gap-2 my-2">
                  <div className="w-12 shrink-0" />
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-100 shrink-0 z-10" />
                  <div className="flex-1 h-px bg-red-300" />
                  <span className="text-[9px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">JETZT</span>
                </div>
              )}

              <div
                className={`flex items-start gap-2 py-1.5 group ${past ? 'opacity-50' : ''} ${ev.fallId ? 'cursor-pointer' : ''}`}
                onClick={() => ev.fallId && onNavigate(ev.fallId)}
              >
                {/* Time */}
                <span className="text-xs text-gray-400 tabular-nums w-12 shrink-0 text-right pt-0.5">{ev.uhrzeit}</span>

                {/* Dot on the line */}
                <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ring-2 ring-white mt-1 shrink-0 z-10`} />

                {/* Event card */}
                <div className="flex-1 min-w-0 rounded-lg border border-gray-100 bg-white px-3 py-2 group-hover:shadow-sm group-hover:border-gray-200 transition-all">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${past ? 'text-gray-400' : cfg.fg}`} />
                    <span className="text-xs font-semibold text-[var(--brand-primary)] truncate">{ev.titel}</span>
                  </div>
                  {ev.detail && <p className="text-[11px] text-gray-500 truncate mt-0.5 pl-5">{ev.detail}</p>}
                </div>
              </div>
            </div>
          )
        })}

        {/* JETZT at end when all events are in the past */}
        {isToday && jetztIdx === events.length && (
          <div className="flex items-center gap-2 my-2">
            <div className="w-12 shrink-0" />
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-100 shrink-0 z-10" />
            <div className="flex-1 h-px bg-red-300" />
            <span className="text-[9px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">JETZT</span>
          </div>
        )}
      </div>
    </div>
  )
}
