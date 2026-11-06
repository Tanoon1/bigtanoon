# 🚀 איך מעלים את המשחק לאוויר – בחינם, עם לינק

יש שתי דרכים חינמיות שעובדות (צריך שרת אמיתי בגלל המולטיפלייר והקול – אתרי "דפים סטטיים" כמו GitHub Pages לא מספיקים).

---

## דרך 1 (מומלצת, בלי כרטיס אשראי): Hugging Face Spaces

תקבלו לינק בסגנון: `https://השם-שלך-big-brother.hf.space`

1. נכנסים ל-https://huggingface.co ופותחים חשבון חינמי.
2. לוחצים על התמונה שלכם למעלה ← **New Space**.
3. ממלאים:
   - **Space name:** `big-brother`
   - **SDK:** בוחרים **Docker** ← **Blank**
   - **Hardware:** `CPU basic – FREE`
   - **Public**
   - ← **Create Space**
4. בעמוד ה-Space: לשונית **Files** ← **Add file** ← **Upload files**.
5. מחלצים את הקובץ `big-brother-deploy.zip` במחשב, ו**גוררים את כל התוכן** שלו (התיקיות `client`, `server`, `shared` ו-`scripts`, וגם הקבצים `Dockerfile`, `package.json`, `package-lock.json`, `vite.config.js` ו-`README.md`) לחלון ← **Commit changes**.
6. מחכים 3–5 דקות (לשונית **App** תראה "Building" ואחר כך "Running").
7. **הלינק לשחק:** בתפריט ⋮ (למעלה מימין) ← **Embed this Space** ← **Direct URL**.
   ⚠️ משחקים מהלינק הישיר (`...hf.space`), לא מתוך העמוד של huggingface.co, אחרת הדפדפן לא יאשר מיקרופון.
8. שולחים לחברים את הלינק. אחד יוצר בית, וכל השאר נכנסים עם הקוד (או דרך כפתור "העתק קישור הזמנה" בלובי).

> ה-Space "נרדם" אחרי 48 שעות בלי שימוש. הכניסה הראשונה אחרי זה לוקחת כדקה, ואחר כך הכול רגיל.

---

## דרך 2: Render.com (לינק `...onrender.com`)

1. מעלים את התיקייה ל-GitHub (אפשר דרך האתר: New repository ← uploading an existing file ← לגרור את התוכן של ה-ZIP).
2. ב-https://render.com: **New** ← **Blueprint** ← בוחרים את ה-repo. הקובץ `render.yaml` כבר מוכן.
3. אחרי כמה דקות מקבלים לינק `https://big-brother-3d.onrender.com`.

> בגרסה החינמית השרת נרדם אחרי 15 דקות בלי שחקנים. הכניסה הראשונה לוקחת כ-50 שניות.

---

## 🎙️ קול בין רשתות שונות (חשוב!)

ברירת המחדל עובדת לרוב החברים בבית או בוויי-פיי. אבל יש רשתות (סלולר, עבודה, צבא) שחוסמות חיבור ישיר. כדי שזה יעבוד לכולם, מוסיפים שרת TURN חינמי:

1. נרשמים ל-https://www.metered.ca/tools/openrelay/ (חינם).
2. ב-Hugging Face: **Settings** ← **Variables and secrets** ← מוסיפים:
   - `TURN_URLS` = `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443?transport=tcp`
   - `TURN_USERNAME` = שם המשתמש שקיבלתם
   - `TURN_CREDENTIAL` = הסיסמה שקיבלתם (בתור **Secret**)
3. מפעילים מחדש את ה-Space (**Settings** ← **Restart**).

ל-10–16 שחקנים קבועים כדאי לחבר LiveKit Cloud (יש לו מסלול חינמי). ההוראות ב-README.md, תחת "צ׳אט קולי".

---

## בדיקה מקומית לפני העלאה
```
npm install
npm run build
npm start
```
ואז פותחים בדפדפן `http://localhost:7860`.
