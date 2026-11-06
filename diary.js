// Drama diary (end of day) & end-of-season awards – real game data + funny templates
import { shuffle, pick } from '../util.js';

const fmtMin = (s) => (s >= 90 ? `${Math.round(s / 60)} דקות` : `${Math.round(s)} שניות`);

function top(players, key, min = 1) {
  let best = null;
  for (const p of players) if ((p.day[key] || 0) >= min && (!best || p.day[key] > best.day[key])) best = p;
  return best;
}

export function dayJournal(room) {
  const ps = [...room.players.values()].filter((p) => p.role === 'hg' || (p.role === 'ghost' && p.evictedDay === room.phase.day));
  const lines = [];
  const add = (text, w = 1) => lines.push({ text, w });

  const crier = ps.find((p) => p.day.votesReceived > 0 && (p.day.bedTime > 15 || p.day.cries > 0));
  if (crier) add(`${crier.name} קיבל ${crier.day.votesReceived} קולות ו${crier.day.cries ? 'בכה בפומבי' : 'הסתגר בחדר השינה'}. 😭`, 3);
  const hitter = top(ps, 'hitsGiven');
  if (hitter) add(`${hitter.name} חילק ${hitter.day.hitsGiven} מכות היום והכריז על עצמו כמתאגרף הבית. 🥊`, 2);
  const starter = top(ps, 'fightsStarted');
  if (starter && starter !== hitter) add(`${starter.name} התחיל ${starter.day.fightsStarted > 1 ? starter.day.fightsStarted + ' קטטות' : 'קטטה'}. האח הגדול רשם לעצמו. 📝`, 2);
  const fridge = top(ps, 'fridge', 2);
  if (fridge) add(`${fridge.name} פתח את המקרר ${fridge.day.fridge} פעמים. המקרר שוקל להגיש תלונה. 🧊`);
  const pool = top(ps, 'poolTime', 12);
  if (pool) add(`${pool.name} בילה ${fmtMin(pool.day.poolTime)} בבריכה. נראה שהוא מתכנן לגור שם. 🏊`);
  const talker = top(ps, 'talk', 20);
  if (talker) add(`${talker.name} דיבר ${fmtMin(talker.day.talk)} היום. אף אחד לא זוכר על מה. 🗣️`);
  const quiet = ps.filter((p) => p.role === 'hg' && p.connected).sort((a, b) => a.day.talk - b.day.talk)[0];
  if (quiet && talker && quiet !== talker && quiet.day.talk < 8) add(`${quiet.name} כמעט לא הוציא מילה. השקט שלו מדאיג את כולם. 🤐`);
  const pairs = room.topPairs(1, true);
  if (pairs.length && pairs[0][2] > 15) {
    const a = room.players.get(pairs[0][0]), b = room.players.get(pairs[0][1]);
    if (a && b) add(`${a.name} ו${b.name} דיברו ביחד ${fmtMin(pairs[0][2])}. רומן? ברית? האח הגדול יודע. 💕`, 2);
  }
  const wet = top(ps, 'wet');
  if (wet) add(`${wet.name} נרטב ${wet.day.wet > 1 ? wet.day.wet + ' פעמים' : 'מכוס מים'}. מישהו פה לא אוהב אותו. 💦`);
  const piano = top(ps, 'piano', 3);
  if (piano) add(`${piano.name} ניגן בפסנתר ${piano.day.piano} פעמים. השכנים מתלוננים. 🎹`);
  const dancer = top(ps, 'dances', 2);
  if (dancer) add(`${dancer.name} רקד ${dancer.day.dances} פעמים. מישהו תעצור אותו. 💃`);
  const walker = top(ps, 'distance', 150);
  if (walker) add(`${walker.name} הלך ${Math.round(walker.day.distance)} מטרים בתוך הבית. כושר של מרתוניסט. 🏃`);
  const sleeper = top(ps, 'sleep', 10);
  if (sleeper) add(`${sleeper.name} ישן ${fmtMin(sleeper.day.sleep)} באמצע היום. החיים קשים. 😴`);
  const chatter = top(ps, 'chats', 5);
  if (chatter) add(`${chatter.name} שלח ${chatter.day.chats} הודעות טקסט. מקלדת לוהטת. ⌨️`);
  const snake = top(ps, 'betrayals');
  if (snake) add(`${snake.name} בגד היום במישהו שסמך עליו. 🐍 ססס...`, 2);
  const thrower = top(ps, 'throws', 3);
  if (thrower) add(`${thrower.name} זרק ${thrower.day.throws} חפצים. הבית נראה כמו שדה קרב. 🍅`);
  const showered = ps.filter((p) => p.day.shower > 0);
  const dirty = ps.filter((p) => p.role === 'hg' && p.connected && !p.day.shower);
  if (showered.length && dirty.length) add(`${pick(dirty).name} עדיין לא התקלח. הבית מריח את זה. 🚿`);
  for (const [a, b] of room.dayLog.romance || []) add(`השמיכה של ${a} ו${b} זזה באופן חשוד בלילה. האח הגדול ראה הכול (ובחר לא לשדר). 🙈`, 3);
  const cook = top(ps, 'cooked');
  if (cook) add(`${cook.name} עמד/ה במטבח ובישל/ה ${cook.day.cooked > 1 ? cook.day.cooked + ' פעמים' : ''}. שף הבית! 👩‍🍳`);
  const tanner = ps.find((p) => p.burned);
  if (tanner) add(`${tanner.name} נשכח/ה בשמש ויצא/ה אדום/ה כמו סרטן. 🦞`);
  const dresser = top(ps, 'outfits', 2);
  if (dresser) add(`${dresser.name} החליף/ה בגדים ${dresser.day.outfits} פעמים. תצוגת אופנה בחדר הארונות. 👗`);
  if (room.dayLog.taskWinners.length) add(`${room.names(room.dayLog.taskWinners)} ניצח במשימה והסתובב עם חיוך מעצבן. 🏆`);
  if (room.dayLog.confessions.length) add(`וידוי אנונימי מחדר הוידוי: "${pick(room.dayLog.confessions)}" 🤫`, 2);
  for (const ev of room.dayLog.evicted) {
    const p = room.players.get(ev.id);
    if (p) add(`${p.name} פונה מהבית עם ${ev.votes} קולות. נשיקות לדלת. 🚪`, 5);
  }

  const evicted = lines.filter((l) => l.w === 5);
  const rest = shuffle(lines.filter((l) => l.w !== 5)).sort((a, b) => b.w - a.w).slice(0, 6);
  const out = [...shuffle(rest), ...evicted].map((l) => l.text);
  if (!out.length) out.push('יום שקט בבית האח הגדול. חשוד. מאוד חשוד. 🤨');
  return out;
}

