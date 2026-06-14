// ==UserScript==
// @name         Mobile Page Editor Lite
// @namespace    https://github.com/CRZX1337/mobile-page-editor-lite
// @version      1.2.1
// @description  Edit text, numbers, and visibility on webpages with mini history and per-entry undo.
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

  const state = {
    active: false,
    mode: null,
    hoveredEl: null,
    history: [],
    maxHistory: 20,
    uiVisible: false
  };

  const selectorsBlocked = [
    '#mpe-lite-root',
    '#mpe-lite-root *',
    '#mpe-lite-launcher',
    '#mpe-lite-launcher *',
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'canvas',
    'img',
    'video',
    'audio',
    'input',
    'textarea',
    'select',
    'option',
    'meta',
    'link'
  ].join(',');

  const css = `
    #mpe-lite-launcher {
      position: fixed;
      right: 16px;
      bottom: 18px;
      width: 54px;
      height: 54px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(28,28,30,.82);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      color: #fff;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 8px 30px rgba(0,0,0,.28);
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }

    #mpe-lite-root {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 12px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      color: #fff;
      pointer-events: none;
    }

    #mpe-lite-panel {
      pointer-events: auto;
      background: rgba(28,28,30,.88);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 22px;
      box-shadow: 0 12px 34px rgba(0,0,0,.28);
      overflow: hidden;
    }

    #mpe-lite-toolbar {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      padding: 12px;
    }

    .mpe-btn {
      border: 0;
      border-radius: 16px;
      background: rgba(255,255,255,.08);
      color: #fff;
      padding: 10px 8px;
      font-size: 13px;
      font-weight: 600;
      min-height: 48px;
      line-height: 1.15;
      cursor: pointer;
      transition: background .18s ease, transform .12s ease, opacity .18s ease;
    }

    .mpe-btn:active { transform: scale(0.98); }
    .mpe-btn.active { background: #0a84ff; color: #fff; }
    .mpe-btn.secondary { background: rgba(255,255,255,.06); }

    #mpe-lite-history {
      border-top: 1px solid rgba(255,255,255,.1);
      padding: 10px 12px 12px;
      max-height: 170px;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }

    #mpe-lite-history-title {
      font-size: 12px;
      font-weight: 700;
      opacity: .72;
      margin-bottom: 8px;
      letter-spacing: .02em;
      text-transform: uppercase;
    }

    .mpe-history-item {
      font-size: 13px;
      line-height: 1.3;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(255,255,255,.05);
      margin-bottom: 6px;
      color: rgba(255,255,255,.92);
      word-break: break-word;
    }

    .mpe-history-button {
      width: 100%;
      border: 0;
      text-align: left;
      cursor: pointer;
      display: block;
      transition: background .18s ease, transform .12s ease;
    }

    .mpe-history-button:active {
      transform: scale(0.985);
      background: rgba(10,132,255,.18);
    }

    #mpe-lite-tip {
      padding: 0 12px 12px;
      font-size: 12px;
      color: rgba(255,255,255,.72);
    }

    .mpe-highlight {
      outline: 2px solid #0a84ff !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 3px rgba(10,132,255,.18) !important;
      cursor: pointer !important;
    }

    .mpe-hidden-by-script { display: none !important; }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.documentElement.appendChild(style);

  const launcher = document.createElement('button');
  launcher.id = 'mpe-lite-launcher';
  launcher.type = 'button';
  launcher.textContent = '✎';
  launcher.setAttribute('aria-label', 'Open page editor');
  document.body.appendChild(launcher);

  const root = document.createElement('div');
  root.id = 'mpe-lite-root';
  root.style.display = 'none';
  root.innerHTML = `
    <div id="mpe-lite-panel">
      <div id="mpe-lite-toolbar">
        <button class="mpe-btn" data-mode="text">Edit Text</button>
        <button class="mpe-btn" data-mode="number">Edit Number</button>
        <button class="mpe-btn" data-mode="hide">Hide</button>
        <button class="mpe-btn secondary" data-action="undo">Undo</button>
        <button class="mpe-btn secondary" data-action="reset">Reset</button>
        <button class="mpe-btn secondary" data-action="close">Close</button>
      </div>
      <div id="mpe-lite-history">
        <div id="mpe-lite-history-title">Recent changes</div>
        <div id="mpe-lite-history-list">
          <div class="mpe-history-item">No changes yet.</div>
        </div>
      </div>
      <div id="mpe-lite-tip">Choose a mode, then tap an element on the page.</div>
    </div>
  `;
  document.body.appendChild(root);

  const historyList = root.querySelector('#mpe-lite-history-list');
  const toolbarButtons = Array.from(root.querySelectorAll('.mpe-btn[data-mode]'));
  const tipEl = root.querySelector('#mpe-lite-tip');

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }

  function hasUsefulText(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().length > 0;
  }

  function isEditableCandidate(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.closest('#mpe-lite-root') || el.closest('#mpe-lite-launcher')) return false;
    if (el.matches(selectorsBlocked)) return false;
    if (!isVisible(el)) return false;
    if (!hasUsefulText(el)) return false;
    if (['BODY', 'HTML', 'MAIN'].includes(el.tagName)) return false;
    return true;
  }

  function getBestTarget(startEl) {
    let el = startEl instanceof HTMLElement ? startEl : null;
    while (el && el !== document.body) {
      if (isEditableCandidate(el) && (el.innerText || '').trim().length <= 300) return el;
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

  function setMode(mode) {
    state.mode = mode;
    state.active = !!mode;
    toolbarButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    if (!mode) { tipEl.textContent = 'Choose a mode, then tap an element on the page.'; clearHighlight(); return; }
    if (mode === 'text') tipEl.textContent = 'Text mode active. Tap text on the page.';
    if (mode === 'number') tipEl.textContent = 'Number mode active. Tap a value on the page.';
    if (mode === 'hide') tipEl.textContent = 'Hide mode active. Tap any visible element.';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function truncate(str, len = 42) {
    const s = String(str || '').replace(/\s+/g, ' ').trim();
    return s.length > len ? s.slice(0, len) + '…' : s;
  }

  function getElementPath(el) {
    const path = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) { selector += '#' + CSS.escape(el.id); path.unshift(selector); break; }
      else {
        let sib = el, nth = 1;
        while ((sib = sib.previousElementSibling)) { if (sib.nodeName.toLowerCase() === el.nodeName.toLowerCase()) nth++; }
        selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  function getLabel(action, el, extra = '') {
    const tag = el?.tagName?.toLowerCase() || 'element';
    const path = getElementPath(el).slice(0, 60);
    const suffix = extra ? `: ${extra}` : '';
    if (action === 'text') return `Text edited on ${tag}${suffix}`;
    if (action === 'number') return `Number changed on ${tag}${suffix}`;
    if (action === 'hide') return `Element hidden (${path || tag})`;
    return `Changed ${tag}`;
  }

  function renderHistory() {
    if (!state.history.length) { historyList.innerHTML = `<div class="mpe-history-item">No changes yet.</div>`; return; }
    historyList.innerHTML = state.history.slice(-5).reverse().map(item => `
      <button class="mpe-history-item mpe-history-button" data-history-id="${item.id}">
        ${escapeHtml(item.label)}
      </button>
    `).join('');
  }

  function pushHistory(entry) {
    entry.id = `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    state.history.push(entry);
    if (state.history.length > state.maxHistory) state.history.shift();
    renderHistory();
  }

  function updateText(el, newText) {
    const oldText = el.innerText;
    if (newText == null || newText === oldText) return;
    el.innerText = newText;
    pushHistory({ type: 'text', el, oldValue: oldText, newValue: newText, undo() { if (this.el?.isConnected) this.el.innerText = this.oldValue; }, label: getLabel('text', el, truncate(newText)) });
  }

  function updateNumber(el) {
    const original = el.innerText;
    const match = original.match(/-?\d[\d\s.,]*[%€$£¥]?/);
    if (!match) { alert('No editable number found in this element.'); return; }
    const currentNumber = match[0].trim();
    const replacement = prompt('Enter new number/value:', currentNumber);
    if (replacement === null || replacement.trim() === '' || replacement === currentNumber) return;
    const next = original.replace(currentNumber, replacement);
    el.innerText = next;
    pushHistory({ type: 'number', el, oldValue: original, newValue: next, undo() { if (this.el?.isConnected) this.el.innerText = this.oldValue; }, label: getLabel('number', el, `${truncate(currentNumber, 16)} → ${truncate(replacement, 16)}`) });
  }

  function hideElement(el) {
    if (el.classList.contains('mpe-hidden-by-script')) return;
    el.classList.add('mpe-hidden-by-script');
    pushHistory({ type: 'hide', el, undo() { if (this.el?.isConnected) this.el.classList.remove('mpe-hidden-by-script'); }, label: getLabel('hide', el) });
  }

  function undoLast() {
    const last = state.history.pop();
    if (!last) return;
    try { last.undo(); } catch (e) { console.error('Undo failed:', e); }
    renderHistory();
  }

  function undoSpecificEntry(historyId) {
    const index = state.history.findIndex(item => item.id === historyId);
    if (index === -1) return;
    try { state.history[index].undo(); } catch (e) { console.error('Specific undo failed:', e); }
    state.history.splice(index, 1);
    renderHistory();
  }

  function resetAll() {
    while (state.history.length) {
      const item = state.history.pop();
      try { item.undo(); } catch (e) { console.error('Reset failed:', e); }
    }
    renderHistory();
  }

  function closeUI() { clearHighlight(); setMode(null); state.uiVisible = false; root.style.display = 'none'; }
  function openUI() { state.uiVisible = true; root.style.display = 'block'; }

  launcher.addEventListener('click', () => state.uiVisible ? closeUI() : openUI());

  root.addEventListener('click', (e) => {
    const historyBtn = e.target.closest('.mpe-history-button');
    if (historyBtn) { undoSpecificEntry(historyBtn.dataset.historyId); return; }
    const btn = e.target.closest('.mpe-btn');
    if (!btn) return;
    if (btn.dataset.mode) { setMode(state.mode === btn.dataset.mode ? null : btn.dataset.mode); return; }
    if (btn.dataset.action === 'undo') undoLast();
    if (btn.dataset.action === 'reset') resetAll();
    if (btn.dataset.action === 'close') closeUI();
  });

  document.addEventListener('pointermove', (e) => {
    if (!state.active || !state.uiVisible) return;
    setHighlight(getBestTarget(e.target));
  }, true);

  document.addEventListener('click', (e) => {
    if (!state.active || !state.uiVisible) return;
    if (e.target.closest('#mpe-lite-root') || e.target.closest('#mpe-lite-launcher')) return;
    const el = getBestTarget(e.target);
    if (!el) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (state.mode === 'text') { const next = prompt('Edit text:', (el.innerText || '').trim()); if (next !== null) updateText(el, next); }
    else if (state.mode === 'number') updateNumber(el);
    else if (state.mode === 'hide') hideElement(el);
  }, true);

  document.addEventListener('scroll', () => {
    if (state.hoveredEl && !isVisible(state.hoveredEl)) clearHighlight();
  }, true);

  renderHistory();
})();
