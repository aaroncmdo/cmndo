// AAR-939 · Monika-Embed · Stream 4 — Shadow-DOM-Styles
//
// Alle Styles leben im Shadow-DOM → kein Leak auf die Host-Seite + keine
// Tailwind-CDN-Abhaengigkeit. Marken-Farben aus CSS-Custom-Properties
// (--monika-primary/accent/text), die das Widget je nach Theme setzt.

export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }

.fab {
  position: fixed; bottom: 20px; right: 20px; z-index: 9999;
  width: 60px; height: 60px; border-radius: 50%;
  background: var(--monika-primary); color: #fff;
  border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.25);
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease;
}
.fab:hover { transform: scale(1.06); }
.fab:focus-visible { outline: 3px solid var(--monika-accent); outline-offset: 2px; }
.fab img { width: 34px; height: 34px; object-fit: contain; }

.panel {
  position: fixed; bottom: 20px; right: 20px; z-index: 9999;
  width: 340px; max-width: calc(100vw - 32px);
  background: #fff; border-radius: 16px; overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,.28);
  display: flex; flex-direction: column;
  animation: monika-in .18s ease;
}
@keyframes monika-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

.head { background: var(--monika-primary); color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
.head img { width: 26px; height: 26px; object-fit: contain; }
.head .title { font-weight: 600; font-size: 15px; flex: 1; }
.close { background: none; border: none; color: #fff; cursor: pointer; font-size: 20px; line-height: 1; padding: 4px; border-radius: 6px; }
.close:focus-visible { outline: 2px solid var(--monika-accent); }

.body { padding: 16px; color: var(--monika-text); }
.body p.q { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
.body p.sub { font-size: 13px; opacity: .75; margin: 0 0 14px; }

.opt {
  display: block; width: 100%; text-align: left; padding: 12px 14px; margin-bottom: 8px;
  background: #f8f9fb; border: 1px solid #e5e9f0; border-radius: 10px;
  font-size: 14px; color: var(--monika-text); cursor: pointer; transition: border-color .12s, background .12s;
}
.opt:hover { border-color: var(--monika-accent); background: #fff; }
.opt:focus-visible { outline: 2px solid var(--monika-accent); outline-offset: 1px; }

label.fld { display: block; font-size: 13px; font-weight: 600; margin: 10px 0 4px; }
input.inp { width: 100%; padding: 10px 12px; font-size: 14px; border: 1px solid #d8deea; border-radius: 8px; color: var(--monika-text); }
input.inp:focus { outline: none; border-color: var(--monika-accent); }

.consent { display: flex; gap: 8px; align-items: flex-start; margin: 14px 0 4px; font-size: 12px; opacity: .85; }
.consent input { margin-top: 2px; }
.consent a { color: var(--monika-accent); }

.cta { width: 100%; padding: 12px; margin-top: 12px; background: var(--monika-primary); color: #fff; font-weight: 600; font-size: 15px; border: none; border-radius: 10px; cursor: pointer; }
.cta:disabled { opacity: .5; cursor: not-allowed; }
.cta:focus-visible { outline: 3px solid var(--monika-accent); outline-offset: 2px; }

.err { color: #c0392b; font-size: 13px; margin-top: 8px; }

.success-ico { font-size: 40px; text-align: center; margin: 8px 0; }
.wa { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; margin-top: 12px; background: #25D366; color: #fff; font-weight: 600; font-size: 14px; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; }

.powered { padding: 8px 16px; text-align: center; font-size: 11px; background: #f8f9fb; border-top: 1px solid #eef1f6; }
.powered a { color: var(--monika-accent); text-decoration: none; }

.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
`
