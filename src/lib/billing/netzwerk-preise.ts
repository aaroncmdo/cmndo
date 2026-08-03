// P5 T2: SSoT fuer die Netzwerkpartner-Preise (config-getrieben, versioniert via
// rechnungs_konfiguration). Fail-loud: fehlende Config-Werte werfen — nie ein stiller
// 0-Preis-Checkout. setupCent=0 ist ein legitimer Waiver (keine Einrichtungsgebuehr).

import { getAktuelleRechnungsKonfig } from './get-rechnungs-konfig'

export type NetzwerkPreise = {
  monatCent: number
  setupCent: number
  konfigId: string
  konfigVersion: number
}

export async function ladeNetzwerkPreise(stichtag: Date = new Date()): Promise<NetzwerkPreise> {
  const konfig = (await getAktuelleRechnungsKonfig(stichtag)) as unknown as {
    id: string
    version: number
    netzwerk_monat_cent: number | null
    netzwerk_setup_cent: number | null
  }
  if (konfig.netzwerk_monat_cent == null || konfig.netzwerk_monat_cent <= 0) {
    throw new Error(
      `[netzwerk-preise] netzwerk_monat_cent fehlt/<=0 in rechnungs_konfiguration (Version ${konfig.version})`,
    )
  }
  if (konfig.netzwerk_setup_cent == null || konfig.netzwerk_setup_cent < 0) {
    throw new Error(
      `[netzwerk-preise] netzwerk_setup_cent fehlt in rechnungs_konfiguration (Version ${konfig.version})`,
    )
  }
  return {
    monatCent: konfig.netzwerk_monat_cent,
    setupCent: konfig.netzwerk_setup_cent,
    konfigId: konfig.id,
    konfigVersion: konfig.version,
  }
}
