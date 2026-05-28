// Gepflegte Cookie-/Storage-Deklaration (DSGVO). Bei neuen Tracking-Tools ergaenzen.
export type CookieRow = { name: string; provider: string; purpose: string; duration: string }
export const COOKIE_DECLARATION: Record<'necessary' | 'analytics' | 'ads', CookieRow[]> = {
  necessary: [
    { name: 'cc_cookie', provider: 'Claimondo', purpose: 'Speichert die Consent-Auswahl', duration: '6 Monate' },
  ],
  analytics: [
    { name: '_ga, _ga_*', provider: 'Google Analytics 4', purpose: 'Statistik/Reichweitenmessung', duration: 'bis 2 Jahre' },
    { name: '_clck, _clsk', provider: 'Microsoft Clarity', purpose: 'Session-Analyse/Heatmaps', duration: 'bis 1 Jahr' },
  ],
  ads: [
    { name: '_gcl_*', provider: 'Google Ads', purpose: 'Conversion-Messung', duration: 'bis 90 Tage' },
  ],
}
