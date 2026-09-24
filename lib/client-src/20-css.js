    // ── 样式 ──────────────────────────────────────────────────────────
    // 全部挂在 .dch- 前缀下，避免与 DSH 主体或其它插件冲突。
    const CHATTY_CSS = `
.dch-bar { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dch-bar-status { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dch-timer { font-size: 11px; opacity: .6; font-variant-numeric: tabular-nums; }
.dch-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.dch-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.16)); }
.dch-btn:disabled { opacity: .45; cursor: default; }
.dch-btn[data-active="1"] { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dch-panel { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25)); border-radius: 10px;
  background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.06)); font-size: 12px; }
.dch-panel-head { display: flex; align-items: center; gap: 8px; }
.dch-spacer { flex: 1 1 auto; }
.dch-panel-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.dch-help { display: flex; flex-direction: column; gap: 4px; font-size: 12px; padding: 8px 10px;
  border-radius: 8px; background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.08)); }
.dch-help-row { display: flex; gap: 10px; align-items: baseline; }
.dch-help-row > b { flex: 0 0 96px; font-weight: 600; }
.dch-help-row > code { font-family: ui-monospace, Consolas, monospace; opacity: .85; }
.dch-status { font-size: 12px; opacity: .75; white-space: nowrap; }
.dch-status[data-error="1"] { color: var(--dsw-alias-state-error-primary, #d9534f); opacity: 1; }
.dch-pill { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25)); border-radius: 10px;
  background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.06)); font-size: 12px; }
.dch-pill-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dch-draft-title { font-weight: 600; opacity: .8; }
.dch-draft-text { width: 100%; min-height: 62px; resize: vertical; font: inherit; font-size: 12px;
  padding: 6px 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-primary, transparent); color: inherit; }
.dch-partial { font-size: 12px; opacity: .7; font-style: italic; white-space: pre-wrap; }
.dch-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dch-action { font-size: 12px; padding: 3px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3)); background: transparent; color: inherit; }
.dch-action:hover:not(:disabled) { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.14)); }
.dch-action:disabled { opacity: .45; cursor: default; }
.dch-action[data-primary="1"] { border-color: transparent; background: var(--dsw-alias-bg-accent, #3b82f6); color: #fff; }
.dch-levels { display: inline-flex; align-items: flex-end; gap: 2px; height: 18px; }
.dch-levels span { display: block; width: 3px; border-radius: 2px; background: currentColor; opacity: .65; }
.dch-levels.dch-viz-active span { background: var(--dsw-alias-bg-accent, #3b82f6); opacity: .95; }
.dch-notice { font-size: 12px; opacity: .8; }
.dch-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .8; }
.dch-dot[data-on="1"] { background: var(--dsw-alias-state-error-primary, #d9534f); animation: dch-pulse 1.1s infinite; }
@keyframes dch-pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
.dch-card { list-style: none; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-layer-3, transparent); border-radius: 12px; margin-top: 8px; }
.dch-card-head { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer;
  background: 0 0; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.dch-card-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.dch-card-title { color: var(--dsw-alias-label-primary, inherit); font-size: 15px; font-weight: 600; line-height: 1.4; }
.dch-card-desc { color: var(--dsw-alias-label-secondary, rgba(127,127,127,.75)); font-size: 13px; }
.dch-chev { flex: none; display: flex; color: var(--dsw-alias-label-secondary, rgba(127,127,127,.6)); transition: transform .15s ease; }
.dch-card[data-open="1"] .dch-chev { transform: rotate(180deg); }
.dch-card-body { border-top: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2)); margin: 0 16px;
  padding: 12px 0 14px; display: flex; flex-direction: column; gap: 10px; }
.dch-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.dch-tab { font-size: 12px; padding: 4px 10px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; background: transparent; color: inherit; }
.dch-tab:hover { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.14)); }
.dch-tab[data-active="1"] { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.14));
  border-color: var(--dsw-alias-border-secondary, rgba(127,127,127,.3)); }
.dch-cred { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25)); border-radius: 8px; }
.dch-cred-row { display: flex; align-items: center; gap: 6px; font-size: 12px; flex-wrap: wrap; }
.dch-cred-ok { color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dch-cred-bad { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dch-cred-hint { font-size: 11px; opacity: .75; white-space: pre-wrap; margin: 0;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.dch-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.dch-field > label { opacity: .75; }
.dch-field input[type="text"], .dch-field input[type="number"], .dch-field select {
  font: inherit; font-size: 12px; padding: 4px 6px; border-radius: 6px; color: inherit;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3)); background: transparent; }
.dch-row { display: flex; gap: 8px; flex-wrap: wrap; }
.dch-row > .dch-field { flex: 1 1 140px; }
.dch-check { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dch-section-title { font-size: 12px; font-weight: 600; opacity: .8; margin-top: 4px; }
.dch-muted { font-size: 11px; opacity: .6; }
`

    let chattyStyleInstalled = false
    function installChattyStyle() {
      if (chattyStyleInstalled || typeof document === 'undefined') return
      chattyStyleInstalled = true
      const style = document.createElement('style')
      style.setAttribute('data-dsh-chatty', '1')
      style.textContent = CHATTY_CSS
      document.head.appendChild(style)
    }
