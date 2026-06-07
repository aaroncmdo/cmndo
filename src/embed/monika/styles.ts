// AAR-939 · Monika-A-Flow · Shadow-DOM-Chat-Styles. Claimondo-Tokens via
// --monika-primary(navy)/accent(ondo)/text. Light, mobile-first.
export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }

.mk-fab { position: fixed; bottom: 20px; right: 20px; z-index: 9999; width: 62px; height: 62px;
  border-radius: 50%; background: var(--monika-primary); border: none; cursor: pointer;
  box-shadow: 0 6px 20px rgba(13,27,62,.32); display: flex; align-items: center; justify-content: center;
  padding: 0; overflow: hidden; transition: transform .18s cubic-bezier(.22,1,.36,1); }
.mk-fab:hover { transform: scale(1.06); }
.mk-fab:focus-visible { outline: 3px solid var(--monika-accent); outline-offset: 2px; }
.mk-seal { width: 100%; height: 100%; display: block; }
.mk-seal svg { width: 100%; height: 100%; display: block; }
.mk-fab img { width: 36px; height: 36px; object-fit: contain; }

.mk-panel { position: fixed; bottom: 20px; right: 20px; z-index: 9999; width: 380px;
  max-width: calc(100vw - 24px); height: 600px; max-height: calc(100vh - 40px);
  background: #f8f9fb; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 12px 48px rgba(13,27,62,.30); animation: mk-in .22s cubic-bezier(.22,1,.36,1); }
@keyframes mk-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@media (max-width: 480px) { .mk-panel { width: 100vw; max-width: 100vw; height: 88vh; max-height: 88vh;
  right: 0; bottom: 0; border-radius: 18px 18px 0 0; } }

.mk-head { background: var(--monika-primary); color: #fff; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
.mk-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
.mk-head-meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.mk-name { font-weight: 700; font-size: 15px; line-height: 1.2; }
.mk-role { font-size: 11.5px; opacity: .85; }
.mk-close { background: rgba(255,255,255,.14); border: none; color: #fff; cursor: pointer; font-size: 19px; line-height: 1;
  width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background .12s; }
.mk-close:hover { background: rgba(255,255,255,.28); }
.mk-close:focus-visible { outline: 2px solid var(--monika-accent); outline-offset: 1px; }
.mk-mute { background: none; border: none; color: #fff; cursor: pointer; font-size: 15px; line-height: 1; padding: 4px; border-radius: 6px; opacity: .85; }
.mk-mute:hover { opacity: 1; }
.mk-mute:focus-visible { outline: 2px solid var(--monika-accent); }

.mk-chat { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.mk-row { display: flex; align-items: flex-end; gap: 6px; max-width: 100%; }
.mk-row-user { justify-content: flex-end; }
.mk-mini { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
.mk-bubble { padding: 9px 13px; border-radius: 15px; font-size: 14.5px; line-height: 1.4; max-width: 78%; word-wrap: break-word; }
.mk-bubble-monika { background: #fff; color: var(--monika-text); border: 1px solid #e8ecf3; border-bottom-left-radius: 5px; }
.mk-bubble-user { background: var(--monika-accent); color: #fff; border-bottom-right-radius: 5px; }

.mk-typing { display: flex; gap: 4px; align-items: center; }
.mk-typing span { width: 6px; height: 6px; border-radius: 50%; background: #b8c2d4; animation: mk-blink 1.2s infinite; }
.mk-typing span:nth-child(2) { animation-delay: .2s; } .mk-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes mk-blink { 0%,60%,100% { opacity: .3; } 30% { opacity: 1; } }

.mk-choices, .mk-actions, .mk-form { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.mk-chip { text-align: left; padding: 12px 14px; background: #fff; border: 1.5px solid var(--monika-accent);
  border-radius: 12px; font-size: 14.5px; color: var(--monika-primary); font-weight: 500; cursor: pointer;
  transition: background .12s, transform .08s; }
.mk-chip:hover { background: #eef3f9; } .mk-chip:active { transform: scale(.98); }
.mk-chip:focus-visible { outline: 2px solid var(--monika-accent); outline-offset: 1px; }

.mk-act { padding: 13px; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; }
.mk-act-primary { background: var(--monika-primary); color: #fff; }
.mk-act-secondary { background: #fff; color: var(--monika-primary); border: 1.5px solid var(--monika-accent); }
.mk-act:disabled { opacity: .5; cursor: not-allowed; }
.mk-act:focus-visible { outline: 3px solid var(--monika-accent); outline-offset: 2px; }

.mk-inp { width: 100%; padding: 11px 13px; font-size: 14.5px; border: 1px solid #d8deea; border-radius: 10px; color: var(--monika-text); background: #fff; }
.mk-inp:focus { outline: none; border-color: var(--monika-accent); }
.mk-consent { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: var(--monika-text); opacity: .85; }
.mk-consent a { color: var(--monika-accent); }
.mk-err { color: #c0392b; font-size: 13px; margin: 4px 0 0; }
.mk-hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }

.mk-gutschein { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 12px 14px;
  background: #fff8e8; border: 1.5px solid #C9A961; border-radius: 12px; }
.mk-gutschein-badge { font-weight: 800; font-size: 17px; color: #9a7d2e; background: #fbeec4; border-radius: 8px; padding: 4px 9px; flex: 0 0 auto; }
.mk-gutschein-txt { font-size: 13px; color: var(--monika-text); }

.mk-powered { padding: 7px 14px; text-align: center; font-size: 11px; background: #fff; border-top: 1px solid #eef1f6; }
.mk-powered a { color: var(--monika-accent); text-decoration: none; }

.mk-launch { position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.mk-launch .mk-fab { position: static; }
.mk-teaser { display: flex; align-items: center; gap: 8px; max-width: 280px; background: #fff; color: var(--monika-text);
  border: 1px solid #e8ecf3; border-radius: 16px; border-bottom-right-radius: 5px; padding: 10px 12px;
  box-shadow: 0 6px 20px rgba(13,27,62,.18); cursor: pointer; }
.mk-teaser:focus-visible { outline: 2px solid var(--monika-accent); outline-offset: 2px; }
.mk-teaser-in { animation: mk-teaser-pop .25s cubic-bezier(.22,1,.36,1); }
@keyframes mk-teaser-pop { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
.mk-teaser .mk-mini { width: 26px; height: 26px; }
.mk-teaser-txt { font-size: 13.5px; line-height: 1.35; flex: 1; }
.mk-teaser-x { background: none; border: none; color: #98a4b8; font-size: 17px; line-height: 1; cursor: pointer; padding: 0 2px; align-self: flex-start; }
.mk-teaser-x:hover { color: var(--monika-text); }
`
