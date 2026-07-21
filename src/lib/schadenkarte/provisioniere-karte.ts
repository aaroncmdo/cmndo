// Pure Orchestrierung des Blanko-Karte-Provisionierens: mint -> write -> verify -> finalize.
// Alle Effekte werden injiziert -> node-testbar ohne DOM/NFC. Die React-Komponente liefert
// die realen Effekte (NDEFReader-Adapter + Server-Actions).
import { buildSchadenkarteUrl } from './url'
import { chipTraegtToken } from './nfc'

export type ProvisionEffects = {
  mintToken: () => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  writeAndRead: (
    url: string,
  ) => Promise<{ ok: true; uid: string | null; readBack: string | null } | { ok: false; error: string }>
  finalize: (token: string, nfcUid: string | null, fahrzeugId: string | null) => Promise<{ ok: boolean; error?: string }>
}

export type ProvisionInput = { fahrzeugId: string | null; pendingToken: string | null }

export type ProvisionOutcome =
  | { ok: true; token: string }
  | { ok: false; error: string; retryToken: string | null }

const VERIFY_FEHLER =
  'Die Karte konnte nicht verifiziert werden — sie gilt als nicht beschrieben. Bitte erneut auflegen.'

export async function provisioniereKarte(
  effects: ProvisionEffects,
  input: ProvisionInput,
): Promise<ProvisionOutcome> {
  // 1) Token: bestehenden Versuch wiederverwenden ODER frisch minten (begrenzt verwaiste Zeilen).
  let token = input.pendingToken
  if (!token) {
    const mint = await effects.mintToken()
    if (!mint.ok) return { ok: false, error: mint.error, retryToken: null }
    token = mint.token
  }

  // 2) Schreiben + zurücklesen (overwrite:false steckt in der Effekt-Impl).
  const write = await effects.writeAndRead(buildSchadenkarteUrl(token))
  if (!write.ok) return { ok: false, error: write.error, retryToken: token }

  // 3) Verifizieren: trägt der Chip wirklich UNSEREN Token?
  if (!chipTraegtToken(write.readBack, token)) {
    return { ok: false, error: VERIFY_FEHLER, retryToken: token }
  }

  // 4) Persistieren: uid vermerken (falls gelesen) + optional binden.
  const fin = await effects.finalize(token, write.uid, input.fahrzeugId)
  if (!fin.ok) {
    return { ok: false, error: fin.error ?? 'Speichern fehlgeschlagen. Bitte erneut auflegen.', retryToken: token }
  }

  return { ok: true, token }
}
