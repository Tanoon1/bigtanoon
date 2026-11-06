// Random daily events, Big Brother twists, the dog NPC, mystery packages & letters
import { ROOMS, SECRET_SPOT } from '../../shared/layout.js';
import { pick, shuffle, now, rand } from '../util.js';

const LETTERS = [
  'מתוק/ה שלנו, כל הבית בבית צופה בך כל ערב. סבתא אומרת שאת/ה צריך/ה לאכול יותר. אוהבים, המשפחה ❤️',
  'אחי, החתול התגעגע. הוא ישן על הכרית שלך כל לילה. תנצח בשבילו. 🐱',
  'אמא כאן. ראיתי את הקטטה עם הכרית. אני לא כועסת, רק מאוכזבת. תתנהג/י יפה. 😅',
  'כל השכונה מצביעה בשבילך! יש לך שלט ענק במרפסת. אל תוותר/י! 🎉',
  'תזכור/י מי את/ה. אל תתני לאף אחד להוציא אותך משם. אנחנו גאים. 🌟',
  'הכלב אכל את השלט שהכנו לך. מכינים חדש. מתגעגעים! 🐶',
];

const PACKAGE_OUTCOMES = [
  { w: 3, id: 'coins' }, { w: 2, id: 'xray' }, { w: 2, id: 'megaphone' }, { w: 2, id: 'prank' }, { w: 1, id: 'immunity' }, { w: 2, id: 'confetti' },
];

export const EVENT_DEFS = {
  power: { label: 'הפסקת חשמל', icon: '⚡' },
  dog: { label: 'כלב בבית', icon: '🐶' },
  letter: { label: 'מכתב מהבית', icon: '✉️' },
  party: { label: 'מסיבת ערב', icon: '🪩' },
  package: { label: 'חבילה מסתורית', icon: '📦' },
  scandal: { label: 'שערורייה', icon: '📰' },
  heatwave: { label: 'גל חום', icon: '🥵' },
  yardParty: { label: 'מסיבת לילה בחצר', icon: '🎆' },
  pajama: { label: 'מסיבת פיג׳מות', icon: '🛌' },
  bbq: { label: 'מנגל מהשמיים', icon: '🍖' },
};

export const TWIST_DEFS = {
  longNight: { label: 'הלילה הארוך', icon: '🌑', desc: 'חושך מוחלט + השתקה של חצי מהדיירים ל-60 שניות', cd: 120 },
  swap: { label: 'החלפת מקומות', icon: '🔀', desc: 'כל הדיירים מוחלפים במקומות בכוח', cd: 60 },
  surprise: { label: 'פינוי פתע', icon: '🚪', desc: 'מדלגים ישר למועמדויות ולפינוי – עכשיו!', cd: 300 },
  secretPlayer: { label: 'דייר סודי', icon: '🕵️', desc: 'פותחים את החדר הסודי ומשחררים את הדיירים שמחכים בו', cd: 30 },
  lockDoors: { label: 'נעילת דלתות', icon: '🔒', desc: 'כל הדלתות ננעלות ל-45 שניות', cd: 90 },
  doubleEviction: { label: 'פינוי כפול', icon: '✌️', desc: 'הלילה מפנים שני דיירים', cd: 600 },
  blackoutVote: { label: 'הצבעה בחושך', icon: '🕯️', desc: 'ליל הפינוי הבא יתקיים בחושך מוחלט', cd: 600 },
};

export class Events {
  constructor(room) {
    this.room = room;
    this.dog = null;
    this.cooldowns = {};
    this.goldenFound = false;
  }

