'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavigationIcon, PhoneIcon, CameraIcon, CheckIcon, MapPinIcon, ArrowLeftIcon, SunIcon, CloudIcon, CloudRainIcon, SnowflakeIcon, CloudLightningIcon, CloudFogIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Termin = { id: string; uhrzeit: string; kunde: string; telefon: string | null; email: string | null; adresse: string; kennzeichen: string | null; fahrzeug: string | null; schadentyp: string | null }
type Auftrag = { id: string; kunde: string; kennzeichen: string | null; schadentyp: string | null; datum: string }
type Task = { id: string; titel: string; fallId: string | null }
type Mode = 'overview' | 'navigation' | 'onsite'
type HourW = { hour: number; temp: number; code: number }

const FOTO = ['Vorne', 'Hinten', 'Links', 'Rechts']
function wEmoji(c: number) { return c === 0 ? '☀️' : c <= 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️' }
function wGrad(c: number) { return c >= 61 ? 'from-gray-700 to-gray-500' : c >= 45 ? 'from-gray-500 to-gray-400' : c <= 3 ? 'from-blue-500 to-sky-400' : 'from-gray-400 to-gray-300' }
function wTip(c: number, t: number) { return c >= 95 ? 'Vorsicht, Gewitter!' : c >= 71 ? 'Straßen können glatt sein!' : c >= 61 ? 'Regenjacke einpacken!' : t > 30 ? 'Wasser mitnehmen!' : t < 5 ? 'Warm anziehen!' : 'Perfektes Gutachter-Wetter!' }
function wLabel(c: number) { return c === 0 ? 'Sonnig' : c <= 3 ? 'Bewölkt' : c <= 48 ? 'Nebel' : c <= 67 ? 'Regen' : c <= 77 ? 'Schnee' : c <= 82 ? 'Schauer' : 'Gewitter' }

export default function GutachterCockpit() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState(''); const [datum, setDatum] = useState('')
  const [termine, setTermine] = useState<Termin[]>([]); const [auftraege, setAuftraege] = useState<Auftrag[]>([]); const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState({ faelle: 0, max: 25, guthaben: 0, monat: 0 })
  const [routeUrl, setRouteUrl] = useState<string | null>(null)
  const [faellig, setFaellig] = useState<{ id: string; kunde: string } | null>(null)
  const [finanz, setFinanz] = useState({ eingegangen: 0, offen: 0, leadpreise: 0 })
  const [svLat, setSvLat] = useState<number | null>(null); const [svLng, setSvLng] = useState<number | null>(null)
  const [weather, setWeather] = useState<{ temp: number; code: number; hourly: HourW[] } | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [mode, setMode] = useState<Mode>('overview'); const [active, setActive] = useState<Termin | null>(null)
  const [fotos, setFotos] = useState<Record<string, boolean>>({}); const [fin, setFin] = useState(''); const [km, setKm] = useState(''); const [notizen, setNotizen] = useState('')
  const [uploading, setUploading] = useState(false); const [completing, setCompleting] = useState(false)
  const [mTab, setMTab] = useState<'route' | 'kunde' | 'uploads'>('route')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    let { data: sv } = await supabase.from('sachverstaendige').select('id, standort_lat, standort_lng, paket_faelle_genutzt, paket_faelle_gesamt, guthaben, offene_faelle, max_faelle_monat').eq('profile_id', user.id).single()
    if (!sv) { const r = await supabase.from('sachverstaendige').select('id, standort_lat, standort_lng, paket_faelle_genutzt, paket_faelle_gesamt, guthaben, offene_faelle, max_faelle_monat').eq('user_id', user.id).single(); sv = r.data }
    if (!sv) { setLoading(false); return }
    const { data: p } = await supabase.from('profiles').select('vorname').eq('id', user.id).single()
    const now = new Date(); const h = now.getHours()
    setGreeting(`${h < 12 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'}${p?.vorname ? ` ${p.vorname}` : ''}`)
    const isToday = selectedDate.toDateString() === now.toDateString()
    setDatum(isToday ? `HEUTE ${selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}` : selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }))
    setSvLat(sv.standort_lat ? Number(sv.standort_lat) : null); setSvLng(sv.standort_lng ? Number(sv.standort_lng) : null)
    setStats({ faelle: sv.offene_faelle ?? sv.paket_faelle_genutzt ?? 0, max: sv.max_faelle_monat ?? sv.paket_faelle_gesamt ?? 25, guthaben: typeof sv.guthaben === 'number' ? sv.guthaben : 0, monat: 0 })

    const ds = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).toISOString()
    const de = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1).toISOString()

    const [tR, nR, tkR, fR] = await Promise.all([
      supabase.from('faelle').select('id, fall_nummer, schadens_adresse, schadens_plz, schadens_ort, sv_termin, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadenfall_typ').eq('sv_id', sv.id).gte('sv_termin', ds).lt('sv_termin', de).not('status', 'in', '("abgeschlossen","storniert")').order('sv_termin', { ascending: true }),
      supabase.from('faelle').select('id, lead_id, kennzeichen, schadenfall_typ, created_at').eq('sv_id', sv.id).is('sv_termin', null).not('status', 'in', '("abgeschlossen","storniert")').limit(10),
      supabase.from('tasks').select('id, titel, fall_id').or(`zugewiesen_an.eq.${user.id},empfaenger_user_id.eq.${user.id}`).in('status', ['offen', 'in-arbeit']).lte('faellig_am', de).limit(15),
      supabase.from('faelle').select('id, lead_id').eq('sv_id', sv.id).not('sv_termin', 'is', null).lt('sv_termin', now.toISOString()).is('gutachten_eingegangen_am', null).not('status', 'in', '("abgeschlossen","storniert")').limit(1),
    ])

    const ids = [...new Set([...(tR.data ?? []), ...(nR.data ?? []), ...(fR.data ?? [])].map(f => f.lead_id).filter(Boolean) as string[])]
    let lm: Record<string, { n: string; t: string | null; e: string | null }> = {}
    if (ids.length) { const { data: ls } = await supabase.from('leads').select('id, vorname, nachname, telefon, email').in('id', ids); for (const l of ls ?? []) lm[l.id] = { n: [l.vorname, l.nachname].filter(Boolean).join(' ') || '—', t: l.telefon, e: l.email } }

    setTermine((tR.data ?? []).map(f => ({ id: f.id, uhrzeit: f.sv_termin ? new Date(f.sv_termin).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—', kunde: lm[f.lead_id ?? '']?.n ?? '—', telefon: lm[f.lead_id ?? '']?.t ?? null, email: lm[f.lead_id ?? '']?.e ?? null, adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '), kennzeichen: f.kennzeichen ?? null, fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || null, schadentyp: f.schadenfall_typ ?? null })))
    setAuftraege((nR.data ?? []).map(f => ({ id: f.id, kunde: lm[f.lead_id ?? '']?.n ?? '—', kennzeichen: f.kennzeichen ?? null, schadentyp: f.schadenfall_typ ?? null, datum: f.created_at ? new Date(f.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '' })))
    setTasks((tkR.data ?? []).map(t => ({ id: t.id, titel: t.titel, fallId: t.fall_id })))
    const ff = (fR.data ?? [])[0]; setFaellig(ff ? { id: ff.id, kunde: lm[ff.lead_id ?? '']?.n ?? '—' } : null)

    const stops = (tR.data ?? []).map(f => [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', ')).filter(Boolean)
    setRouteUrl(stops.length ? `https://www.google.com/maps/dir/${stops.map(s => encodeURIComponent(s)).join('/')}` : null)

    // Finanz quick
    const { data: cf } = await supabase.from('faelle').select('gutachten_betrag, status').eq('sv_id', sv.id).not('gutachten_betrag', 'is', null)
    const ein = (cf ?? []).filter(f => ['abgeschlossen', 'regulierung'].includes(f.status)).reduce((s, f) => s + Number(f.gutachten_betrag ?? 0) * 0.12, 0)
    const off = (cf ?? []).filter(f => !['abgeschlossen', 'storniert'].includes(f.status)).reduce((s, f) => s + Number(f.gutachten_betrag ?? 0) * 0.12, 0)
    setFinanz({ eingegangen: Math.round(ein), offen: Math.round(off), leadpreise: 0 })

    // Weather
    if (sv.standort_lat && sv.standort_lng) {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${sv.standort_lat}&longitude=${sv.standort_lng}&current=temperature_2m,weathercode&hourly=temperature_2m,weathercode&timezone=Europe/Berlin&forecast_days=1`)
        .then(r => r.json()).then(d => { if (!d.current) return; const hr = (d.hourly?.time ?? []).map((t: string, i: number) => ({ hour: new Date(t).getHours(), temp: Math.round(d.hourly.temperature_2m[i]), code: d.hourly.weathercode[i] })).filter((h: HourW) => h.hour >= 8 && h.hour <= 18); setWeather({ temp: Math.round(d.current.temperature_2m), code: d.current.weathercode, hourly: hr }) }).catch(() => {})
    }
    setLoading(false)
  }, [supabase, selectedDate])

  useEffect(() => { load() }, [load])

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  function startNav(t: Termin) { if (!isToday) return; setActive(t); setMode('navigation'); setFotos({}); setFin(''); setKm(''); setNotizen(''); setMTab('route') }

  async function handleFoto(slot: string, file: File) { if (!active) return; setUploading(true); try { const ext = file.name.split('.').pop() ?? 'jpg'; const path = `${active.id}/gutachter-fotos/${slot.toLowerCase()}_${Date.now()}.${ext}`; await supabase.storage.from('dokumente').upload(path, file, { contentType: file.type }); const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path); await supabase.from('dokumente').insert({ fall_id: active.id, typ: 'schadensfoto', datei_url: publicUrl, datei_name: `${slot}.${ext}`, datei_groesse: file.size, kategorie: 'schadensfotos', hochgeladen_von_rolle: 'sachverstaendiger', quelle: 'gutachter-app' }); setFotos(p => ({ ...p, [slot]: true })) } catch { /* */ } setUploading(false) }

  async function complete() { if (!active) return; setCompleting(true); try { const u: Record<string, unknown> = { status: 'besichtigung' }; if (fin.length === 17) u.fin_vin = fin.toUpperCase(); await supabase.from('faelle').update(u).eq('id', active.id); await supabase.from('timeline').insert({ fall_id: active.id, typ: 'system', titel: 'Besichtigung abgeschlossen', beschreibung: `${FOTO.filter(s => fotos[s]).length} Fotos, FIN: ${fin || '—'}, KM: ${km || '—'}` }); setMode('overview'); setActive(null); load() } catch { /* */ } setCompleting(false) }

  const fc = FOTO.filter(s => fotos[s]).length
  const mk = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const embed = active && mk && svLat && svLng ? `https://www.google.com/maps/embed/v1/directions?key=${mk}&origin=${svLat},${svLng}&destination=${encodeURIComponent(active.adresse)}&mode=driving` : null
  const navUrl = active ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(active.adresse)}` : null

  if (loading) return <div className="h-[calc(100vh-64px)] flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div style={{ height: 'calc(100vh - 64px)' }} className="overflow-hidden flex flex-col">

      {/* ═══ WETTER-BANNER ═══ */}
      {weather && (
        <div className={`flex-shrink-0 px-4 py-3 flex items-center gap-4 bg-gradient-to-r ${wGrad(weather.code)} text-white`} style={{ minHeight: 80 }}>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-4xl">{wEmoji(weather.code)}</span>
            <div><p className="text-2xl font-bold">{weather.temp}°C</p><p className="text-xs opacity-80">{wLabel(weather.code)}</p></div>
          </div>
          <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0">
            {weather.hourly.filter((_, i) => i % 2 === 0).map(h => (
              <div key={h.hour} className="text-center shrink-0 px-1"><p className="text-[9px] opacity-60">{String(h.hour).padStart(2, '0')}h</p><p className="text-[10px]">{wEmoji(h.code)}</p><p className="text-xs font-semibold">{h.temp}°</p></div>
            ))}
          </div>
          <div className="shrink-0 text-right hidden sm:block"><p className="text-sm font-medium">Gute Fahrt!</p><p className="text-[10px] opacity-80">{wTip(weather.code, weather.temp)}</p></div>
        </div>
      )}

      {/* ═══ STATS-LEISTE ═══ */}
      <div className="h-10 flex items-center justify-between px-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          {mode !== 'overview' && <button onClick={() => { setMode('overview'); setActive(null) }} className="text-gray-400 hover:text-gray-600 mr-1"><ArrowLeftIcon className="w-4 h-4" /></button>}
          <span className="text-sm font-semibold text-gray-900">{greeting}</span>
          {/* Tages-Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))} className="text-gray-400 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 text-xs">◀</button>
            <button onClick={() => setSelectedDate(new Date())} className="text-xs text-gray-500 hover:text-gray-800 px-1.5 py-0.5 rounded hover:bg-gray-100">{datum}</button>
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))} className="text-gray-400 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 text-xs">▶</button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-medium">
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{termine.length} Termine</span>
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full hidden sm:inline">{tasks.length} Tasks</span>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full hidden md:inline">{stats.faelle}/{stats.max}</span>
        </div>
      </div>

      {/* Mobile tabs */}
      {mode !== 'overview' && <div className="flex lg:hidden border-b border-gray-200 flex-shrink-0">{(['route', 'kunde', 'uploads'] as const).map(t => <button key={t} onClick={() => setMTab(t)} className={`flex-1 py-2 text-xs font-medium border-b-2 ${mTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'}`}>{t === 'route' ? (mode === 'onsite' ? 'Erfassung' : 'Route') : t === 'kunde' ? 'Kunde' : 'Uploads'}</button>)}</div>}

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
                  <div className="flex items-center gap-3"><span className="text-lg font-bold text-blue-600 tabular-nums w-14 shrink-0">{t.uhrzeit}</span><div className="flex-1 min-w-0"><span className="text-sm font-semibold text-gray-900">{t.kunde}</span>{t.kennzeichen && <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.kennzeichen}</span>}<p className="text-xs text-gray-500 truncate mt-0.5">{t.adresse}</p>{t.schadentyp && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded mt-0.5 inline-block">{t.schadentyp.toUpperCase()}</span>}</div></div>
                  <div className="flex gap-2 mt-2"><button onClick={() => startNav(t)} className="flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium px-3 py-1.5 rounded-lg"><NavigationIcon className="w-3 h-3" /> Route starten</button>{t.telefon && <a href={`tel:${t.telefon}`} className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-lg"><PhoneIcon className="w-3 h-3" /> Anrufen</a>}<Link href={`/gutachter/fall/${t.id}`} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">Details</Link></div>
                </div>
                {i < termine.length - 1 && <p className="text-[10px] text-gray-400 text-center py-1">↓</p>}
              </div>
            ))}
          </div>
          <div className="overflow-y-auto p-4 space-y-3 hidden lg:block">
            {auftraege.length > 0 && <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-sm font-semibold text-gray-800 mb-2">Neue Aufträge ({auftraege.length})</p>{auftraege.map(a => <div key={a.id} onClick={() => router.push(`/gutachter/fall/${a.id}`)} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"><div className="flex-1 min-w-0"><p className="text-sm text-gray-900 truncate">{a.kunde}</p><div className="flex gap-1 mt-0.5">{a.kennzeichen && <span className="text-[9px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded">{a.kennzeichen}</span>}{a.schadentyp && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{a.schadentyp.toUpperCase()}</span>}</div></div></div>)}</div>}
            {tasks.length > 0 && <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-sm font-semibold text-gray-800 mb-2">Heutige Aufgaben ({tasks.length})</p>{tasks.slice(0, 5).map(t => <div key={t.id} onClick={() => t.fallId && router.push(`/gutachter/fall/${t.fallId}`)} className="text-xs text-gray-700 hover:text-blue-600 py-1.5 cursor-pointer truncate border-b border-gray-50 last:border-0">{t.titel}</div>)}</div>}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/gutachter/faelle" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-blue-300"><p className="text-lg font-bold text-gray-900">{stats.faelle}/{stats.max}</p><p className="text-[10px] text-gray-500">Fälle</p></Link>
              <Link href="/gutachter/abrechnung" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-blue-300"><p className="text-lg font-bold text-gray-900">{stats.guthaben}€</p><p className="text-[10px] text-gray-500">Guthaben</p></Link>
            </div>
            {faellig && <Link href={`/gutachter/fall/${faellig.id}`} className="block bg-amber-50 border border-amber-200 rounded-lg p-3 hover:bg-amber-100"><p className="text-xs font-semibold text-amber-700">Gutachten fällig</p><p className="text-sm text-gray-900 mt-0.5">{faellig.kunde}</p></Link>}
            {/* Finanz-Quick */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center"><p className="text-sm font-bold text-green-600">{finanz.eingegangen}€</p><p className="text-[9px] text-gray-500">Eingegangen</p></div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center"><p className="text-sm font-bold text-amber-600">{finanz.offen}€</p><p className="text-[9px] text-gray-500">Offen</p></div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center"><p className="text-sm font-bold text-blue-600">{finanz.eingegangen - finanz.leadpreise}€</p><p className="text-[9px] text-gray-500">Saldo</p></div>
            </div>
          </div>
        </div>}

        {/* NAVIGATION + VOR-ORT */}
        {mode !== 'overview' && active && <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
          <div className={`flex flex-col ${mTab === 'kunde' ? 'hidden lg:flex' : ''}`}>
            {mode === 'navigation' && <>{embed ? <iframe src={embed} className="flex-1 w-full border-0" allowFullScreen loading="lazy" /> : <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">Karte nicht verfügbar</div>}<div className="h-16 flex-shrink-0 p-2 border-t border-gray-200 flex gap-2">{navUrl && <a href={navUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg"><NavigationIcon className="w-4 h-4" /> Google Maps</a>}<button onClick={() => setMode('onsite')} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg"><MapPinIcon className="w-4 h-4" /> Bin angekommen</button></div></>}
            {mode === 'onsite' && <div className="flex-1 overflow-y-auto p-4 space-y-3"><p className="text-sm font-semibold text-gray-900">Vor-Ort Dokumentation</p><div className="h-1.5 bg-gray-200 rounded-full"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${((fc + (fin.length === 17 ? 1 : 0) + (km ? 1 : 0)) / (FOTO.length + 2)) * 100}%` }} /></div><div className="grid grid-cols-2 gap-2">{FOTO.map(s => <label key={s} className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed cursor-pointer min-h-[48px] ${fotos[s] ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-blue-300'}`}>{fotos[s] ? <CheckIcon className="w-5 h-5" /> : <CameraIcon className="w-5 h-5" />}<span className="text-sm font-medium">{s}</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFoto(s, e.target.files[0]) }} disabled={uploading} /></label>)}</div><div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2"><div><label className="text-xs text-gray-500 block mb-1">FIN</label><input type="text" value={fin} onChange={e => setFin(e.target.value.toUpperCase().slice(0, 17))} maxLength={17} placeholder="WVWZZZ3CZWE123456" className="w-full bg-white border border-gray-300 text-sm font-mono rounded-lg px-3 py-2 tracking-wider" /></div><div><label className="text-xs text-gray-500 block mb-1">KM-Stand</label><input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="45230" className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2" /></div><div><label className="text-xs text-gray-500 block mb-1">Notizen</label><textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={2} placeholder="Bemerkungen..." className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 resize-none" /></div></div><button onClick={complete} disabled={completing || fc < 4} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl min-h-[48px]">{completing ? 'Speichert...' : 'Besichtigung abschliessen'}</button>{fc < 4 && <p className="text-gray-400 text-[10px] text-center">Min. 4 Fotos</p>}</div>}
          </div>
          <div className={`overflow-y-auto p-4 space-y-2 border-l border-gray-200 ${mTab !== 'kunde' ? 'hidden lg:block' : ''}`}>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Kunde</p><p className="text-base font-semibold text-gray-900">{active.kunde}</p>{active.telefon && <a href={`tel:${active.telefon}`} className="flex items-center gap-1.5 text-blue-600 text-sm mt-1"><PhoneIcon className="w-3.5 h-3.5" /> {active.telefon}</a>}</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Fahrzeug</p>{active.kennzeichen && <p className="text-sm font-mono font-semibold text-gray-900">{active.kennzeichen}</p>}{active.fahrzeug && <p className="text-xs text-gray-500">{active.fahrzeug}</p>}{active.schadentyp && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded mt-1 inline-block">{active.schadentyp.toUpperCase()}</span>}</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Termin</p><p className="text-sm text-gray-700">{active.adresse}</p><p className="text-xs text-gray-500 mt-1">{active.uhrzeit} Uhr</p></div>
            {active.telefon && <a href={`tel:${active.telefon}`} className="flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium py-2.5 rounded-xl w-full"><PhoneIcon className="w-4 h-4" /> Kunden anrufen</a>}
          </div>
        </div>}
      </div>
    </div>
  )
}
