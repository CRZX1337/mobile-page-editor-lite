// ==UserScript==
// @name         Mobile Page Editor Lite
// @namespace    https://github.com/CRZX1337/mobile-page-editor-lite
// @version      1.4.0
// @description  Edit text, numbers, visibility — Liquid Glass UI, undo counter, smart number picker, sticky changes.
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

  // ── Sticky storage ────────────────────────────────────────────────────────
  const STICKY_KEY    = 'mpe_lite_changes_' + location.pathname;
  const STICKY_ON_KEY = 'mpe_lite_sticky_on';

  function stickyEnabled() { try { return sessionStorage.getItem(STICKY_ON_KEY) === '1'; } catch { return false; } }
  function setStickyEnabled(v) { try { sessionStorage.setItem(STICKY_ON_KEY, v ? '1' : '0'); } catch {} }
  function stickySave(entries) {
    try { sessionStorage.setItem(STICKY_KEY, JSON.stringify(entries.map(e => ({ type: e.type, selector: e.selector, oldValue: e.oldValue, newValue: e.newValue, label: e.label })))); } catch {}
  }
  function stickyLoad() { try { return JSON.parse(sessionStorage.getItem(STICKY_KEY) || '[]'); } catch { return []; } }
  function stickyClear() { try { sessionStorage.removeItem(STICKY_KEY); } catch {} }

  // ── State ─────────────────────────────────────────────────────────────────
  const state = { active: false, mode: null, hoveredEl: null, history: [], maxHistory: 20, uiVisible: false, stickyOn: stickyEnabled() };

  const selectorsBlocked = [
    '#mpe-lite-root','#mpe-lite-root *','#mpe-lite-launcher-wrap','#mpe-lite-launcher-wrap *',
    '#mpe-num-picker','#mpe-num-picker *',
    'script','style','noscript','iframe','svg','canvas','img','video','audio','input','textarea','select','option','meta','link'
  ].join(',');

  // ── SVG Liquid Glass filter ───────────────────────────────────────────────
  const svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgFilter.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  svgFilter.innerHTML = `
    <defs>
      <filter id="mpe-liquid" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.65 0.75" numOctaves="3" seed="2" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="displaced"/>
        <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred"/>
        <feComposite in="blurred" in2="SourceGraphic" operator="atop"/>
      </filter>
      <filter id="mpe-liquid-strong" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.55 0.65" numOctaves="4" seed="5" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" result="displaced"/>
        <feGaussianBlur in="displaced" stdDeviation="0.6" result="blurred"/>
        <feComposite in="blurred" in2="SourceGraphic" operator="atop"/>
      </filter>
    </defs>
  `;
  document.documentElement.appendChild(svgFilter);

  // ── CSS ───────────────────────────────────────────────────────────────────
  document.documentElement.appendChild(Object.assign(document.createElement('style'), { textContent: `
    /* ─── Launcher ─── */
    #mpe-lite-launcher-wrap {
      position: fixed; right: 18px; bottom: 22px;
      z-index: 2147483646;
    }
    #mpe-lite-launcher {
      width: 58px; height: 58px; border-radius: 999px;
      background: rgba(255,255,255,0.13);
      backdrop-filter: blur(32px) saturate(180%);
      -webkit-backdrop-filter: blur(32px) saturate(180%);
      border: 1px solid rgba(255,255,255,0.32);
      box-shadow:
        0 2px 0 0 rgba(255,255,255,0.28) inset,
        0 -1px 0 0 rgba(0,0,0,0.18) inset,
        0 12px 40px rgba(0,0,0,0.36),
        0 2px 8px rgba(0,0,0,0.22);
      color: #fff; font-size: 26px;
      filter: url(#mpe-liquid);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      position: relative;
      transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease;
      -webkit-user-select: none; user-select: none;
    }
    #mpe-lite-launcher:active {
      transform: scale(0.91);
      box-shadow:
        0 1px 0 0 rgba(255,255,255,0.22) inset,
        0 8px 20px rgba(0,0,0,0.3);
    }
    #mpe-lite-badge {
      position: absolute; top: -4px; right: -4px;
      min-width: 20px; height: 20px; border-radius: 999px;
      background: #ff3b30; color: #fff;
      font-size: 11px; font-weight: 800;
      display: none; align-items: center; justify-content: center;
      padding: 0 5px; pointer-events: none;
      box-shadow: 0 2px 6px rgba(255,59,48,0.55);
    }

    /* ─── Root panel ─── */
    #mpe-lite-root {
      position: fixed; left: 10px; right: 10px; bottom: 10px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      color: #fff; pointer-events: none;
    }
    #mpe-lite-panel {
      pointer-events: auto;
      background: rgba(255,255,255,0.11);
      backdrop-filter: blur(40px) saturate(200%) brightness(1.08);
      -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.08);
      border-radius: 26px;
      border: 1px solid rgba(255,255,255,0.28);
      box-shadow:
        0 2px 0 0 rgba(255,255,255,0.30) inset,
        0 -1px 0 0 rgba(0,0,0,0.14) inset,
        0 0 0 0.5px rgba(255,255,255,0.10) inset,
        0 20px 60px rgba(0,0,0,0.38),
        0 4px 16px rgba(0,0,0,0.20);
      filter: url(#mpe-liquid);
      overflow: hidden;
      animation: mpe-panel-in 0.32s cubic-bezier(0.34,1.46,0.64,1) both;
    }
    @keyframes mpe-panel-in {
      from { opacity: 0; transform: translateY(22px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ─── Toolbars ─── */
    #mpe-lite-toolbar, #mpe-lite-toolbar-2 {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 7px;
    }
    #mpe-lite-toolbar   { padding: 12px 12px 5px; }
    #mpe-lite-toolbar-2 { padding: 0 12px 10px; }

    /* ─── Buttons ─── */
    .mpe-btn {
      position: relative; border: 0;
      border-radius: 14px;
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.18);
      box-shadow:
        0 1.5px 0 0 rgba(255,255,255,0.22) inset,
        0 2px 6px rgba(0,0,0,0.18);
      color: rgba(255,255,255,0.95);
      padding: 9px 6px; font-size: 12.5px; font-weight: 600;
      min-height: 46px; line-height: 1.2; cursor: pointer;
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      transition: transform 0.15s cubic-bezier(0.34,1.56,0.64,1),
                  background 0.18s ease, box-shadow 0.18s ease;
      overflow: hidden;
    }
    .mpe-btn::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0;
      height: 50%; border-radius: 14px 14px 0 0;
      background: linear-gradient(to bottom, rgba(255,255,255,0.12), transparent);
      pointer-events: none;
    }
    .mpe-btn:active {
      transform: scale(0.93);
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .mpe-btn.active {
      background: rgba(10,132,255,0.55);
      border-color: rgba(10,132,255,0.7);
      box-shadow:
        0 1.5px 0 0 rgba(255,255,255,0.22) inset,
        0 0 18px rgba(10,132,255,0.45),
        0 2px 8px rgba(0,0,0,0.22);
      color: #fff;
    }
    .mpe-btn.sticky-on {
      background: rgba(48,209,88,0.48);
      border-color: rgba(48,209,88,0.65);
      box-shadow:
        0 1.5px 0 0 rgba(255,255,255,0.22) inset,
        0 0 16px rgba(48,209,88,0.38);
      color: #fff;
    }
    .mpe-btn-badge {
      position: absolute; top: -5px; right: -5px;
      min-width: 18px; height: 18px; border-radius: 999px;
      background: #ff3b30; color: #fff;
      font-size: 10px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      padding: 0 4px; pointer-events: none;
      box-shadow: 0 2px 5px rgba(255,59,48,0.5);
    }

    /* ─── History section ─── */
    #mpe-lite-history {
      border-top: 1px solid rgba(255,255,255,0.12);
      padding: 10px 12px 10px;
      max-height: 155px; overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    #mpe-lite-history-title {
      font-size: 11px; font-weight: 700;
      color: rgba(255,255,255,0.5);
      margin-bottom: 7px; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .mpe-history-item {
      font-size: 13px; line-height: 1.3;
      padding: 9px 11px; border-radius: 11px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.10);
      margin-bottom: 5px;
      color: rgba(255,255,255,0.88); word-break: break-word;
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    }
    .mpe-history-button {
      width: 100%; border: 0; text-align: left; cursor: pointer; display: block;
      transition: background 0.15s, transform 0.1s;
    }
    .mpe-history-button:active { transform: scale(0.984); background: rgba(10,132,255,0.22); }

    /* ─── Tip text ─── */
    #mpe-lite-tip {
      padding: 0 12px 11px;
      font-size: 12px; color: rgba(255,255,255,0.52);
      letter-spacing: 0.01em;
    }

    /* ─── Number picker ─── */
    #mpe-num-picker {
      position: fixed; left: 10px; right: 10px; bottom: 0;
      z-index: 2147483648;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(44px) saturate(200%);
      -webkit-backdrop-filter: blur(44px) saturate(200%);
      border: 1px solid rgba(255,255,255,0.26);
      border-radius: 24px 24px 0 0;
      box-shadow:
        0 2px 0 0 rgba(255,255,255,0.28) inset,
        0 -20px 60px rgba(0,0,0,0.3);
      padding: 16px 16px 36px;
      filter: url(#mpe-liquid-strong);
      transform: translateY(110%);
      transition: transform 0.3s cubic-bezier(0.32,1,0.23,1);
    }
    #mpe-num-picker.open { transform: translateY(0); }
    #mpe-num-picker-title {
      font-size: 12px; font-weight: 700;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase; letter-spacing: 0.06em;
      margin-bottom: 12px;
    }
    .mpe-num-option {
      display: flex; align-items: center; justify-content: space-between;
      padding: 13px 14px; border-radius: 14px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 1px 0 rgba(255,255,255,0.14) inset;
      color: #fff; font-size: 15px; font-weight: 500;
      margin-bottom: 8px; border: 0; width: 100%; cursor: pointer;
      transition: background 0.15s, transform 0.12s cubic-bezier(0.34,1.56,0.64,1);
    }
    .mpe-num-option:active { background: rgba(10,132,255,0.32); transform: scale(0.97); }
    .mpe-num-option span { font-size: 12px; opacity: 0.42; }
    #mpe-num-cancel {
      width: 100%; border: 0; margin-top: 6px;
      padding: 14px; border-radius: 14px;
      background: rgba(255,59,48,0.15);
      border: 1px solid rgba(255,59,48,0.28);
      color: #ff3b30; font-size: 15px; font-weight: 700; cursor: pointer;
      transition: background 0.15s, transform 0.12s;
    }
    #mpe-num-cancel:active { background: rgba(255,59,48,0.28); transform: scale(0.97); }

    /* ─── Highlight ─── */
    .mpe-highlight {
      outline: 2px solid rgba(10,132,255,0.9) !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 0 5px rgba(10,132,255,0.15), 0 0 16px rgba(10,132,255,0.2) !important;
      cursor: pointer !important;
      border-radius: 4px !important;
    }
    .mpe-hidden-by-script { display: none !important; }
  `}));

  // ── Launcher ──────────────────────────────────────────────────────────────
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
        <button class="mpe-btn" data-action="sticky">📌 Sticky</button>
      </div>
      <div id="mpe-lite-toolbar-2">
        <button class="mpe-btn" data-action="undo">Undo</button>
        <button class="mpe-btn" data-action="reset">Reset</button>
        <button class="mpe-btn" data-action="clear-sticky">Clear</button>
        <button class="mpe-btn" data-action="close">Close</button>
      </div>
      <div id="mpe-lite-history">
        <div id="mpe-lite-history-title">Recent changes</div>
        <div id="mpe-lite-history-list"><div class="mpe-history-item">No changes yet.</div></div>
      </div>
      <div id="mpe-lite-tip">Choose a mode, then tap an element on the page.</div>
    </div>
  `;
  document.body.appendChild(root);

  // ── Number picker ─────────────────────────────────────────────────────────
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
          const orig = el.innerText, next = orig.replace(chosen, rep);
          el.innerText = next;
          pushHistory({
            type: 'number', el, selector: getElementSelector(el),
            oldValue: orig, newValue: next,
            undo() { if (this.el?.isConnected) this.el.innerText = this.oldValue; },
            label: `Number changed on ${el.tagName.toLowerCase()}: ${truncate(chosen,16)} → ${truncate(rep,16)}`
          });
        }, 80);
      });
    });
    numPicker.classList.add('open');
  }

  // ── Refs ──────────────────────────────────────────────────────────────────
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
  function hasUsefulText(el) { return (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim().length > 0; }
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
      if (isCandidate(el) && (el.innerText||'').trim().length <= 300) return el;
      el = el.parentElement;
    }
    return null;
  }
  function clearHighlight() { if (state.hoveredEl) { state.hoveredEl.classList.remove('mpe-highlight'); state.hoveredEl = null; } }
  function setHighlight(el) { if (state.hoveredEl === el) return; clearHighlight(); if (el) { el.classList.add('mpe-highlight'); state.hoveredEl = el; } }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function truncate(s, len=42) { const t = String(s||'').replace(/\s+/g,' ').trim(); return t.length>len ? t.slice(0,len)+'…' : t; }
  function getElementSelector(el) {
    const path=[];
    while(el && el.nodeType===1 && el!==document.body) {
      let sel=el.nodeName.toLowerCase();
      if(el.id){sel+='#'+CSS.escape(el.id);path.unshift(sel);break;}
      let sib=el,nth=1;
      while((sib=sib.previousElementSibling)){if(sib.nodeName.toLowerCase()===el.nodeName.toLowerCase())nth++;}
      sel+=`:nth-of-type(${nth})`;path.unshift(sel);el=el.parentElement;
    }
    return path.join(' > ');
  }

  // ── Badges ────────────────────────────────────────────────────────────────
  function updateBadges() {
    const n = state.history.length;
    badge.textContent = n; badge.style.display = n>0 ? 'flex' : 'none';
    const old = undoBtn.querySelector('.mpe-btn-badge'); if(old) old.remove();
    if (n>0) { const b=document.createElement('div'); b.className='mpe-btn-badge'; b.textContent=n; undoBtn.appendChild(b); }
    stickyBtn.classList.toggle('sticky-on', state.stickyOn);
    stickyBtn.textContent = state.stickyOn ? '📌 Sticky ON' : '📌 Sticky';
  }

  // ── History ───────────────────────────────────────────────────────────────
  function renderHistory() {
    historyList.innerHTML = !state.history.length
      ? `<div class="mpe-history-item">No changes yet.</div>`
      : state.history.slice(-5).reverse().map(item =>
          `<button class="mpe-history-item mpe-history-button" data-hid="${item.id}">${escapeHtml(item.label)}</button>`
        ).join('');
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

  function restoreHistoryFromSticky(saved) {
    saved.forEach(s => {
      let el=null; try { el=document.querySelector(s.selector); } catch {}
      state.history.push({
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        type: s.type, selector: s.selector, el,
        oldValue: s.oldValue, newValue: s.newValue, label: s.label,
        undo() {
          const t=this.el?.isConnected ? this.el : (this.selector ? document.querySelector(this.selector) : null);
          if (!t) return;
          if (this.type==='text'||this.type==='number') t.innerText=this.oldValue;
          if (this.type==='hide') t.classList.remove('mpe-hidden-by-script');
        }
      });
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function updateText(el, newText) {
    const old=el.innerText; if(!newText||newText===old) return;
    el.innerText=newText;
    pushHistory({
      type:'text', el, selector:getElementSelector(el), oldValue:old, newValue:newText,
      undo() { const t=this.el?.isConnected?this.el:document.querySelector(this.selector); if(t) t.innerText=this.oldValue; },
      label:`Text edited on ${el.tagName.toLowerCase()}: ${truncate(newText)}`
    });
  }

  function hideElement(el) {
    if(el.classList.contains('mpe-hidden-by-script')) return;
    el.classList.add('mpe-hidden-by-script');
    pushHistory({
      type:'hide', el, selector:getElementSelector(el), oldValue:null, newValue:null,
      undo() { const t=this.el?.isConnected?this.el:document.querySelector(this.selector); if(t) t.classList.remove('mpe-hidden-by-script'); },
      label:`Element hidden (${getElementSelector(el).slice(0,50)})`
    });
  }

  function undoLast() { const last=state.history.pop(); if(!last) return; try{last.undo();}catch(e){} renderHistory(); }
  function undoSpecific(id) {
    const i=state.history.findIndex(x=>x.id===id); if(i===-1) return;
    try{state.history[i].undo();}catch(e){} state.history.splice(i,1); renderHistory();
  }
  function resetAll() { [...state.history].reverse().forEach(item=>{try{item.undo();}catch(e){}}); state.history=[]; renderHistory(); }

  function toggleSticky() {
    state.stickyOn=!state.stickyOn; setStickyEnabled(state.stickyOn);
    if(!state.stickyOn) stickyClear(); else stickySave(state.history);
    renderHistory();
  }
  function clearSticky() {
    stickyClear();
    tipEl.textContent='Sticky cleared — changes still active this session.';
    setTimeout(()=>setMode(state.mode),2200);
  }

  // ── UI mode ───────────────────────────────────────────────────────────────
  function setMode(mode) {
    state.mode=mode; state.active=!!mode;
    toolbarBtns.forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    if(!mode) { tipEl.textContent='Choose a mode, then tap an element on the page.'; clearHighlight(); return; }
    if(mode==='text')   tipEl.textContent='Text mode — tap any text on the page.';
    if(mode==='number') tipEl.textContent='Number mode — tap element to pick a number.';
    if(mode==='hide')   tipEl.textContent='Hide mode — tap any visible element.';
  }

  function closeUI() { clearHighlight(); setMode(null); state.uiVisible=false; root.style.display='none'; }
  function openUI()  {
    root.style.display='block';
    // re-trigger animation
    const p=root.querySelector('#mpe-lite-panel');
    p.style.animation='none'; p.offsetHeight; p.style.animation='';
    state.uiVisible=true;
  }

  // ── Events ────────────────────────────────────────────────────────────────
  launcher.addEventListener('click', ()=>state.uiVisible ? closeUI() : openUI());

  root.addEventListener('click', e=>{
    const hBtn=e.target.closest('.mpe-history-button'); if(hBtn){undoSpecific(hBtn.dataset.hid);return;}
    const btn=e.target.closest('.mpe-btn'); if(!btn) return;
    const {mode,action}=btn.dataset;
    if(mode) { setMode(state.mode===mode?null:mode); return; }
    if(action==='undo')         undoLast();
    if(action==='reset')        resetAll();
    if(action==='sticky')       toggleSticky();
    if(action==='clear-sticky') clearSticky();
    if(action==='close')        closeUI();
  });

  document.addEventListener('pointermove', e=>{
    if(!state.active||!state.uiVisible) return;
    setHighlight(getBestTarget(e.target));
  }, true);

  document.addEventListener('click', e=>{
    if(!state.active||!state.uiVisible) return;
    if(e.target.closest('#mpe-lite-root,#mpe-lite-launcher-wrap,#mpe-num-picker')) return;
    const el=getBestTarget(e.target); if(!el) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if(state.mode==='text')    { const t=prompt('Edit text:',(el.innerText||'').trim()); if(t!==null) updateText(el,t); }
    else if(state.mode==='number') openNumPicker(el);
    else if(state.mode==='hide')   hideElement(el);
  }, true);

  document.addEventListener('scroll', ()=>{
    if(state.hoveredEl&&!isVisible(state.hoveredEl)) clearHighlight();
  }, true);

  // ── Init ──────────────────────────────────────────────────────────────────
  if (state.stickyOn) {
    const saved=stickyLoad();
    if(saved.length){
      saved.forEach(s=>{
        try{
          const el=document.querySelector(s.selector); if(!el) return;
          if(s.type==='text'||s.type==='number') el.innerText=s.newValue;
          if(s.type==='hide') el.classList.add('mpe-hidden-by-script');
        }catch{}
      });
      restoreHistoryFromSticky(saved);
    }
  }
  renderHistory();
})();
