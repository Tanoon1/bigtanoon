// Shared constants between server and client.
export const PROTOCOL_VERSION = 3;

export const LIMITS = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 16,
  NAME_MAX: 16,
  CHAT_MAX: 160,
  REASON_MAX: 80,
  CUSTOM_TASK_MAX: 200,
  ANNOUNCE_MAX: 140,
  MSG_MAX_BYTES: 16 * 1024,
};

// Code alphabet without confusing characters (no O/0/I/1/L)
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export const MOVE = {
  WALK: 3.6,
  RUN: 6.2,
  CROUCH: 1.8,
  SWIM: 2.4,
  GHOST: 7,
  JUMP_V: 5.2,
  GRAVITY: 14,
  RADIUS: 0.33,
  HEIGHT: 1.75,
  EYE: 1.62,
  EYE_CROUCH: 1.05,
  STEP: 0.38,
  STAMINA_MAX: 100,
  STAMINA_DRAIN: 22, // per second
  STAMINA_REGEN: 14,
  SEND_HZ: 15,
  SNAP_HZ: 15,
};

export const VOICE = {
  HEAR_RADIUS: 20,
  WHISPER_RADIUS: 4,
  REF_DISTANCE: 1.4,
  ROLLOFF: 1.25,
};

export const PHASES = {
  LOBBY: 'lobby',
  INTRO: 'intro',
  MORNING: 'morning',
  TASK: 'task',
  FREE: 'free',
  CONFESSION: 'confession',
  NOMINATION: 'nomination',
  REVEAL: 'reveal',
  EVICTION_VOTE: 'evictionVote',
  BB_DECISION: 'bbDecision',
  BUDGET: 'budget',
  EXIT_SCENE: 'exitScene',
  EVICTION: 'eviction',
  SUMMARY: 'summary',
  FINALE_TASK: 'finaleTask',
  FINAL_VOTE: 'finalVote',
  GAME_OVER: 'gameOver',
};

export const PHASE_LABELS = {
  lobby: 'לובי',
  intro: 'פתיח',
  morning: 'בוקר',
  task: 'משימה',
  free: 'שעת חופש',
  confession: 'חדר הוידוי',
  nomination: 'מועמדויות',
  reveal: 'חשיפת המועמדים',
  evictionVote: 'ליל פינוי',
  bbDecision: 'האח הגדול מכריע',
  budget: 'ישיבת תקציב',
  exitScene: 'יציאה לאולפן',
  eviction: 'פינוי',
  summary: 'סוף היום',
  finaleTask: 'משימת הגמר',
  finalVote: 'הצבעת הגמר',
  gameOver: 'סוף העונה',
};

// Durations in seconds (normal preset). Multiplied by a preset factor.
export const PHASE_DURATIONS = {
  morning: 18,
  task: 0, // defined per task
  free: 110,
  confession: 80,
  nomination: 25,
  reveal: 22,
  evictionVote: 40,
  bbDecision: 35,
  budget: 75,
  eviction: 24,
  summary: 22,
  finaleTask: 0,
  finalVote: 40,
  gameOver: 0,
};

export const PRESETS = {
  short: 0.6,
  normal: 1,
  long: 1.5,
};

export const ROLES = { HOUSEGUEST: 'hg', BB: 'bb', GHOST: 'ghost' };

// Player state flags packed into snapshots
export const FLAG = {
  CROUCH: 1,
  RUN: 2,
  SPEAK: 4,
  SIT: 8,
  SWIM: 16,
  KNOCKED: 32,
  OFFLINE: 64,
  ISOLATED: 128,
  SLEEP: 256,
  AIR: 512,
};

export const EMOTES = [
  { id: 'wave', label: 'נפנוף', icon: '👋' },
  { id: 'dance', label: 'ריקוד', icon: '💃' },
  { id: 'hand', label: 'הרמת יד', icon: '✋' },
  { id: 'clap', label: 'מחיאות כפיים', icon: '👏' },
  { id: 'cry', label: 'בכי', icon: '😭' },
  { id: 'laugh', label: 'צחוק', icon: '😂' },
  { id: 'angry', label: 'עצבים', icon: '😡' },
  { id: 'love', label: 'אהבה', icon: '❤️' },
  { id: 'shock', label: 'בשוק', icon: '😱' },
  { id: 'think', label: 'חושב', icon: '🤔' },
];

export const REACTIONS = ['😂', '🔥', '😱', '👏', '💔', '🍿', '🐍', '❤️', '🤡', '👀'];

export const POWERS = {
  immunity: { label: 'חסינות', icon: '🛡️', desc: 'לא ניתן להעמיד אותך לפינוי בסבב הבא' },
  veto: { label: 'וטו', icon: '✋', desc: 'הסר מועמד אחד מרשימת המועמדים בזמן החשיפה' },
  peek: { label: 'הצצה', icon: '👁️', desc: 'ראה למי דייר אחר הצביע בליל הפינוי' },
  swap: { label: 'החלפה', icon: '🔄', desc: 'החלף מועמד אחד בדייר אחר בזמן החשיפה' },
  xray: { label: 'רנטגן', icon: '🩻', desc: 'ראה את כל הדיירים דרך הקירות ל-10 שניות' },
  megaphone: { label: 'מגפון', icon: '📣', desc: 'כל הבית שומע אותך ל-12 שניות' },
};

export const SHOP = [
  { id: 'snack', label: 'חטיף', icon: '🍫', price: 10, desc: 'משהו מתוק. מעלה מורל.' },
  { id: 'hat_funny', label: 'כובע מצחיק', icon: '🎩', price: 15, desc: 'כובע ענק ומגוחך לכמה דקות' },
  { id: 'music', label: 'בחירת מוזיקה', icon: '🎵', price: 35, desc: 'בחר את המוזיקה בבית ל-2 דקות' },
  { id: 'megaphone', label: 'מגפון', icon: '📣', price: 45, desc: 'כל הבית שומע אותך ל-12 שניות' },
  { id: 'xray', label: 'רנטגן', icon: '🩻', price: 60, desc: 'ראייה דרך קירות ל-10 שניות' },
  { id: 'peek', label: 'הצצה', icon: '👁️', price: 80, desc: 'ראה הצבעה של דייר אחר' },
  { id: 'party', label: 'מסיבה!', icon: '🪩', price: 120, desc: 'מסיבת ערב לכל הבית' },
  { id: 'veto', label: 'וטו', icon: '✋', price: 200, desc: 'הסר מועמד מהרשימה' },
];

export const PRIZE_START = 1000000;
export const SAVE_COST = 100000;
export const SEASONS = { short: { label: 'קצרה', every: 1 }, normal: { label: 'רגילה', every: 2 }, long: { label: 'ארוכה (חודשים)', every: 3 } };

export const MUSIC_MOODS = ['calm', 'happy', 'tense', 'party', 'dramatic', 'silence'];
export const MUSIC_LABELS = {
  calm: 'רגוע', happy: 'שמח', tense: 'מתח', party: 'מסיבה', dramatic: 'דרמטי', silence: 'שקט',
};
