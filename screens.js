// Pre-game screens: main menu, character creator (live 3D preview), microphone gate, loading
import * as THREE from 'three';
import { el, esc, $, $$, on } from './dom.js';
import { COLORS, SKINS, OUTFITS, HATS, EMOJIS, HAIRS, HAIR_COLORS, ENTRANCES, defaultLook } from '../../../shared/customization.js';
import { CODE_ALPHABET, CODE_LENGTH, LIMITS } from '../../../shared/constants.js';
import { Avatar } from '../world/Avatar.js';
import { drawEye } from '../world/materials.js';
import { requestMic, micPermissionState } from '../voice/Voice.js';
import { audio } from '../audio/Audio.js';
import { safeGet, safeSet } from '../engine.js';

const root = () => document.getElementById('ui');

export function eyeCanvas(w = 160, h = 90, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  let t = 0, alive = true;
  const g = c.getContext('2d');
  const draw = () => {
    if (!alive || !c.isConnected && t > 1) { alive = false; return; }
    t += 1 / 30;
    g.clearRect(0, 0, c.width, c.height);
    drawEye(g, c.width / 2, c.height / 2, c.height * 0.36, t, { lookX: Math.sin(t * 0.7) * 0.8, open: opts.open ? opts.open(t) : 0.85 + 0.15 * Math.abs(Math.sin(t * 0.3)) });
    setTimeout(() => requestAnimationFrame(draw), 33);
  };
  draw();
  return c;
}

export function showMenu(initialCode) {
  return new Promise((resolve) => {
    const s = el(`<div class="screen bg">
      <div class="menu-card panel">
        <div class="logo-wrap"><img src="/logo.png" alt="האח הגדול"></div>
        <div class="tagline">הבית. המצלמות. הבריתות. רק אחד ינצח.</div>
        <div class="menu-btns">
          <button class="btn" data-a="create">🏠 צור בית חדש</button>
          <button class="btn pink" data-a="join">🔑 הצטרף לבית</button>
          <button class="btn ghost" data-a="how">❓ איך משחקים</button>
        </div>
        <div class="join hidden col" style="margin-top:16px">
          <div class="muted">הקוד שקיבלתם מהמארח:</div>
          <div class="codebox"><input maxlength="${CODE_LENGTH}" autocomplete="off" spellcheck="false" inputmode="latin" placeholder="ABCD"></div>
          <div class="err"></div>
          <button class="btn" data-a="go">המשך ←</button>
        </div>
      </div>
      <div class="foot">3–16 שחקנים • צ׳אט קולי מרחבי • מומלץ עם אוזניות 🎧</div>
    </div>`);
    root().appendChild(s);
    const input = $('input', s);
    const join = $('.join', s);
    const valid = (v) => v.length === CODE_LENGTH && [...v].every((ch) => CODE_ALPHABET.includes(ch));
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH); });
    const go = () => {
      const v = input.value.toUpperCase();
      if (!valid(v)) { $('.err', s).textContent = 'קוד לא תקין – 4 תווים'; return; }
      s.remove(); resolve({ action: 'join', code: v });
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    on(s, '[data-a]', 'click', (e, b) => {
      audio.unlock(); audio.sfx('click');
      const a = b.dataset.a;
      if (a === 'create') { s.remove(); resolve({ action: 'create' }); }
      if (a === 'join') { join.classList.remove('hidden'); input.focus(); }
      if (a === 'go') go();
      if (a === 'how') showHowTo();
    });
    if (initialCode) { join.classList.remove('hidden'); input.value = initialCode.toUpperCase(); }
  });
}

