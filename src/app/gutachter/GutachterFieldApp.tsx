'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavigationIcon, PhoneIcon, CameraIcon, CheckIcon, MapPinIcon, SunIcon, CloudIcon, CloudRainIcon, SnowflakeIcon, CloudLightningIcon, CloudFogIcon, FolderOpenIcon, ClipboardListIcon, WalletIcon, UploadIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Termin = { id: string; fallNr: string | null; uhrzeit: string; kunde: string; telefon: string | null; email: string | null; adresse: string; kennzeichen: string | null; fahrzeug: string | null; schadentyp: string | null; status: string }
type NeuerKunde = { id: string; fallNr: string | null; kunde: string; kennzeichen: string | null; schadentyp: string | null; datum: string }
type Task = { id: string; titel: string; faellig: string | null; fallId: string | null }
type Mode = 'overview' | 'navigation' | 'onsite'

const FOTO_SLOTS = ['Vorne', 'Hinten', 'Links', 'Rechts']

function weatherIcon(code: number) {
  if (code === 0) return <SunIcon className="w-4 h-4 text-amber-500" />
  if (code <= 3) return <CloudIcon className="w-4 h-4 text-gray-400" />
  if (code <= 48) return <CloudFogIcon className="w-4 h-4 text-gray-400" />
  if (code <= 67) return <CloudRainIcon className="w-4 h-4 text-blue-500" />
  if (code <= 77) return <SnowflakeIcon className="w-4 h-4 text-blue-300" />
  if (code <= 82) return <CloudRainIcon className="w-4 h-4 text-blue-600" />
  return <CloudLightningIcon className="w-4 h-4 text-yellow-500" />
}

