// Tarifliste-Lookup -> Befund fuer die Berater-API (pure). Die Bindung rechnet leiteWerkstattbindungAb (Phase 1,
// dieselbe Regel wie im FlowLink): Marke > Tarif > unbekannt. Ohne Tarif bei wb_status='optional' bleibt es
// 'unbekannt' — nie raten. Mehrdeutige Marke/Tarif -> Kandidaten fuer die Rueckfrage.

import { leiteWerkstattbindungAb } from '@/lib/kasko-wb/werkstattbindung'
import type { LookupErgebnis } from '@/lib/kasko-wb/lookup'
import type { KaskoTarifBefund, Werkstattbindung } from './pruefe-anspruch'

function zuWerkstattbindung(frei: boolean | null): Werkstattbindung {
  return frei === false ? 'ja' : frei === true ? 'nein' : 'unbekannt'
}

export function zuBefund(e: LookupErgebnis, versicherer: string, tarif: string | null): KaskoTarifBefund {
  if (e.status === 'nicht_gefunden') {
    return { versicherer, tarif, werkstattbindung: 'unbekannt', bindungsumfang: null, verlaesslichkeit: null, kandidaten: [], stand: null }
  }
  if (e.status === 'mehrdeutig') {
    return {
      versicherer,
      tarif,
      werkstattbindung: 'unbekannt',
      bindungsumfang: null,
      verlaesslichkeit: null,
      kandidaten: e.kandidaten.map((k) => k.marke),
      stand: e.kandidaten[0]?.stand ?? null,
    }
  }
  const ergebnis = leiteWerkstattbindungAb({
    wbStatus: e.marke.wbStatus,
    tarif: e.tarif ? { hatWerkstattbindung: e.tarif.hatWerkstattbindung, bindungsumfang: e.tarif.bindungsumfang } : null,
    markerAntwort: null,
    schadenIstGlas: false,
  })
  return {
    versicherer: e.marke.marke,
    tarif: e.tarif?.anzeigename ?? null,
    werkstattbindung: zuWerkstattbindung(ergebnis.freieWerkstattwahl),
    bindungsumfang: e.tarif?.bindungsumfang ?? null,
    verlaesslichkeit: e.tarif?.verlaesslichkeit ?? null,
    // Kandidaten nur, wenn die Bindung offen bleibt — bei Marke 'standard'/'keine' ist sie unabhaengig vom Tarif klar.
    kandidaten: ergebnis.freieWerkstattwahl === null && e.tarifStatus !== 'gefunden' ? e.tarifKandidaten.map((t) => t.anzeigename) : [],
    stand: e.marke.stand,
  }
}