export function showHowTo() {
  const m = el(`<div class="modal-bg"><div class="modal panel wide">
    <button class="close">✕</button>
    <h2>איך משחקים</h2>
    <p>אתם דיירים בבית האח הגדול – בגוף ראשון. מסתובבים חופשי, מדברים בקול עם מי שקרוב אליכם (מי שרחוק או מאחורי קיר נשמע חלש), יוצרים בריתות, מבצעים משימות, ובכל לילה מישהו מפונה. שחקן אחד הוא <b>האח הגדול</b> – צופה בכל המצלמות, שומע את כל החדרים, מכריז, נותן משימות וטוויסטים.</p>
    <div class="kbd-help">
      <kbd>WASD</kbd><span>תנועה (Shift ריצה, Space קפיצה, C התכופפות)</span>
      <kbd>עכבר</kbd><span>הסתכלות • קליק שמאלי: אגרוף / כרית • קליק ימני או G: זריקה</span>
      <kbd>E</kbd><span>אינטראקציה (דלתות, מקרר, ספה, מיטה, חדר וידוי, חפצים, דיירים)</span>
      <kbd>F</kbd><span>דחיפה</span><kbd>Q</kbd><span>הנחת חפץ</span>
      <kbd>V</kbd><span>Push-to-talk (במצב PTT) • <b>M</b> השתקה</span>
      <kbd>1-0</kbd><span>אימוטים (נפנוף, ריקוד, יד, מחיאות, בכי...)</span>
      <kbd>T / Enter</kbd><span>צ׳אט טקסט</span><kbd>Tab</kbd><span>רשימת דיירים</span><kbd>X</kbd><span>כוחות מיוחדים</span><kbd>Esc</kbd><span>תפריט והגדרות</span>
    </div>
    <h3 style="margin-top:14px">מהלך יום</h3>
    <p class="muted">☀️ בוקר ← 📋 משימה ← 🕶️ שעת חופש ← 🎙️ חדר הוידוי (מגישים 2 מועמדים) ← ⚠️ חשיפת מועמדים ← 🔴 ליל פינוי ← 📔 יומן הדרמה. מי שמפונה הופך לקהל (רוח רפאים) – מצביע, שולח תגובות ומגיב.</p>
  </div></div>`);
  root().appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.close')) m.remove(); });
}

