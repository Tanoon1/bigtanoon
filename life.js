// UI for house life: budget tablet, fridge, stove, wardrobe room, BB decision, romance, viewer bar
import { el, esc, $, $$, on } from './dom.js';
import { FOODS, FOOD_BY_ID, RECIPES } from '../../../shared/food.js';
import { COLORS, OUTFITS, HATS, HAIRS, HAIR_COLORS, EMOJIS } from '../../../shared/customization.js';
import { audio } from '../audio/Audio.js';

export function openTablet(hud) {
  const draw = () => {
    const s = hud.s, L = s.life;
    const active = s.phase.id === 'budget';
    const m = hud.modals.get('tablet') || hud.modal('tablet', '<div class="tbody"></div>', { wide: true, keepInput: false });
    const body = $('.tbody', m);
    const left = L.budget - L.cartTotal;
    body.innerHTML = `<h2>📱 טאבלט התקציב</h2>
      <div class="row"><span class="chip">💰 תקציב: ₪${L.budget}</span><span class="chip">🛒 בעגלה: ₪${L.cartTotal}</span><span class="chip" style="color:${left < 30 ? 'var(--red)' : 'var(--green)'}">נשאר: ₪${left}</span></div>
      <p class="muted">${active ? 'העגלה משותפת לכל הבית – כל שינוי מופיע אצל כולם. המשלוח יגיע מחר בבוקר.' : 'ההזמנה פתוחה רק בישיבת תקציב. כאן אפשר לראות מה יש במקרר.'}</p>
      <div class="shop">${FOODS.map((f) => {
        const n = L.cart[f.id] || 0, have = L.pantry[f.id] || 0;
        return `<div class="item"><div class="ic">${f.icon}</div><b>${esc(f.name)}</b><div class="pr">₪${f.price}</div><div class="muted" style="font-size:12px">במקרר: ${have}</div>
          ${active ? `<div class="row" style="justify-content:center;margin-top:6px"><button class="btn sm ghost" data-f="${f.id}" data-d="-1">−</button><b style="min-width:22px">${n}</b><button class="btn sm" data-f="${f.id}" data-d="1">+</button></div>` : ''}</div>`;
      }).join('')}</div>`;
    on(body, '[data-f]', 'click', (e, b) => { hud.send({ t: 'cart', id: b.dataset.f, d: Number(b.dataset.d) }); audio.sfx('tick'); });
  };
  draw();
  hud.tabletRedraw = draw;
}

export function openFridge(hud) {
  const L = hud.s.life;
  const items = Object.entries(L.pantry).filter(([, n]) => n > 0).map(([id, n]) => ({ f: FOOD_BY_ID[id], n })).filter((x) => x.f);
  const m = hud.modal('fridge', `<h2>🧊 המקרר</h2>
    ${items.length ? `<div class="shop">${items.map(({ f, n }) => `<div class="item"><div class="ic">${f.icon}</div><b>${esc(f.name)}</b><div class="muted">×${n}</div>
      <div class="row" style="justify-content:center;margin-top:6px">${f.eat ? `<button class="btn sm" data-eat="${f.id}">אכול</button>` : ''}<button class="btn sm ghost" data-hold="${f.id}">קח ביד</button></div></div>`).join('')}</div>`
      : '<p>המקרר ריק! 😱 חכו לישיבת התקציב הבאה, או תשכנעו את האח הגדול.</p>'}
    <p class="muted" style="margin-top:8px">רעב: ${hud.me.hunger}/100 • מצרכים לבישול – בכיריים במטבח.</p>`, { wide: true });
  on(m, '[data-eat]', 'click', (e, b) => { hud.send({ t: 'fridgeTake', id: b.dataset.eat, mode: 'eat' }); hud.closeModal('fridge'); });
  on(m, '[data-hold]', 'click', (e, b) => { hud.send({ t: 'fridgeTake', id: b.dataset.hold, mode: 'hold' }); hud.closeModal('fridge'); });
}

export function openStove(hud) {
  const L = hud.s.life;
  const can = (r) => Object.entries(r.need).every(([k, n]) => (L.pantry[k] || 0) >= n);
  const list = RECIPES.filter((r) => !r.grillOnly);
  const m = hud.modal('stove', `<h2>🍳 הכיריים</h2>${L.cooking ? '<p>משהו כבר מתבשל... 🍲</p>' : ''}
    <div class="shop">${list.map((r) => `<button class="item" data-r="${r.id}" ${can(r) && !L.cooking ? '' : 'disabled style="opacity:.45"'}><div class="ic">${r.icon}</div><b>${esc(r.name)}</b>
      <div class="muted" style="font-size:12px">${Object.entries(r.need).map(([k, n]) => `${FOOD_BY_ID[k].icon}×${n}`).join(' ')}</div><div class="pr">${r.makes} מנות</div></button>`).join('')}</div>`, { wide: true });
  on(m, '[data-r]', 'click', (e, b) => { hud.send({ t: 'cook', id: b.dataset.r }); hud.closeModal('stove'); });
}

