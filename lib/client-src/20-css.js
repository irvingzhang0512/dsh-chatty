    // ── 样式 ──────────────────────────────────────────────────────────
    // 全部挂在 .dch- 前缀下，避免与 DSH 主体或其它插件冲突。
    const CHATTY_CSS = `
.dch-bar { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dch-bar-status { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dch-timer { font-size: 11px; opacity: .6; font-variant-numeric: tabular-nums; }
/* 悬停提示：任何带 data-tip 的元素（图标按钮等），即时显示、黑底白字通用 */
.dch-tipwrap, .dch-btn, .dch-action { position: relative; }
[data-tip]::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 6px); left: 50%;
  transform: translateX(-50%); padding: 4px 8px; border-radius: 6px; background: rgba(24,24,28,.94); color: #fff;
  font-size: 11px; line-height: 1.4; white-space: nowrap; opacity: 0; pointer-events: none;
  transition: opacity .1s ease .15s; z-index: 40; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
[data-tip]:hover::after { opacity: 1; }
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
/* v6: 与 Desktop 原生设置同一主题，所有选择器限定在 Chatty 卡片。 */
.dch-settings{font-size:14px;line-height:1.6;gap:20px;max-width:1040px;padding:20px 0;color:var(--dsw-alias-label-primary)}
.dch-settings-top{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}
.dch-settings button{font:inherit;min-height:36px;box-sizing:border-box;border-radius:8px;color:var(--dsw-alias-label-primary);cursor:pointer}
.dch-settings button:disabled{opacity:.45;cursor:default}
.dch-settings button.dch-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dch-unit{min-height:36px;display:flex;align-items:center;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;flex:none}
.dch-settings button:not([class]){border:1px solid var(--dsw-alias-border-l3);background:transparent;padding:0 12px}
.dch-settings button:focus-visible,.dch-settings summary:focus-visible,.dch-settings input:focus-visible,.dch-settings select:focus-visible,.dch-settings textarea:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dch-settings input:not([type=checkbox]),.dch-settings select,.dch-settings textarea{box-sizing:border-box;width:100%;min-width:0;min-height:36px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;padding:6px 10px}
.dch-settings textarea{min-height:84px;resize:vertical}
.dch-settings .dch-muted{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);opacity:1;overflow-wrap:anywhere}
.dch-settings .dch-tabs{gap:8px;align-items:center}
.dch-settings .dch-segmented{box-sizing:border-box;width:100%;min-width:0;max-width:640px}
.dch-settings .dch-segmented button{font-size:14px;white-space:normal;padding:4px 8px;height:auto}
.dch-group-tab[data-active=1],.dch-settings .dch-tab[data-active=1]{background:var(--dsw-alias-interactive-bg-hover-solid);font-weight:600}
.dch-selection-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.dch-setting-section{border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l3));border-radius:12px;padding:16px 20px;margin:0 0 24px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}
.dch-setting-section h3,.dch-setting-section>summary{margin:0 0 12px;font-size:14px;line-height:22px;font-weight:600}
.dch-setting-section>summary{margin-bottom:0;cursor:pointer}
.dch-setting-section[open]>summary{margin-bottom:16px}
.dch-settings .dch-field{display:grid;grid-template-columns:minmax(160px,32%) minmax(0,1fr);gap:16px;font-size:14px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l4);align-items:start}
.dch-settings .dch-field:last-child{border-bottom:0}
.dch-field-label{display:flex;gap:4px;align-items:center;min-height:36px}
.dch-field-control{display:flex;align-items:flex-start;gap:8px;min-width:0}
.dch-field-control>:first-child{flex:1;min-width:0}
.dch-field-control>button[role=switch]{flex:none;width:40px;min-height:24px;margin-top:6px}
.dch-settings .dch-reset,.dch-settings .dch-help{min-height:28px;width:28px;padding:0;flex:none}
.dch-settings .dch-reset{margin-top:4px;opacity:.65}
.dch-settings .dch-reset:hover{opacity:1}
.dch-advanced,.dch-custom,.dch-source,.dch-diagnostics{margin-top:12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dch-advanced>summary,.dch-custom>summary,.dch-source>summary,.dch-diagnostics>summary{cursor:pointer;padding:4px 0;min-height:24px}
.dch-custom input{margin:8px 0}
.dch-control-line{display:flex;align-items:flex-start;gap:8px}
.dch-control-line>:first-child{flex:1;min-width:0}
.dch-model-control{display:flex;flex-direction:column;gap:6px}
.dch-picker{position:relative;min-width:0}
.dch-picker>summary{box-sizing:border-box;list-style:none;min-height:36px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px 10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;display:flex;justify-content:space-between;gap:8px;overflow-wrap:anywhere}
.dch-picker>summary::-webkit-details-marker{display:none}
.dch-picker-menu{position:absolute;z-index:20;left:0;right:0;min-width:min(360px,70vw);padding:10px;margin-top:4px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px #0002}
.dch-picker-options{display:flex;flex-direction:column;max-height:240px;overflow-y:auto;margin-top:8px}
.dch-picker-options button{justify-content:flex-start;text-align:left;white-space:normal;overflow-wrap:anywhere;min-height:36px;height:auto;padding:8px}
.dch-picker-options button[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover-solid)}
.dch-ready{color:var(--dsw-alias-state-success-primary)}
.dch-error{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}
.dch-settings-footer{position:sticky;bottom:0;z-index:10;align-items:center;gap:8px;padding:14px 0;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l3)}
.dch-settings-footer>span{margin-right:auto;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dch-settings .dch-diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
.dch-enhancement-title{font-size:18px;margin:0;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l3)}
.dch-official-advanced{margin-top:24px;padding:16px;border:1px solid var(--dsw-alias-border-l3);border-radius:12px}
.dch-official-advanced>summary{cursor:pointer;font-weight:600}
.dch-advanced-owner{margin-top:24px}
.dch-owner-actions[data-owner-actions=chatty]{display:contents}
.dch-owner-fields{border:0;padding:0;margin:0;min-width:0}
.dch-help-fallback{position:relative;font-size:12px}
.dch-help-fallback>span{display:none;position:absolute;z-index:25;width:300px;padding:12px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1);white-space:pre-line}
.dch-help-fallback[open]>span,.dch-help-fallback:hover>span,.dch-help-fallback:focus-within>span{display:block}
@media(max-width:640px){.dch-settings .dch-field{grid-template-columns:1fr;gap:6px}.dch-setting-section{padding:12px}.dch-settings-top{align-items:flex-start}.dch-settings-footer{flex-wrap:wrap}.dch-picker-menu{min-width:0}}

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