// ---------------------------------------------------------------- creator
export function showCreator({ joining, code }) {
  return new Promise((resolve, reject) => {
    let look;
    try { look = { ...defaultLook(), ...JSON.parse(safeGet('bb_look') || '{}') }; } catch { look = defaultLook(); }
    let name = safeGet('bb_name') || '';
    const opt = (key, arr) => arr.map((o) => `<button class="opt ${look[key] === o.id ? 'on' : ''}" data-k="${key}" data-v="${o.id}">${esc(o.label)}</button>`).join('');
    const sw = (key, arr) => arr.map((c) => `<button class="sw ${look[key] === c ? 'on' : ''}" style="background:${c}" data-k="${key}" data-v="${c}" aria-label="${c}"></button>`).join('');
    const s = el(`<div class="screen bg">
      <div class="creator panel">
        <div class="preview"><canvas></canvas></div>
        <div class="opts">
          <h2>${joining ? `מצטרפים לבית <span style="direction:ltr;display:inline-block;color:var(--cyan)">${esc(code)}</span>` : 'הדייר/ת החדש/ה'}</h2>
          <div class="field"><label>השם שלך (יופיע מעל הראש)</label><input type="text" maxlength="${LIMITS.NAME_MAX}" value="${esc(name)}" placeholder="למשל: דני" autocomplete="off"></div>
          <div class="field"><label>צבע</label><div class="swatches">${sw('color', COLORS)}</div></div>
          <div class="field"><label>גוון עור</label><div class="swatches">${sw('skin', SKINS)}</div></div>
          <div class="field"><label>תלבושת</label><div class="row">${opt('outfit', OUTFITS)}</div></div>
          <div class="field"><label>שיער</label><div class="row">${opt('hair', HAIRS)}</div><div class="swatches">${sw('hairColor', HAIR_COLORS)}</div></div>
          <div class="field"><label>כובע</label><div class="row">${opt('hat', HATS)}</div></div>
          <div class="field"><label>אימוג׳י מעל הראש</label><div class="row">${EMOJIS.map((e) => `<button class="emo ${look.emoji === e ? 'on' : ''}" data-k="emoji" data-v="${e}">${e || '∅'}</button>`).join('')}</div></div>
          <div class="field"><label>תנועת כניסה לבית (בפתיח)</label><div class="row">${opt('move', ENTRANCES)}</div></div>
          <div class="err"></div>
          <div class="row"><button class="btn ghost" data-a="back">חזרה</button><button class="btn grow" data-a="ok">${joining ? 'היכנס לבית →' : 'צור את הבית →'}</button></div>
        </div>
      </div>
    </div>`);
    root().appendChild(s);
    // live preview
    const canvas = $('canvas', s);
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdff6ff, 0x203040, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 4, 3); scene.add(dl);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 40), new THREE.MeshStandardMaterial({ color: 0x0b2d44, emissive: 0x062030 }));
    ped.position.y = -0.06; scene.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.02, 6, 60), new THREE.MeshBasicMaterial({ color: 0x22e0ff }));
    ring.rotation.x = Math.PI / 2; scene.add(ring);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    cam.position.set(0, 1.25, 4.4); cam.lookAt(0, 1.0, 0);
    let av = null;
    const rebuild = () => { if (av) scene.remove(av.group); av = new Avatar(look, '', { noTag: true }); scene.add(av.group); };
    rebuild();
    let alive = true, t = 0, last = performance.now();
    const loop = () => {
      if (!alive) return;
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      av.group.rotation.y = Math.sin(t * 0.6) * 0.7;
      av.update(dt, t, cam, {});
      r.render(scene, cam);
      requestAnimationFrame(loop);
    };
    loop();
    const close = () => { alive = false; r.dispose(); s.remove(); };
    on(s, '[data-k]', 'click', (e, b) => {
      const k = b.dataset.k;
      look[k] = b.dataset.v;
      $$(`[data-k="${k}"]`, s).forEach((x) => x.classList.toggle('on', x === b));
      audio.sfx('click');
      rebuild();
      if (k === 'move') av.emote(look.move);
    });
    const inp = $('input', s);
    const ok = () => {
      name = inp.value.trim();
      if (!name) { $('.err', s).textContent = 'צריך שם 🙂'; inp.focus(); return; }
      safeSet('bb_name', name); safeSet('bb_look', JSON.stringify(look));
      close(); resolve({ name, look });
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    on(s, '[data-a]', 'click', (e, b) => { audio.sfx('click'); if (b.dataset.a === 'ok') ok(); else { close(); reject(new Error('back')); } });
  });
}

// ---------------------------------------------------------------- microphone gate
function browserHelp() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return '<b>iPhone / iPad:</b> הגדרות ← Safari ← מיקרופון ← "אפשר". או: לחצו על "aA" בשורת הכתובת ← הגדרות אתר ← מיקרופון ← אפשר. ואז רעננו.';
  if (/Android/.test(ua)) return '<b>אנדרואיד (Chrome):</b> לחצו על סמל המנעול 🔒 ליד הכתובת ← הרשאות ← מיקרופון ← אפשר. ודאו גם שלכרום יש הרשאת מיקרופון בהגדרות הטלפון.';
  if (/Firefox/.test(ua)) return '<b>Firefox:</b> לחצו על סמל המיקרופון/המנעול משמאל לכתובת ← הסירו את החסימה ← רעננו ואשרו.';
  if (/Edg\//.test(ua)) return '<b>Edge:</b> לחצו על המנעול 🔒 ליד הכתובת ← הרשאות לאתר זה ← מיקרופון ← אפשר.';
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return '<b>Safari (Mac):</b> Safari ← הגדרות ← אתרים ← מיקרופון ← בחרו "אפשר" לאתר הזה.';
  return '<b>Chrome:</b> לחצו על סמל המנעול 🔒 (או המצלמה) ליד הכתובת ← מיקרופון ← "אפשר תמיד" ← רעננו את הדף.';
}