export default function GutachterFieldApp({ greeting, datum, termine, neueKunden, tasks, routeUrl, gutachtenFaellig, stats, svLat, svLng, mapsKey }: {
  greeting: string; datum: string; termine: Termin[]; neueKunden: NeuerKunde[]; tasks: Task[]; routeUrl: string | null
  gutachtenFaellig: { id: string; fallNr: string | null; kunde: string } | null
  stats: { faelle: number; maxFaelle: number; guthaben: number; erledigtMonat: number }
  svLat: number | null; svLng: number | null; mapsKey: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('overview')
  const [activeFall, setActiveFall] = useState<Termin | null>(null)
  const [fotos, setFotos] = useState<Record<string, boolean>>({})
  const [fin, setFin] = useState(''); const [km, setKm] = useState(''); const [notizen, setNotizen] = useState('')
  const [uploading, setUploading] = useState(false); const [completing, setCompleting] = useState(false)
  const [mobileTab, setMobileTab] = useState<'route' | 'kunde' | 'uploads'>('route')
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null)

  useEffect(() => {
    if (!svLat || !svLng) return
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${svLat}&longitude=${svLng}&current=temperature_2m,weathercode&timezone=Europe/Berlin`)
      .then(r => r.json()).then(d => { if (d.current) setWeather({ temp: Math.round(d.current.temperature_2m), code: d.current.weathercode }) }).catch(() => {})
  }, [svLat, svLng])

  function startNav(t: Termin) { setActiveFall(t); setMode('navigation'); setFotos({}); setFin(''); setKm(''); setNotizen('') }

  async function handleFoto(slot: string, file: File) {
    if (!activeFall) return; setUploading(true)
    try {
      const sb = createClient(); const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${activeFall.id}/gutachter-fotos/${slot.toLowerCase()}_${Date.now()}.${ext}`
      await sb.storage.from('dokumente').upload(path, file, { contentType: file.type })
      const { data: { publicUrl } } = sb.storage.from('dokumente').getPublicUrl(path)
      await sb.from('dokumente').insert({ fall_id: activeFall.id, typ: 'schadensfoto', datei_url: publicUrl, datei_name: `${slot}.${ext}`, datei_groesse: file.size, kategorie: 'schadensfotos', hochgeladen_von_rolle: 'sachverstaendiger', quelle: 'gutachter-app' })
      setFotos(p => ({ ...p, [slot]: true }))
    } catch { /* */ } setUploading(false)
  }

  async function complete() {
    if (!activeFall) return; setCompleting(true)
    try {
      const sb = createClient(); const u: Record<string, unknown> = { status: 'besichtigung' }
      if (fin.length === 17) u.fin_vin = fin.toUpperCase()
      await sb.from('faelle').update(u).eq('id', activeFall.id)
      await sb.from('timeline').insert({ fall_id: activeFall.id, typ: 'system', titel: 'Besichtigung abgeschlossen', beschreibung: `${FOTO_SLOTS.filter(s => fotos[s]).length} Fotos, FIN: ${fin || '—'}, KM: ${km || '—'}. ${notizen}`.trim() })
      setMode('overview'); setActiveFall(null); router.refresh()
    } catch { /* */ } setCompleting(false)
  }

  const fc = FOTO_SLOTS.filter(s => fotos[s]).length
  const embedUrl = activeFall && mapsKey && svLat && svLng ? `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${svLat},${svLng}&destination=${encodeURIComponent(activeFall.adresse)}&mode=driving` : null
  const navUrl = activeFall ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeFall.adresse)}` : null

  return (
    <div className="h-full flex flex-col">
      {/* ═══ STICKY TOPBAR ═══ */}
      <div className="h-14 flex items-center justify-between px-4 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-900 truncate">{greeting}</span>
          <span className="text-xs text-gray-400 hidden sm:inline">{datum}</span>
          {mode !== 'overview' && <button onClick={() => { setMode('overview'); setActiveFall(null) }} className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg ml-1">← Übersicht</button>}
        </div>
        {weather && <div className="flex items-center gap-1.5 text-xs text-gray-600">{weatherIcon(weather.code)}<span className="font-semibold">{weather.temp}°C</span></div>}
        <div className="flex items-center gap-2 text-[10px] font-medium shrink-0">
          <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{termine.length} Termine</span>
          <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-full hidden sm:inline">{tasks.length} Tasks</span>
        </div>
      </div>

      {mode !== 'overview' && <div className="flex lg:hidden border-b border-gray-200 shrink-0">{(['route', 'kunde', 'uploads'] as const).map(t => <button key={t} onClick={() => setMobileTab(t)} className={`flex-1 py-2 text-xs font-medium border-b-2 ${mobileTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'}`}>{t === 'route' ? (mode === 'onsite' ? 'Erfassung' : 'Route') : t === 'kunde' ? 'Kunde' : 'Uploads'}</button>)}</div>}

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 min-h-0 flex">

        {/* ─── MODUS 1: ÜBERSICHT ─── */}
        {mode === 'overview' && <>
          {/* LEFT: Tagesplan */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-2 border-r border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-700">{termine.length} Termine heute</span>
              {routeUrl && <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-medium px-2.5 py-1 rounded-lg"><NavigationIcon className="w-3 h-3" /> Alle navigieren</a>}
            </div>
            {termine.length === 0 ? <div className="bg-white border border-gray-200 rounded-xl p-8 text-center"><p className="text-gray-400 text-sm">Keine Termine für heute</p></div>
            : termine.map(t => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-12 text-center"><p className="text-blue-600 text-sm font-bold tabular-nums">{t.uhrzeit}</p></div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/gutachter/fall/${t.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">{t.kunde}</Link>
                    <p className="text-xs text-gray-500 truncate">{t.adresse}</p>
                    {t.kennzeichen && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mt-0.5 inline-block">{t.kennzeichen}</span>}
                  </div>
                  <button onClick={() => startNav(t)} className="shrink-0 flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-medium px-2.5 py-1.5 rounded-lg"><NavigationIcon className="w-3 h-3" /> Route</button>
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT: Widgets */}
          <div className="w-[45%] hidden lg:block overflow-y-auto p-4 space-y-3">
            {/* Neue Kunden */}
            {neueKunden.length > 0 && <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Neue Kunden ({neueKunden.length})</p>
              <div className="space-y-1.5">{neueKunden.map(k => (
                <div key={k.id} onClick={() => router.push(`/gutachter/fall/${k.id}`)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{k.kunde}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {k.kennzeichen && <span className="text-[9px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded">{k.kennzeichen}</span>}
                      {k.schadentyp && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{k.schadentyp.toUpperCase()}</span>}
                      <span className="text-[9px] text-gray-400">{k.datum}</span>
                    </div>
                  </div>
                </div>
              ))}</div>
            </div>}

            {/* Tasks */}
            {tasks.length > 0 && <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Offene Aufgaben ({tasks.length})</p>
              {tasks.slice(0, 5).map(t => (
                <div key={t.id} onClick={() => t.fallId && router.push(`/gutachter/fall/${t.fallId}`)} className="text-xs text-gray-700 hover:text-blue-600 py-1.5 cursor-pointer truncate border-b border-gray-50 last:border-0">{t.titel}</div>
              ))}
            </div>}

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/gutachter/faelle" className="bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-300 transition-colors">
                <p className="text-lg font-bold text-gray-900">{stats.faelle}/{stats.maxFaelle}</p><p className="text-[10px] text-gray-500">Fälle</p>
              </Link>
              <Link href="/gutachter/faelle" className="bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-300 transition-colors">
                <p className="text-lg font-bold text-gray-900">{stats.erledigtMonat}</p><p className="text-[10px] text-gray-500">Monat</p>
              </Link>
              <Link href="/gutachter/profil" className="bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-300 transition-colors">
                <p className="text-lg font-bold text-gray-900">{Math.round((stats.faelle / Math.max(1, stats.maxFaelle)) * 100)}%</p><p className="text-[10px] text-gray-500">Auslastung</p>
              </Link>
              <Link href="/gutachter/abrechnung" className="bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-300 transition-colors">
                <p className="text-lg font-bold text-gray-900">{stats.guthaben}€</p><p className="text-[10px] text-gray-500">Guthaben</p>
              </Link>
            </div>

            {/* Gutachten fällig */}
            {gutachtenFaellig && <Link href={`/gutachter/fall/${gutachtenFaellig.id}`} className="block bg-amber-50 border border-amber-200 rounded-xl p-3 hover:bg-amber-100 transition-colors">
              <p className="text-xs font-semibold text-amber-700">Nächstes Gutachten fällig</p>
              <p className="text-sm text-gray-900 mt-0.5">{gutachtenFaellig.kunde} · {gutachtenFaellig.fallNr ?? ''}</p>
              <span className="text-[10px] text-amber-600 mt-1 inline-block">→ Jetzt hochladen</span>
            </Link>}
          </div>
        </>}

        {/* ─── MODUS 2+3 ─── */}
        {mode !== 'overview' && activeFall && <>
          <div className={`flex-1 min-w-0 flex flex-col ${mobileTab === 'kunde' ? 'hidden lg:flex' : ''}`}>
            {mode === 'navigation' && <>
              {embedUrl ? <iframe src={embedUrl} className="flex-1 w-full border-0" allowFullScreen loading="lazy" /> : <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Karte nicht verfügbar</div>}
              <div className="shrink-0 p-3 border-t border-gray-200 flex gap-2">
                {navUrl && <a href={navUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium py-2.5 rounded-lg"><NavigationIcon className="w-4 h-4" /> Google Maps</a>}
                <button onClick={() => setMode('onsite')} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-lg"><MapPinIcon className="w-4 h-4" /> Bin angekommen</button>
              </div>
            </>}
            {mode === 'onsite' && <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Vor-Ort Dokumentation</p>
              <div className="h-1.5 bg-gray-200 rounded-full"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${((fc + (fin.length === 17 ? 1 : 0) + (km ? 1 : 0)) / (FOTO_SLOTS.length + 2)) * 100}%` }} /></div>
              <div className="grid grid-cols-2 gap-2">{FOTO_SLOTS.map(s => (
                <label key={s} className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed cursor-pointer min-h-[48px] ${fotos[s] ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-blue-300'}`}>
                  {fotos[s] ? <CheckIcon className="w-5 h-5" /> : <CameraIcon className="w-5 h-5" />}<span className="text-sm font-medium">{s}</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFoto(s, e.target.files[0]) }} disabled={uploading} />
                </label>
              ))}</div>
              <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                <div><label className="text-xs text-gray-500 block mb-1">FIN (17 Zeichen)</label><input type="text" value={fin} onChange={e => setFin(e.target.value.toUpperCase().slice(0, 17))} maxLength={17} placeholder="WVWZZZ3CZWE123456" className="w-full bg-white border border-gray-300 text-sm font-mono rounded-lg px-3 py-2 tracking-wider" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Kilometerstand</label><input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="45230" className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Notizen</label><textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={2} placeholder="Bemerkungen..." className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 resize-none" /></div>
              </div>
              <button onClick={complete} disabled={completing || fc < 4} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl min-h-[48px]">{completing ? 'Speichert...' : 'Besichtigung abschliessen'}</button>
              {fc < 4 && <p className="text-gray-400 text-[10px] text-center">Min. 4 Fotos</p>}
            </div>}
          </div>

          {/* RIGHT: Kunden-Info */}
          <div className={`w-[45%] lg:block overflow-y-auto p-4 space-y-2 border-l border-gray-100 ${mobileTab !== 'kunde' ? 'hidden' : 'block w-full'}`}>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Kunde</p>
              <p className="text-base font-semibold text-gray-900">{activeFall.kunde}</p>
              {activeFall.telefon && <a href={`tel:${activeFall.telefon}`} className="flex items-center gap-1.5 text-blue-600 text-sm mt-1"><PhoneIcon className="w-3.5 h-3.5" /> {activeFall.telefon}</a>}
              {activeFall.email && <p className="text-xs text-gray-500 mt-0.5">{activeFall.email}</p>}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Fahrzeug</p>
              {activeFall.kennzeichen && <p className="text-sm font-mono font-semibold text-gray-900">{activeFall.kennzeichen}</p>}
              {activeFall.fahrzeug && <p className="text-xs text-gray-500">{activeFall.fahrzeug}</p>}
              {activeFall.schadentyp && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded mt-1 inline-block">{activeFall.schadentyp.toUpperCase()}</span>}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Termin</p>
              <p className="text-sm text-gray-700">{activeFall.adresse}</p>
              <p className="text-xs text-gray-500 mt-1">{activeFall.uhrzeit} Uhr</p>
            </div>
            {activeFall.telefon && <a href={`tel:${activeFall.telefon}`} className="flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium py-2.5 rounded-xl w-full"><PhoneIcon className="w-4 h-4" /> Kunden anrufen</a>}
          </div>
        </>}
      </div>
    </div>
  )
}
