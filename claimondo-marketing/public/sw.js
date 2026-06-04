/* Kill-switch service worker — claimondo.de (Marketing-Standalone).
 *
 * Diese Marketing-App nutzt KEINEN Service Worker (PWA bleibt App-only, siehe
 * app/[locale]/layout.tsx). Ein frueherer claimondo.de-Deploy hat jedoch einen
 * SW registriert, der nach dem Umstieg auf den Next-Standalone-Build verwaiste:
 * sein fetch-Handler (sw.js:71) warf "Failed to fetch" und liess den FetchEvent
 * fuer "/" als Network-Error scheitern -> die Seite lud fuer wiederkehrende
 * Besucher nicht mehr, und der Update-Check auf /sw.js lieferte 404 (Console).
 *
 * Dieser SW ersetzt den Altbestand beim naechsten Update-Check des Browsers,
 * deregistriert sich selbst, loescht alle Caches und laedt kontrollierte Clients
 * neu -> danach ist der Origin SW-frei. Das File darf bleiben: neue Besucher
 * fordern /sw.js nie an (nichts registriert es), nur Browser mit Altbestand.
 */
self.addEventListener('install', function () {
  // Sofort aktivieren, nicht auf Tab-Schliessung warten.
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      // 1. Alle Caches des Altbestands loeschen.
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map(function (k) { return caches.delete(k) }))
      } catch (e) { /* caches-API evtl. nicht verfuegbar -> ignorieren */ }

      // 2. Diese Registrierung entfernen -> Origin ist danach SW-frei.
      try {
        await self.registration.unregister()
      } catch (e) { /* ignorieren */ }

      // 3. Offene Tabs neu laden, jetzt ohne SW-Interception (fixt die kaputte
      //    Navigation sofort statt erst beim naechsten manuellen Reload).
      try {
        const clients = await self.clients.matchAll({ type: 'window' })
        clients.forEach(function (c) {
          if ('navigate' in c) { c.navigate(c.url) }
        })
      } catch (e) { /* ignorieren */ }
    })(),
  )
})