export function micGate() {
  return new Promise((resolve) => {
    const s = el(`<div class="screen bg"><div class="mic-card panel col">
      <div class="mic-icon">🎙️</div>
      <h2>האח הגדול צריך לשמוע אתכם</h2>
      <p>במשחק הזה <b>מדברים באמת</b>: שומעים את מי שקרוב, לוחשים בפינות, והאח הגדול שומע הכול. בלי מיקרופון אי אפשר להיכנס לבית.</p>
      <div class="howto hidden"></div>
      <div class="meter hidden"><i></i></div>
      <div class="err"></div>
      <button class="btn" data-a="allow">אשר מיקרופון</button>
      <div class="muted" style="font-size:13px">🎧 מומלץ להשתמש באוזניות כדי למנוע הד</div>
    </div></div>`);
    root().appendChild(s);
    const err = $('.err', s), how = $('.howto', s), btn = $('[data-a=allow]', s);
    const tryMic = async () => {
      audio.unlock();
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'ממתין לאישור...';
      try {
        const stream = await requestMic();
        // short level check so the player sees it works
        const ctx = audio.ctx; const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); src.connect(an);
        const buf = new Float32Array(an.fftSize); const meter = $('.meter', s); meter.classList.remove('hidden');
        btn.textContent = 'מעולה! נכנסים...';
        let n = 0;
        const tick = () => { an.getFloatTimeDomainData(buf); let q = 0; for (const v of buf) q += v * v; $('.meter i', s).style.width = Math.min(100, Math.sqrt(q / buf.length) * 900) + '%'; if (++n < 40) requestAnimationFrame(tick); else { src.disconnect(); s.remove(); resolve(stream); } };
        tick();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'נסה שוב';
        if (e.code === 'insecure') { err.textContent = 'הדפדפן מאפשר מיקרופון רק באתר מאובטח (HTTPS) או ב-localhost.'; }
        else if (e.name === 'NotFoundError') err.textContent = 'לא נמצא מיקרופון במכשיר. חברו מיקרופון או אוזניות עם מיקרופון.';
        else if (e.name === 'NotReadableError') err.textContent = 'המיקרופון תפוס על ידי אפליקציה אחרת (זום? דיסקורד?). סגרו אותה ונסו שוב.';
        else err.textContent = 'הגישה למיקרופון נחסמה.';
        how.innerHTML = browserHelp();
        how.classList.remove('hidden');
      }
    };
    btn.addEventListener('click', tryMic);
    micPermissionState().then((st) => { if (st === 'granted') tryMic(); if (st === 'denied') { how.innerHTML = browserHelp(); how.classList.remove('hidden'); } });
  });
}

// ---------------------------------------------------------------- loading
const TIPS = ['טיפ: מאחורי קיר שומעים אתכם חלש ועמום. דלת סגורה = פרטיות (בערך).', 'טיפ: בחדר הוידוי מגישים מועמדים. האח הגדול שומע כל מילה.', 'טיפ: אפשר להציע ברית לדייר – הסתכלו עליו ולחצו E.', 'טיפ: שמעתם על העין המוזהבת? מישהו החביא אותה בחצר...', 'טיפ: מי שמתחיל קטטה – האח הגדול רואה. ולא שוכח.', 'טיפ: Tab מציג את רשימת הדיירים.'];
let loadingEl = null;
export function showLoading(text = 'טוען את הבית...', p = 0.1) {
  if (!loadingEl) {
    loadingEl = el(`<div class="loading"><div class="eyeslot"></div><div class="txt" style="font-family:var(--display);font-size:24px"></div><div class="bar"><i></i></div><div class="tip"></div></div>`);
    $('.eyeslot', loadingEl).appendChild(eyeCanvas(220, 120));
    $('.tip', loadingEl).textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    root().appendChild(loadingEl);
  }
  $('.txt', loadingEl).textContent = text;
  $('.bar i', loadingEl).style.width = Math.round(p * 100) + '%';
}
export function hideLoading() { loadingEl?.remove(); loadingEl = null; }