  tick(dt) {
    const d = this.dog;
    if (d) {
      if (now() > d.until) { this.dog = null; this.room.toast(null, 'הכלב יצא מהבית. 🐶👋'); this.room.markState(); return; }
      // follow nearest player sometimes, otherwise wander
      if (now() > d.retarget) {
        d.retarget = now() + rand(2500, 5000);
        const hgs = this.room.alive().filter((p) => p.connected);
        if (hgs.length && Math.random() < 0.6) { const p = pick(hgs); d.tx = p.pos.x + rand(-1, 1); d.tz = p.pos.z + rand(-1, 1); }
        else { const r = pick(ROOMS.filter((x) => ['living', 'kitchen', 'yard', 'bedroom'].includes(x.id))); d.tx = rand(r.rect[0] + 1, r.rect[2] - 1); d.tz = rand(r.rect[1] + 1, r.rect[3] - 1); }
      }
      const dx = d.tx - d.x, dz = d.tz - d.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.6) {
        const sp = Math.min(l, 3.2 * dt);
        const nx = d.x + (dx / l) * sp, nz = d.z + (dz / l) * sp;
        // dog uses simple collision: abort target if blocked
        const blocked = this.room.colliders.some((c) => c.y2 > 0.4 && nx > c.x1 - 0.2 && nx < c.x2 + 0.2 && nz > c.z1 - 0.2 && nz < c.z2 + 0.2);
        if (blocked) d.retarget = 0; else { d.x = nx; d.z = nz; d.yaw = Math.atan2(dx, dz); }
        d.moving = true;
      } else d.moving = false;
    }
  }

  dogSnap() { const d = this.dog; return d ? [r2(d.x), r2(d.z), r2(d.yaw), d.moving ? 1 : 0] : null; }

  randomDaily() {
    const opts = ['power', 'dog', 'letter', 'party', 'package', 'scandal', 'heatwave', 'yardParty', 'pajama', 'bbq'];
    return this.trigger(pick(opts));
  }

  trigger(id) {
    const r = this.room;
    switch (id) {
      case 'power':
        r.applyEffect('dark', true, 20);
        r.announce('⚡ הפסקת חשמל! הבית נכנס לחושך...', { sound: 'powerdown' });
        break;
      case 'dog':
        this.dog = { x: -1, z: 9, tx: 0, tz: 4, yaw: 0, until: now() + 120000, retarget: 0, moving: false };
        r.announce('🐶 כלב נכנס לבית! תלטפו אותו (E).', { sound: 'bark' });
        break;
      case 'letter': {
        const target = pick(r.alive());
        if (!target) return false;
        const it = r.items.spawn('letter', -2.0, 1.3, 7.0, { fixed: true, for: target.id });
        it.meta.text = pick(LETTERS);
        r.toast(target, '✉️ יש לך מכתב מהבית! לך לתיבת הדואר בחצר.', 'gold');
        r.announce(`✉️ הגיע מכתב מהבית... בשביל ${target.name}.`);
        break;
      }
      case 'party':
        r.applyEffect('party', true, 60);
        r.setMusic('party', 60);
        r.announce('🪩 מסיבת ערב! כולם לרחבה!', { sound: 'party' });
        break;
      case 'package': {
        r.items.spawn('package', 0.7, 0.6, 0.2, { fixed: true });
        r.announce('📦 חבילה מסתורית הונחה בסלון. מי יעז לפתוח?', { sound: 'ding' });
        break;
      }
      case 'scandal': {
        const text = this.scandalText();
        r.announce(`📰 שערורייה בבית! ${text}`, { sound: 'sting' });
        r.addDrama(15);
        break;
      }
      case 'yardParty':
        r.applyEffect('party', true, 90);
        r.applyEffect('yardParty', true, 90);
        r.setMusic('party', 90);
        r.lights.yard = 1;
        r.announce('🎆 מסיבת לילה בחצר! כולם החוצה – עכשיו!', { sound: 'party' });
        r.broadcast({ t: 'ev', k: 'fireworks' });
        break;
      case 'pajama':
        r.applyEffect('pajama', true, 120);
        for (const [x, z] of [[-14.6, -2.6], [-14.6, 0], [-14.6, 2.6], [-11, 0], [-11, 3]]) r.items.spawn('pillow', x, 0.3, z);
        r.setMusic('calm', 120);
        r.announce('🛌 מסיבת פיג׳מות! כולם בפיג׳מה, לחדר השינה – כריות מחכות.', { sound: 'party' });
        break;
      case 'bbq':
        r.life.grill = { skewers: 16, landedAt: now() + 3500 };
        r.announce('🍖 משהו נוחת מהשמיים בחצר... מנגל! גשו לעשות על האש.', { sound: 'whoosh' });
        r.broadcast({ t: 'ev', k: 'bbqDrop' });
        break;
      case 'heatwave':
        r.applyEffect('heat', true, 40);
        r.announce('🥵 גל חום! מי שנכנס לבריכה ב-40 השניות הקרובות מקבל 15 מטבעות.', { sound: 'ding' });
        this.heatPaid = new Set();
        break;
      default:
        return false;
    }
    r.stats.events = (r.stats.events || 0) + 1;
    r.dayLog.events.push(id);
    r.markState();
    return true;
  }

  scandalText() {
    const r = this.room;
    const al = r.alive();
    const pairs = r.topPairs(1);
    const options = [];
    const betrayer = al.filter((p) => p.day.betrayals > 0)[0];
    if (betrayer) options.push(`מישהו בבית הצביע נגד בן ברית שלו... ואנחנו יודעים מי. רמז: השם שלו מתחיל ב-"${betrayer.name[0]}".`);
    if (pairs.length) {
      const [a, b] = pairs[0];
      const pa = r.players.get(a), pb = r.players.get(b);
      if (pa && pb) options.push(`${pa.name} ו${pb.name} מדברים המון בשקט. מה הם מתכננים?`);
    }
    const fighter = al.slice().sort((a, b) => b.stats.hitsGiven - a.stats.hitsGiven)[0];
    if (fighter && fighter.stats.hitsGiven > 0) options.push(`${fighter.name} הרביץ כבר ${fighter.stats.hitsGiven} פעמים. מישהו עוצר אותו?`);
    const fridge = al.slice().sort((a, b) => b.stats.fridge - a.stats.fridge)[0];
    if (fridge && fridge.stats.fridge > 1) options.push(`${fridge.name} פתח את המקרר ${fridge.stats.fridge} פעמים. החטיפים נעלמים...`);
    options.push('אחד מכם משקר לכולם. ואנחנו שומעים הכול.');
    return pick(options);
  }

  openPackage(p, it) {
    const r = this.room;
    r.items.remove(it.id);
    let tot = PACKAGE_OUTCOMES.reduce((s, o) => s + o.w, 0);
    let x = Math.random() * tot, out = PACKAGE_OUTCOMES[0];
    for (const o of PACKAGE_OUTCOMES) { x -= o.w; if (x <= 0) { out = o; break; } }
    switch (out.id) {
      case 'coins': r.giveCoins(p, 40); r.toast(null, `📦 ${p.name} פתח את החבילה ומצא 40 מטבעות!`); break;
      case 'xray': r.givePower(p, 'xray'); r.toast(null, `📦 ${p.name} קיבל משקפי רנטגן!`); break;
      case 'megaphone': r.givePower(p, 'megaphone'); r.toast(null, `📦 ${p.name} מצא מגפון!`); break;
      case 'immunity': r.givePower(p, 'immunity'); r.toast(null, `📦 ${p.name} מצא... חסינות! 🛡️`); r.addDrama(10); break;
      case 'prank': r.applyEffect('voicePersonal', { id: p.id, v: 'chipmunk' }, 30); r.toast(null, `📦 ${p.name} פתח את החבילה ו... קיבל קול של סנאי ל-30 שניות 🐿️`); break;
      default: r.toast(null, `📦 קונפטי! ${p.name} פתח חבילה ריקה. האח הגדול צוחק.`); break;
    }
    r.broadcast({ t: 'ev', k: 'confetti', x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z });
    r.stat(p, 'packages');
  }

  readLetter(p, it) {
    if (it.meta.for !== p.id) { this.room.toast(p, 'המכתב הזה לא בשבילך... אבל אפשר לרכל עליו.'); return; }
    this.room.send(p, { t: 'ev', k: 'letter', text: it.meta.text });
    this.room.items.remove(it.id);
    this.room.rep(p, 2);
    this.room.stat(p, 'letters');
  }

  // ---------------- twists (Big Brother only) ----------------
  twist(id, bb) {
    const r = this.room;
    const def = TWIST_DEFS[id];
    if (!def) return false;
    if ((this.cooldowns[id] || 0) > now()) { r.toast(bb, `טוויסט בקירור (${Math.ceil((this.cooldowns[id] - now()) / 1000)} ש׳)`); return false; }
    const alive = r.alive();
    switch (id) {
      case 'longNight': {
        r.applyEffect('dark', true, 60);
        const muted = shuffle(alive).slice(0, Math.floor(alive.length / 2)).map((p) => p.id);
        r.applyEffect('muted', muted, 60);
        r.announce('🌑 הלילה הארוך מתחיל. חלק מכם איבדו את הקול...', { sound: 'sting' });
        break;
      }
      case 'swap': {
        const a = shuffle(alive.filter((p) => p.connected && !r.isIsolated(p)));
        const pos = a.map((p) => ({ ...p.pos }));
        a.forEach((p, i) => { const q = pos[(i + 1) % pos.length]; r.teleport(p, q.x, q.z, q.y); });
        r.announce('🔀 החלפת מקומות! כל אחד במקום של מישהו אחר.', { sound: 'whoosh' });
        break;
      }
      case 'surprise':
        if (!r.surpriseEviction()) { r.toast(bb, 'אי אפשר לעשות פינוי פתע עכשיו'); return false; }
        break;
      case 'secretPlayer': {
        const waiting = alive.filter((p) => p.secretWaiting);
        r.doors.d_secret.locked = false; r.doors.d_secret.open = true;
        r.updateColliders();
        if (waiting.length) {
          for (const p of waiting) p.secretWaiting = false;
          r.announce(`🕵️ החדר הסודי נפתח! ${r.names(waiting.map((p) => p.id))} מצטרפים לבית!`, { sound: 'sting' });
          r.addDrama(20);
        } else r.announce('🕵️ החדר הסודי נפתח... מי יגלה מה יש בפנים?', { sound: 'sting' });
        break;
      }
      case 'lockDoors':
        r.applyEffect('lockDoors', true, 45);
        for (const d of Object.values(r.doors)) { d.open = false; }
        r.updateColliders();
        r.announce('🔒 כל הדלתות ננעלו! תישארו איפה שאתם.', { sound: 'lock' });
        break;
      case 'doubleEviction':
        if (alive.length < 5) { r.toast(bb, 'צריך לפחות 5 דיירים לפינוי כפול'); return false; }
        r.flags.doubleEviction = true;
        r.announce('✌️ הלילה... שני דיירים יעזבו את הבית.', { sound: 'sting' });
        r.addDrama(20);
        break;
      case 'blackoutVote':
        r.flags.blackoutVote = true;
        r.toast(bb, 'ליל הפינוי הבא יהיה בחושך');
        break;
    }
    this.cooldowns[id] = now() + def.cd * 1000;
    r.stats.twists = (r.stats.twists || 0) + 1;
    r.addDrama(10);
    r.markState();
    return true;
  }

  goldenEye(p) {
    if (this.goldenFound) { this.room.toast(p, 'מישהו כבר מצא את העין המוזהבת. 👁️'); return; }
    this.goldenFound = true;
    this.room.giveCoins(p, 30);
    this.room.toast(null, `👁️✨ ${p.name} מצא את העין המוזהבת הסודית! +30 מטבעות`, 'gold');
    this.room.sfx('jingle', null);
    this.room.stat(p, 'easterEggs');
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
export { SECRET_SPOT };
