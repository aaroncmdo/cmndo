// Reine Policy fuer das PWA-Install-Popover — bewusst ohne React/DOM, damit die
// Regeln in vitest (environment: 'node', kein jsdom) getestet werden koennen.
// Der React-Wrapper (components/PwaInstallBanner) liest window/Storage und ruft
// diese Funktionen. Der fruehere Bug lag genau in der Verdrahtung: der
// beforeinstallprompt-Handler rief bedingungslos setShow(true), die Guards liefen
// nur beim Mount -> der Banner poppte bei jedem erneuten Event wieder auf.

export const PWA_DISMISSED_KEY = 'pwa-install-dismissed' // localStorage: dauerhaft weggeklickt
export const PWA_INSTALLED_KEY = 'pwa-install-completed' // localStorage: appinstalled gesehen
export const PWA_SESSION_SHOWN_KEY = 'pwa-install-shown' // sessionStorage: in dieser Session schon gezeigt

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export interface BannerEnv {
  local: StorageLike
  session: StorageLike
  /** true = App laeuft bereits als installierte PWA (display-mode standalone / iOS). */
  isStandalone: boolean
}

/** Darf der Install-Banner in DIESER Session ueberhaupt noch angeboten werden? */
export function canOfferInstall(env: BannerEnv): boolean {
  if (env.isStandalone) return false // laeuft als installierte PWA
  if (env.local.getItem(PWA_INSTALLED_KEY)) return false // schon installiert
  if (env.local.getItem(PWA_DISMISSED_KEY)) return false // dauerhaft weggeklickt
  if (env.session.getItem(PWA_SESSION_SHOWN_KEY)) return false // in dieser Session schon gezeigt
  return true
}

/** Nach dem (einmaligen) Anzeigen markieren — verhindert Re-Pop in derselben Session. */
export function markShown(env: BannerEnv): void {
  env.session.setItem(PWA_SESSION_SHOWN_KEY, '1')
}

/** Dauerhaftes Wegklicken (X) — gilt auch ueber Sessions hinweg. */
export function markDismissed(env: BannerEnv): void {
  env.local.setItem(PWA_DISMISSED_KEY, '1')
  env.session.setItem(PWA_SESSION_SHOWN_KEY, '1')
}

/** appinstalled-Event bzw. akzeptierter Prompt — nie wieder anbieten. */
export function markInstalled(env: BannerEnv): void {
  env.local.setItem(PWA_INSTALLED_KEY, '1')
}