export function awards(room) {
  const all = [...room.players.values()].filter((p) => p.role !== 'bb' && p.stats);
  const list = [];
  const best = (score, min = 1) => {
    let b = null, bs = -Infinity;
    for (const p of all) { const s = score(p); if (s > bs) { bs = s; b = p; } }
    return bs >= min ? b : null;
  };
  const add = (id, title, icon, p, why) => p && list.push({ id, title, icon, pid: p.id, name: p.name, why });

  const winner = room.players.get(room.winnerId);
  add('winner', 'המנצח/ת של העונה', '🏆', winner, 'האחרון/ה שנשאר/ה בבית');
  const spy = all.find((p) => p.spy);
  if (spy) add('spy', 'המרגל', '🕵️', spy, `חיבל ${spy.stats.sabotage || 0} פעמים${room.flags.spyExposed ? ' ונחשף' : ' ואף אחד לא גילה'}`);
  add('snake', 'הנחש', '🐍', best((p) => p.stats.betrayals * 3 + p.stats.fightsStarted), 'בגידות, הצבעות נגד בני ברית וקטטות');
  add('heart', 'הלב של הבית', '❤️', best((p) => room.distinctPartners(p.id) * 3 + p.stats.sacrifices * 12 + p.stats.gifts * 4 + p.rep / 10 - p.stats.hitsGiven, 2), 'דיבר עם כולם, נתן ועזר');
  add('drama', 'הדרמטי/ת', '🎭', best((p) => p.stats.fightsStarted * 3 + p.stats.cries * 2 + p.stats.hitsGiven + p.stats.throws * 0.5, 2), 'קטטות, דמעות וזריקות');
  add('loyal', 'הכי נאמן/ה', '🤝', best((p) => (p.stats.allyTime > 0 && p.stats.betrayals === 0 ? p.stats.allyTime : 0), 30), 'נשאר/ה נאמן/ה לברית עד הסוף');
  add('fridge', 'מלך המקרר', '🧊', best((p) => p.stats.fridge, 3), 'ביקורים רבים מדי במקרר');
  add('pool', 'דג הבריכה', '🐟', best((p) => p.stats.poolTime, 30), 'כמעט לא יצא מהמים');
  add('talker', 'הפטפטן/ית', '🗣️', best((p) => p.stats.talk, 30), 'הכי הרבה זמן דיבור');
  add('worker', 'מכונת משימות', '💪', best((p) => p.stats.taskWins, 2), 'הכי הרבה ניצחונות במשימות');
  add('couple', 'זוג העונה', '💕', best((p) => p.stats.romance * 10 + (p.stats.romance ? 1 : 0), 10), 'השמיכה זזה. הרבה.');
  add('chef', 'שף הבית', '👩‍🍳', best((p) => p.stats.cooked, 2), 'האכיל את כל הבית');
  add('saver', 'המציל/ה', '🆘', best((p) => p.stats.saves, 1), 'לחץ/ה על SAVE והציל/ה דייר');
  add('crowd', 'כוכב/ת הקהל', '🍿', best((p) => (p.role === 'ghost' ? p.stats.reactions : 0), 5), 'הקהל הכי רועש ביציע');
  // ensure an award is not given to the same person 3+ times
  const cnt = {};
  return list.filter((a) => (cnt[a.pid] = (cnt[a.pid] || 0) + 1) <= 2 || a.id === 'winner' || a.id === 'spy');
}