export function openCloset(hud) {
  const me = hud.s.players.find((p) => p.id === hud.me.id);
  const look = { ...me.look };
  const opt = (k, arr) => arr.map((o) => `<button class="opt ${look[k] === o.id ? 'on' : ''}" data-k="${k}" data-v="${o.id}">${esc(o.label)}</button>`).join('');
  const sw = (k, arr) => arr.map((c) => `<button class="sw ${look[k] === c ? 'on' : ''}" style="background:${c}" data-k="${k}" data-v="${c}"></button>`).join('');
  const m = hud.modal('closet', `<h2>👗 חדר הארונות</h2>
    <div class="field"><label>צבע הבגדים</label><div class="swatches">${sw('color', COLORS)}</div></div>
    <div class="field"><label>תלבושת</label><div class="row">${opt('outfit', OUTFITS)}</div></div>
    <div class="field"><label>שיער</label><div class="row">${opt('hair', HAIRS)}</div><div class="swatches">${sw('hairColor', HAIR_COLORS)}</div></div>
    <div class="field"><label>כובע</label><div class="row">${opt('hat', HATS)}</div></div>
    <div class="field"><label>אימוג׳י</label><div class="row">${EMOJIS.map((e) => `<button class="emo ${look.emoji === e ? 'on' : ''}" data-k="emoji" data-v="${e}">${e || '∅'}</button>`).join('')}</div></div>
    <button class="btn" data-a="ok" style="width:100%;margin-top:10px">✨ התלבש</button>`, { wide: true });
  on(m, '[data-k]', 'click', (e, b) => { look[b.dataset.k] = b.dataset.v; $$(`[data-k="${b.dataset.k}"]`, m).forEach((x) => x.classList.toggle('on', x === b)); audio.sfx('click'); });
  on(m, '[data-a=ok]', 'click', () => { hud.send({ t: 'look', look }); hud.closeModal('closet'); audio.sfx('confetti'); });
}

export function openDecision(hud) {
  if (hud.hasModal('decide')) return;
  const s = hud.s, d = s.phase.data;
  const noms = s.players.filter((p) => d.nominees.includes(p.id));
  const picks = [];
  const m = hud.modal('decide', `<h2>👁️ ההחלטה שלך</h2>
    <p class="muted">הדיירים הצביעו – אבל רק אתה מחליט. הקולות (רק אתה רואה):</p>
    <div class="vote-big">${noms.map((p) => `<button class="pcard" data-pid="${p.id}"><span style="font-size:30px">${esc(p.look.emoji || '👤')}</span>${esc(p.name)}<br><small class="muted">${d.counts?.[p.id] ?? 0} קולות</small></button>`).join('')}</div>
    ${d.canFake ? '<label class="row" style="margin-top:12px"><input type="checkbox" data-fake> 🎭 הדחה מזויפת (פעם אחת בעונה): הדייר "יודח", יצפה בבית בסתר ויחזור מאוחר יותר</label>' : ''}
    <button class="btn red" data-a="go" style="width:100%;margin-top:12px" disabled>🚪 הדח (${d.n})</button>`, { wide: true, noClose: true });
  on(m, '[data-pid]', 'click', (e, b) => {
    const id = b.dataset.pid; const i = picks.indexOf(id);
    if (i >= 0) picks.splice(i, 1); else { picks.push(id); if (picks.length > d.n) picks.shift(); }
    $$('[data-pid]', m).forEach((x) => x.classList.toggle('on', picks.includes(x.dataset.pid)));
    $('[data-a=go]', m).disabled = picks.length !== d.n;
  });
  on(m, '[data-a=go]', 'click', () => { hud.send({ t: 'bb', c: 'decide', ids: picks, fake: !!$('[data-fake]', m)?.checked }); hud.closeModal('decide'); });
}

export function romanceInvite(hud, from, name) {
  const m = hud.modal('romance', `<h2>💕 הזמנה</h2><p><b>${esc(name)}</b> מזמין/ה אותך מתחת לשמיכה... 🙈</p><p class="muted">האורות כבויים, המצלמות מסתכלות הצידה (בערך).</p><div class="row"><button class="btn pink" data-y="1">כן 😏</button><button class="btn ghost" data-y="0">לא הערב</button></div>`, { keepInput: true });
  on(m, '[data-y]', 'click', (e, b) => { hud.send({ t: 'romanceAccept', from, yes: b.dataset.y === '1' }); hud.closeModal('romance'); });
}

// compact camera bar for evicted viewers (ghosts / fake-evicted)
export function renderViewer(hud, s) {
  const cr = hud.app.control;
  if (!cr) return;
  let v = $('.viewer-bar', hud.root);
  const key = cr.mode + ':' + cr.sel + ':' + s.you.role;
  if (v && v.dataset.k === key) return;
  if (!v) { v = el('<div class="viewer-bar panel pe"></div>'); hud.root.appendChild(v); }
  v.dataset.k = key;
  v.innerHTML = `${s.you.role === 'fake' ? '<b style="color:var(--pink)">🎭 הדחה מזויפת – אתה צופה בסוד. האח הגדול יחזיר אותך!</b>' : '<b>👻 פונית – אתה צופה מהמצלמות</b>'}
    <div class="row"><button class="btn sm ${cr.mode === 'grid' ? '' : 'ghost'}" data-cm="grid">▦ כל המצלמות</button><button class="btn sm ${cr.mode === 'single' ? '' : 'ghost'}" data-cm="single">▣ מצלמה</button><button class="btn sm ${cr.mode === 'free' ? '' : 'ghost'}" data-cm="free">🕊️ חופשי</button></div>
    <div class="muted" style="font-size:12px">קליק על מצלמה = האזנה לחדר • 🔊 ${esc(cr.cams[cr.sel]?.name || '')}</div>`;
  on(v, '[data-cm]', 'click', (e, b) => { cr.setMode(b.dataset.cm); renderViewer(hud, hud.s); });
}
export function removeViewer(hud) { $('.viewer-bar', hud.root)?.remove(); }
