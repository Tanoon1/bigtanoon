// Avatar customization options (validated server-side, rendered client-side)
export const COLORS = [
  '#26c6da', '#ff5c8a', '#ffb627', '#7c4dff', '#4caf50', '#ff7043',
  '#ec407a', '#29b6f6', '#cddc39', '#8d6e63', '#ffffff', '#37474f',
];
export const SKINS = ['#f6d1b5', '#e8b48f', '#c98d67', '#a26a45', '#7a4b2e', '#5a3420'];
export const OUTFITS = [
  { id: 'tee', label: 'טישירט' },
  { id: 'hoodie', label: 'קפוצ׳ון' },
  { id: 'suit', label: 'חליפה' },
  { id: 'dress', label: 'שמלה' },
  { id: 'tank', label: 'גופייה' },
  { id: 'robe', label: 'חלוק' },
];
export const HATS = [
  { id: 'none', label: 'בלי' },
  { id: 'cap', label: 'כובע מצחייה' },
  { id: 'beanie', label: 'גרב' },
  { id: 'cowboy', label: 'בוקרים' },
  { id: 'crown', label: 'כתר' },
  { id: 'party', label: 'מסיבה' },
  { id: 'chef', label: 'שף' },
  { id: 'headphones', label: 'אוזניות' },
  { id: 'bunny', label: 'ארנב' },
];
export const EMOJIS = ['😎', '🔥', '👑', '🐍', '💅', '🤠', '😈', '🥳', '🤓', '🦄', '🍕', '💎', '🌶️', '🎤', '⭐', '🐸', ''];
export const HAIRS = [
  { id: 'short', label: 'קצר' },
  { id: 'long', label: 'ארוך' },
  { id: 'bun', label: 'קוקו' },
  { id: 'bald', label: 'קרחת' },
  { id: 'curly', label: 'מתולתל' },
  { id: 'mohawk', label: 'מוהוק' },
];
export const HAIR_COLORS = ['#1b1b1b', '#5d3a1a', '#a0522d', '#e6c27a', '#d84315', '#9e9e9e', '#e040fb', '#00e5ff'];

export const ENTRANCES = [
  { id: 'wave', label: 'נפנוף 👋' },
  { id: 'dance', label: 'ריקוד 💃' },
  { id: 'clap', label: 'מחיאות כפיים 👏' },
  { id: 'hand', label: 'יד למעלה ✋' },
  { id: 'laugh', label: 'צחוק 😂' },
  { id: 'love', label: 'לב ❤️' },
];

export function defaultLook(seed = Math.random()) {
  const pick = (arr, k) => arr[Math.floor(((seed * 9301 + k * 49297) % 1) * arr.length) % arr.length];
  return {
    color: pick(COLORS, 1),
    skin: pick(SKINS, 2),
    outfit: pick(OUTFITS, 3).id,
    hat: 'none',
    emoji: pick(EMOJIS, 5),
    hair: pick(HAIRS, 6).id,
    hairColor: pick(HAIR_COLORS, 7),
    move: 'wave',
  };
}

export function sanitizeLook(look) {
  const l = look && typeof look === 'object' ? look : {};
  const has = (arr, v) => arr.includes(v);
  const ids = (arr) => arr.map((o) => o.id);
  return {
    color: has(COLORS, l.color) ? l.color : COLORS[0],
    skin: has(SKINS, l.skin) ? l.skin : SKINS[1],
    outfit: has(ids(OUTFITS), l.outfit) ? l.outfit : 'tee',
    hat: has(ids(HATS), l.hat) ? l.hat : 'none',
    emoji: has(EMOJIS, l.emoji) ? l.emoji : '',
    hair: has(ids(HAIRS), l.hair) ? l.hair : 'short',
    hairColor: has(HAIR_COLORS, l.hairColor) ? l.hairColor : HAIR_COLORS[0],
    move: has(ids(ENTRANCES), l.move) ? l.move : 'wave',
  };
}
