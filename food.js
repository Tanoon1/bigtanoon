// Food: budget-meeting catalog, pantry, recipes. Prices in ₪ (house food budget).
export const FOODS = [
  { id: 'eggs', name: 'ביצים (12)', icon: '🥚', price: 18, units: 4, kind: 'ing' },
  { id: 'tomato', name: 'עגבניות', icon: '🍅', price: 9, units: 4, kind: 'ing', eat: 6 },
  { id: 'cucumber', name: 'מלפפונים', icon: '🥒', price: 8, units: 4, kind: 'ing', eat: 5 },
  { id: 'bread', name: 'לחם', icon: '🍞', price: 12, units: 4, kind: 'ing', eat: 10 },
  { id: 'cheese', name: 'גבינה צהובה', icon: '🧀', price: 24, units: 4, kind: 'ing', eat: 8 },
  { id: 'hummus', name: 'חומוס', icon: '🫘', price: 14, units: 3, kind: 'ing', eat: 8 },
  { id: 'pasta', name: 'פסטה', icon: '🍝', price: 10, units: 3, kind: 'ing' },
  { id: 'sauce', name: 'רוטב עגבניות', icon: '🥫', price: 11, units: 3, kind: 'ing' },
  { id: 'chicken', name: 'חזה עוף', icon: '🍗', price: 45, units: 3, kind: 'ing' },
  { id: 'rice', name: 'אורז', icon: '🍚', price: 12, units: 3, kind: 'ing' },
  { id: 'potato', name: 'תפוחי אדמה', icon: '🥔', price: 10, units: 4, kind: 'ing' },
  { id: 'milk', name: 'חלב', icon: '🥛', price: 7, units: 4, kind: 'ing', eat: 5 },
  { id: 'chocolate', name: 'שוקולד', icon: '🍫', price: 9, units: 3, kind: 'snack', eat: 12 },
  { id: 'bamba', name: 'במבה', icon: '🥜', price: 6, units: 3, kind: 'snack', eat: 10 },
  { id: 'bisli', name: 'ביסלי', icon: '🍿', price: 6, units: 3, kind: 'snack', eat: 10 },
  { id: 'fruit', name: 'פירות', icon: '🍎', price: 20, units: 6, kind: 'snack', eat: 10 },
  { id: 'watermelon', name: 'אבטיח', icon: '🍉', price: 25, units: 8, kind: 'snack', eat: 12 },
  { id: 'icecream', name: 'גלידה', icon: '🍦', price: 22, units: 4, kind: 'snack', eat: 12 },
  { id: 'cola', name: 'שתייה מוגזת', icon: '🥤', price: 10, units: 6, kind: 'snack', eat: 4 },
  { id: 'coffee', name: 'קפה', icon: '☕', price: 16, units: 8, kind: 'snack', eat: 4 },
  { id: 'pizza', name: 'פיצה קפואה', icon: '🍕', price: 35, units: 4, kind: 'snack', eat: 25 },
  { id: 'schnitzel', name: 'שניצל קפוא', icon: '🥩', price: 38, units: 4, kind: 'ing' },
];
export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Recipes cooked at the stove from the house pantry. need: {foodId: units}, makes: servings
export const RECIPES = [
  { id: 'shakshuka', name: 'שקשוקה', icon: '🍳', need: { eggs: 2, tomato: 2 }, makes: 4, fill: 35 },
  { id: 'pasta', name: 'פסטה ברוטב', icon: '🍝', need: { pasta: 1, sauce: 1 }, makes: 4, fill: 35 },
  { id: 'chickenrice', name: 'עוף ואורז', icon: '🍛', need: { chicken: 1, rice: 1 }, makes: 4, fill: 45 },
  { id: 'schnitzel', name: 'שניצל וצ׳יפס', icon: '🍟', need: { schnitzel: 1, potato: 2 }, makes: 4, fill: 45 },
  { id: 'salad', name: 'סלט ישראלי', icon: '🥗', need: { tomato: 1, cucumber: 1 }, makes: 3, fill: 18 },
  { id: 'toast', name: 'טוסט גבינה', icon: '🥪', need: { bread: 1, cheese: 1 }, makes: 3, fill: 25 },
  { id: 'hummusplate', name: 'צלחת חומוס', icon: '🫓', need: { hummus: 1, bread: 1 }, makes: 3, fill: 28 },
  { id: 'cake', name: 'עוגת שוקולד', icon: '🎂', need: { eggs: 1, chocolate: 1, milk: 1 }, makes: 6, fill: 20 },
  { id: 'omelette', name: 'חביתה', icon: '🥚', need: { eggs: 1 }, makes: 2, fill: 20 },
  { id: 'kebab', name: 'שיפודים מהמנגל', icon: '🍢', need: {}, makes: 0, fill: 40, grillOnly: true },
  { id: 'mashed', name: 'פירה', icon: '🥔', need: { potato: 2, milk: 1 }, makes: 3, fill: 25 },
];
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
