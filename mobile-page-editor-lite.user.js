// ==UserScript==
// @name         Mobile Page Editor Lite
// @namespace    https://github.com/CRZX1337/mobile-page-editor-lite
// @version      1.3.1
// @description  Edit text, numbers, and visibility — undo counter, smart number picker, optional sticky changes.
// @author       CRZX1337
// @match        *://*/*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/CRZX1337/mobile-page-editor-lite/main/mobile-page-editor-lite.user.js
// @downloadURL  https://raw.githubusercontent.com/CRZX1337/mobile-page-editor-lite/main/mobile-page-editor-lite.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__mobilePageEditorLiteLoaded) return;
  window.__mobilePageEditorLiteLoaded = true;

  // ── Sticky storage ────────────────────────────────────────────────────────────
  const STICKY_KEY   = 'mpe_lite_changes_' + location.pathname;
  const STICKY_ON_KEY = 'mpe_lite_sticky_on';

  function stickyEnabled() {
    try { return sessionStorage.getItem(STICKY_ON_KEY) === '1'; } catch { return false; }
  }
  function setStickyEnabled(val) {
    try { sessionStorage.setItem(STICKY_ON_KEY, val ? '1' : '0'); } catch {}
  }

  // Save serialisable snapshots of each change
  function stickySave(entries) {
    try {
      sessionStorage.setItem(STICKY_KEY, JSON.stringify(
        entries.map(e => ({ type: e.type, selector: e.selector, oldValue: e.oldValue, newValue: e.newValue, label: e.label }))
      ));
    } catch {}
  }

  function stickyLoad() {
    try { return JSON.parse(sessionStorage.getItem(STICKY_KEY) || '[]'); } catch { return []; }
  }

  function stickyClear() {
    try { sessionStorage.removeItem(STICKY_KEY); } catch {}
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    active: false,
    mode: null,
    hoveredEl: null,
    history: [],
    maxHistory: 20,
    uiVisible: false,
    stickyOn: stickyEnabled()
  };

  const selectorsBlocked = [
    '#mpe-lite-root','#mpe-lite-root *',
    '#mpe-lite-launcher-wrap','#mpe-lite-launcher-wrap *',
    '#mpe-num-picker','#mpe-num-picker *',
    'script','style','noscript','iframe','svg','canvas',
    'img','video','audio','input','textarea','select','option','meta','link'
  ].join(',');

  // ── CSS ───────────────────────────────────────────────────────────────────
  document.documentElement.appendChild(Object.assign(document.createElement('style'), { textContent: `
    #mpe-lite-launcher-wrap {
      position: fixed; right: 16px; bottom: 18px;
      z-index: 2147483646;
      display: flex; align-items: center; justify-content: center;
    }
    #mpe-lite-launcher {
      width: 54px; height: 54px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(28,28,30,.82);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      color: #fff; font-size: 24px;
      box-shadow: 0 8px 30px rgba(0,0,0,.28);
      cursor: pointer; user-select: none;
      -webkit-user-select: none; -webkit-touch-callout: none;
      display: flex; align-items: center; justify-content: center;
      border: none; position: relative;
    }
    #mpe-lite-badge {
      position: absolute; top: -4px; right: -4px;
      min-width: 20px; height: 20px; border-radius: 999px;
      background: #ff3b30; color: #fff;
      font-size: 11px; font-weight: 700;
      display: none; align-items: center; justify-content: center;
      padding: 0 5px; pointer-events: none;
    }
    #mpe-lite-root {
      position: fixed; left: 12px; right: 12px; bottom: 12px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      color: #fff; pointer-events: none;
    }
    #mpe-lite-panel {
      pointer-events: auto;
      background: rgba(28,28,30,.88);
      backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 22px;
      box-shadow: 0 12px 34px rgba(0,0,0,.28);
      overflow: hidden;
    }
    #mpe-lite-toolbar {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; padding: 12px 12px 6px;
    }
    #mpe-lite-toolbar-2 {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; padding: 0 12px 12px;
    }
    .mpe-btn {
      border: 0; border-radius: 16px;
      background: rgba(255,255,255,.08); color: #fff;
      padding: 10px 8px; font-size: 13px; font-weight: 600;
      min-height: 48px; line-height: 1.15; cursor: pointer;
      transition: background .18s ease, transform .12s ease;
      position: relative;
    }
    .mpe-btn:active { transform: scale(0.97); }
    .mpe-btn.active { background: #0a84ff; }
    .mpe-btn.secondary { background: rgba(255,255,255,.06); }
    .mpe-btn.sticky-on { background: #30d158; color: #000; }
    .mpe-btn-badge {
      position: absolute; top: -5px; right: -5px;
      min-width: 18px; height: 18px; border-radius: 999px;
      background: #ff3b30; color: #fff;
      font-size: 10px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      padding: 0 4px; pointer-events: none;
    }
    #mpe-lite-history {
      border-top: 1px solid rgba(255,255,255,.1);
      padding: 10px 12px 12px;
      max-height: 160px; overflow: auto;
      -webkit-overflow-scrolling: touch;
    }
    #mpe-lite-history-title {
      font-size: 12px; font-weight: 700; opacity: .72;
      margin-bottom: 8px; letter-spacing: .02em; text-transform: uppercase;
    }
    .mpe-history-item {
      font-size: 13px; line-height: 1.3;
      padding: 10px 12px; border-radius: 12px;
      background: rgba(255,255,255,.05); margin-bottom: 6px;
      color: rgba(255,255,255,.92); word-break: break-word;
    }
    .mpe-history-button {
      width: 100%; border: 0; text-align: left; cursor: pointer; display: block;
      transition: background .15s, transform .1s;
    }
    .mpe-history-button:active { transform: scale(0.985); background: rgba(10,132,255,.2); }
    #mpe-lite-tip {
      padding: 0 12px 12px; font-size: 12px; color: rgba(255,255,255,.6);
    }
    /* Number picker */
    #mpe-num-picker {
      position: fixed; left: 12px; right: 12px; bottom: 0;
      z-index: 2147483648;
      background: rgba(28,28,30,.96);
      backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 22px 22px 0 0;
      padding: 16px 16px 34px;
      transform: translateY(110%);
      transition: transform .28s cubic-bezier(.32,1,.23,1);
    }
    #mpe-num-picker.open { transform: translateY(0); }
    #mpe-num-picker-title {
      font-family: -apple-system, sans-serif;
      font-size: 13px; font-weight: 700;
      color: rgba(255,255,255,.55);
      text-transform: uppercase; letter-spacing: .04em;
      margin-bottom: 12px;
    }
    .mpe-num-option {
      font-family: -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: space-between;
      padding: 13px 14px; border-radius: 14px;
      background: rgba(255,255,255,.06); color: #fff;
      font-size: 15px; font-weight: 500;
      margin-bottom: 8px; border: 0; width: 100%; cursor: pointer;
      transition: background .15s;
    }
    .mpe-num-option:active { background: rgba(10,132,255,.3); }
    .mpe-num-option span { font-size: 12px; opacity: .45; }
    #mpe-num-cancel {
      font-family: -apple-system, sans-serif;
      width: 100%; border: 0; margin-top: 4px;
      padding: 14px; border-radius: 14px;
      background: rgba(255,255,255,.08);
      color: #ff3b30; font-size: 15px; font-weight: 700; cursor: pointer;
    }
    .mpe-highlight {
      outline: 2px solid #0a84ff !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 3px rgba(10,132,255,.18) !important;
      cursor: pointer !important;
    }
    .mpe-hidden-by-script { display: none !important; }
  `}));

  // ── Launcher ─────────────────────────────────────────────────────────────
  const launcherWrap = document.createElement('div');
  launcherWrap.id = 'mpe-lite-launcher-wrap';

  const launcher = document.createElement('button');
  launcher.id = 'mpe-lite-launcher';
  launcher.type = 'button';
  launcher.textContent = '✎';
  launcher.setAttribute('aria-label', 'Open page editor');

  const badge = document.createElement('div');
  badge.id = 'mpe-lite-badge';

  launcher.appendChild(badge);
  launcherWrap.appendChild(launcher);
  document.body.appendChild(launcherWrap);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'mpe-lite-root';
  root.style.display = 'none';
  root.innerHTML = `
    <div id="mpe-lite-panel">
      <div id="mpe-lite-toolbar">
        <button class="mpe-btn" data-mode="text">Edit Text</button>
        <button class="mpe-btn" data-mode="number">Edit Nr.</button>
        <button class="mpe-btn" data-mode="hide">Hide</button>
        <button class="mpe-btn secondary" data-action="sticky">📌 Sticky</button>
      </div>
      <div id="mpe-lite-toolbar-2">
        <button class="mpe-btn secondary" data-action="undo">Undo</button>
        <button class="mpe-btn secondary" data-action="reset">Reset</button>
        <button class="mpe-btn secondary" data-action="clear-sticky">Clear</button>
        <button class="mpe-btn secondary" data-action="close">Close</button>
      </div>
      <div id="mpe-lite-history">
        <div id="mpe-lite-history-title">Recent changes</div>
        <div id="mpe-lite-history-list"><div class="mpe-history-item">No changes yet.</div></div>
      </div>
      <div id="mpe-lite-tip">Choose a mode, then tap an element on the page.</div>
    </div>
  `;
  document.body.appendChild(root);

  // ── Number picker ──────────────────────────────────────────────────────────
  const numPicker = document.createElement('div');
  numPicker.id = 'mpe-num-picker';
  numPicker.innerHTML = `
    <div id="mpe-num-picker-title">Choose a number to edit</div>
    <div id="mpe-num-options"></div>
    <button id="mpe-num-cancel">Cancel</button>
  `;
  document.body.appendChild(numPicker);
  numPicker.querySelector('#mpe-num-cancel').addEventListener('click', () => numPicker.classList.remove('open'));

  function openNumPicker(el) {
    const matches = [...new Set(
      [...(el.innerText || '').matchAll(/-?\d[\d\s.,]*[%€$£¥]?/g)]
        .map(m => m[0].trim()).filter(Boolean)
    )];
    if (!matches.length) { alert('No numbers found in this element.'); return; }

    const optEl = numPicker.querySelector('#mpe-num-options');
    optEl.innerHTML = matches.map((num, i) => `
      <button class="mpe-num-option" data-num="${escapeHtml(num)}" data-i="${i}">
        ${escapeHtml(num)}<span>tap to edit</span>
      </button>
    `).join('');

    optEl.querySelectorAll('.mpe-num-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = btn.dataset.num;
        numPicker.classList.remove('open');
        setTimeout(() => {
          const rep = prompt('Enter new value:', chosen);
          if (!rep || rep === chosen) return;
          const orig = el.innerText;
          const next = orig.replace(chosen, rep);
          el.innerText = next;
          pushHistory({
            type: 'number', el,
            selector: getElementSelector(el),
            oldValue: orig, newValue: next,
            undo() { if (this.el?.isConnected) this.el.innerText = this.oldValue; },
            label: `Number changed on ${el.tagName.toLowerCase()}: ${truncate(chosen,16)} → ${truncate(rep,16)}`
          });
        }, 80);
      });
    });
    numPicker.classList.add('open');
  }

  // ── Refs ───────────────────────────────────────────────────────────────────
  const historyList = root.querySelector('#mpe-lite-history-list');
  const toolbarBtns = Array.from(root.querySelectorAll('.mpe-btn[data-mode]'));
  const tipEl       = root.querySelector('#mpe-lite-tip');
  const undoBtn     = root.querySelector('[data-action="undo"]');
  const stickyBtn   = root.querySelector('[data-action="sticky"]');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect(), s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }
  function hasUsefulText(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().length > 0;
  }
  function isCandidate(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.closest('#mpe-lite-root,#mpe-lite-launcher-wrap,#mpe-num-picker')) return false;
    if (el.matches(selectorsBlocked)) return false;
    if (!isVisible(el) || !hasUsefulText(el)) return false;
    if (['BODY','HTML','MAIN'].includes(el.tagName)) return false;
    return true;
  }
  function getBestTarget(startEl) {
    let el = startEl instanceof HTMLElement ? startEl : null;
    while (el && el !== document.body) {
      if (isCandidate(el) && (el.innerText || '').trim().length <= 300) return el;
      el = el.parentElement;
    }
    return null;
  }
  function clearHighlight() {
    if (state.hoveredEl) { state.hoveredEl.classList.remove('mpe-highlight'); state.hoveredEl = null; }
  }
  function setHighlight(el) {
    if (state.hoveredEl === el) return;
    clearHighlight();
    if (el) { el.classList.add('mpe-highlight'); state.hoveredEl = el; }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function truncate(s, len = 42) {
    const t = String(s||'').replace(/\s+/g,' ').trim();
    return t.length > len ? t.slice(0,len)+'…' : t;
  }
  function getElementSelector(el) {
    const path = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) { sel += '#' + CSS.escape(el.id); path.unshift(sel); break; }
      let sib = el, nth = 1;
      while ((sib = sib.previousElementSibling)) { if (sib.nodeName.toLowerCase() === el.nodeName.toLowerCase()) nth++; }
      sel += `:nth-of-type(${nth})`;
      path.unshift(sel);
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  // ── Undo badge ─────────────────────────────────────────────────────────────
  function updateBadges() {
    const n = state.history.length;
    // launcher badge
    badge.textContent = n;
    badge.style.display = n > 0 ? 'flex' : 'none';
    // undo button badge
    const old = undoBtn.querySelector('.mpe-btn-badge');
    if (old) old.remove();
    if (n > 0) {
      const b = document.createElement('div');
      b.className = 'mpe-btn-badge';
      b.textContent = n;
      undoBtn.appendChild(b);
    }
    // sticky button state
    stickyBtn.classList.toggle('sticky-on', state.stickyOn);
    stickyBtn.textContent = state.stickyOn ? '📌 Sticky ON' : '📌 Sticky';
  }

  // ── History ────────────────────────────────────────────────────────────────
  function renderHistory() {
    if (!state.history.length) {
      historyList.innerHTML = `<div class="mpe-history-item">No changes yet.</div>`;
    } else {
      historyList.innerHTML = state.history.slice(-5).reverse().map(item => `
        <button class="mpe-history-item mpe-history-button" data-hid="${item.id}">
          ${escapeHtml(item.label)}
        </button>
      `).join('');
    }
    updateBadges();
    if (state.stickyOn) stickySave(state.history);
  }

  function pushHistory(entry) {
    entry.id = `h_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    if (!entry.selector && entry.el) entry.selector = getElementSelector(entry.el);
    state.history.push(entry);
    if (state.history.length > state.maxHistory) state.history.shift();
    renderHistory();
  }

  // Rebuild live undo-able entries from saved snapshots after reload
  function restoreHistoryFromSticky(saved) {
    saved.forEach(s => {
      let el = null;
      try { el = document.querySelector(s.selector); } catch {}
      state.history.push({
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        type: s.type,
        selector: s.selector,
        el,
        oldValue: s.oldValue,
        newValue: s.newValue,
        label: s.label,
        undo() {
          const target = this.el?.isConnected ? this.el : (this.selector ? document.querySelector(this.selector) : null);
          if (!target) return;
          if (this.type === 'text' || this.type === 'number') target.innerText = this.oldValue;
          if (this.type === 'hide') target.classList.remove('mpe-hidden-by-script');
        }
      });
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function updateText(el, newText) {
    const old = el.innerText;
    if (!newText || newText === old) return;
    el.innerText = newText;
    pushHistory({
      type: 'text', el, selector: getElementSelector(el),
      oldValue: old, newValue: newText,
      undo() {
        const t = this.el?.isConnected ? this.el : document.querySelector(this.selector);
        if (t) t.innerText = this.oldValue;
      },
      label: `Text edited on ${el.tagName.toLowerCase()}: ${truncate(newText)}`
    });
  }

  function hideElement(el) {
    if (el.classList.contains('mpe-hidden-by-script')) return;
    el.classList.add('mpe-hidden-by-script');
    pushHistory({
      type: 'hide', el, selector: getElementSelector(el),
      oldValue: null, newValue: null,
      undo() {
        const t = this.el?.isConnected ? this.el : document.querySelector(this.selector);
        if (t) t.classList.remove('mpe-hidden-by-script');
      },
      label: `Element hidden (${getElementSelector(el).slice(0,50)})`
    });
  }

  function undoLast() {
    const last = state.history.pop();
    if (!last) return;
    try { last.undo(); } catch(e) {}
    renderHistory();
  }

  function undoSpecific(id) {
    const i = state.history.findIndex(x => x.id === id);
    if (i === -1) return;
    try { state.history[i].undo(); } catch(e) {}
    state.history.splice(i, 1);
    renderHistory();
  }

  function resetAll() {
    [...state.history].reverse().forEach(item => { try { item.undo(); } catch(e) {} });
    state.history = [];
    renderHistory();
  }

  function toggleSticky() {
    state.stickyOn = !state.stickyOn;
    setStickyEnabled(state.stickyOn);
    if (!state.stickyOn) stickyClear();
    else stickySave(state.history);
    renderHistory();
  }

  function clearSticky() {
    stickyClear();
    if (!state.history.length) return;
    tipEl.textContent = 'Sticky cleared — changes still active this session.';
    setTimeout(() => setMode(state.mode), 2000);
  }

  // ── UI mode ───────────────────────────────────────────────────────────────
  function setMode(mode) {
    state.mode = mode;
    state.active = !!mode;
    toolbarBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    if (!mode)   { tipEl.textContent = 'Choose a mode, then tap an element on the page.'; clearHighlight(); return; }
    if (mode === 'text')   tipEl.textContent = 'Text mode — tap any text on the page.';
    if (mode === 'number') tipEl.textContent = 'Number mode — tap element to pick a number.';
    if (mode === 'hide')   tipEl.textContent = 'Hide mode — tap any visible element.';
  }

  function closeUI() { clearHighlight(); setMode(null); state.uiVisible = false; root.style.display = 'none'; }
  function openUI()  { state.uiVisible = true; root.style.display = 'block'; }

  // ── Events ────────────────────────────────────────────────────────────────
  launcher.addEventListener('click', () => state.uiVisible ? closeUI() : openUI());

  root.addEventListener('click', e => {
    const hBtn = e.target.closest('.mpe-history-button');
    if (hBtn) { undoSpecific(hBtn.dataset.hid); return; }
    const btn = e.target.closest('.mpe-btn');
    if (!btn) return;
    const { mode, action } = btn.dataset;
    if (mode)   { setMode(state.mode === mode ? null : mode); return; }
    if (action === 'undo')         undoLast();
    if (action === 'reset')        resetAll();
    if (action === 'sticky')       toggleSticky();
    if (action === 'clear-sticky') clearSticky();
    if (action === 'close')        closeUI();
  });

  document.addEventListener('pointermove', e => {
    if (!state.active || !state.uiVisible) return;
    setHighlight(getBestTarget(e.target));
  }, true);

  document.addEventListener('click', e => {
    if (!state.active || !state.uiVisible) return;
    if (e.target.closest('#mpe-lite-root,#mpe-lite-launcher-wrap,#mpe-num-picker')) return;
    const el = getBestTarget(e.target);
    if (!el) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (state.mode === 'text')   { const t = prompt('Edit text:', (el.innerText||'').trim()); if (t !== null) updateText(el, t); }
    else if (state.mode === 'number') openNumPicker(el);
    else if (state.mode === 'hide')   hideElement(el);
  }, true);

  document.addEventListener('scroll', () => {
    if (state.hoveredEl && !isVisible(state.hoveredEl)) clearHighlight();
  }, true);

  // ── Init: restore sticky if enabled ────────────────────────────────────────
  if (state.stickyOn) {
    const saved = stickyLoad();
    if (saved.length) {
      // First apply DOM changes, then rebuild history so undo works
      saved.forEach(s => {
        try {
          const el = document.querySelector(s.selector);
          if (!el) return;
          if (s.type === 'text' || s.type === 'number') el.innerText = s.newValue;
          if (s.type === 'hide') el.classList.add('mpe-hidden-by-script');
        } catch {}
      });
      restoreHistoryFromSticky(saved);
    }
  }

  renderHistory();
})();
