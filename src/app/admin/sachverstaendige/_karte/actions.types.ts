// AAR-669-P3: Types getrennt von der `'use server'`-Action-Datei (Memory
// `feedback_use_server_konstanten.md` — Next.js 15 exportiert nur Function-
// Stubs aus `'use server'`, Type-Exports landen als undefined im Client).

export type SvAktiverTerminResult =
  | {
      ok: true
      termin: {
        id: string
        typ: string | null
        startZeit: string
        status: string | null
        fallId: string | null
        fallNummer: string | null
        kundeName: string | null
      }
      ziel: {
        adresse: string
        lat: number
        lng: number
      }
      sv: {
        lat: number
        lng: number
      }
    }
  | { ok: false; reason: 'no_termin' | 'no_fall' | 'no_coords' | 'no_sv' }
