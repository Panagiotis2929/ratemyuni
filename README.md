# RateMyUni v4 — Οδηγός Εγκατάστασης

## 🚀 Γρήγορη Εκκίνηση

Ανέβασε τον φάκελο `ratemyuni/` σε:
- **Netlify Drop**: netlify.com/drop → σύρε τον φάκελο
- **GitHub Pages**: νέο repo → upload → Settings → Pages
- **Vercel**: vercel.com → import GitHub repo
- **Cloudflare Pages**: pages.cloudflare.com → Direct Upload

---

## ⚡ Supabase Auth Setup (Προαιρετικό αλλά Συνιστάται)

### Βήμα 1 — Δημιούργησε Supabase Project
1. Πήγαινε στο [supabase.com](https://supabase.com) → Sign Up (δωρεάν)
2. "New Project" → δώσε όνομα → επίλεξε region (Europe)
3. Αντέγραψε:
   - **Project URL** (π.χ. `https://xxxx.supabase.co`)
   - **anon public key** (Settings → API)

### Βήμα 2 — Ρύθμισε Authentication
1. Authentication → Providers → Email → **Enable**
2. Authentication → URL Configuration → Site URL: βάλε το domain σου
3. Authentication → Email Templates → προσάρμοσε αν θέλεις

### Βήμα 3 — Περιόρισε σε .edu.gr emails (SQL)
Πήγαινε SQL Editor και τρέξε:

```sql
-- Επέτρεψε μόνο .edu.gr emails
CREATE OR REPLACE FUNCTION check_edu_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email NOT LIKE '%.edu.gr'
     AND NEW.email NOT LIKE '%.auth.gr'
     AND NEW.email NOT LIKE '%.uoa.gr'
     AND NEW.email NOT LIKE '%.ntua.gr'
     AND NEW.email NOT LIKE '%.aueb.gr'
     AND NEW.email NOT LIKE '%.uom.edu.gr'
     AND NEW.email NOT LIKE '%.upatras.gr'
     AND NEW.email NOT LIKE '%.uoc.gr'
     AND NEW.email NOT LIKE '%.uoi.gr'
     AND NEW.email NOT LIKE '%.duth.gr'
     AND NEW.email NOT LIKE '%.panteion.gr'
  THEN
    RAISE EXCEPTION 'Απαιτείται πανεπιστημιακό email (.edu.gr)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_edu_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION check_edu_email();
```

### Βήμα 4 — Προαιρετικά: Profiles Table
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  uni TEXT,
  dept TEXT,
  review_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
```

### Βήμα 5 — Σύνδεσε στην εφαρμογή
1. Άνοιξε την εφαρμογή → Προφίλ → "Ρυθμίσεις Supabase"
2. Βάλε το URL και το Anon Key
3. Αποθήκευσε → Ανανέωσε σελίδα

---

## 📧 Πανεπιστημιακά Emails που γίνονται αποδεκτά

| Πανεπιστήμιο | Domain |
|---|---|
| ΑΠΘ | `@auth.gr`, `@csd.auth.gr` |
| ΕΚΠΑ | `@uoa.gr`, `@di.uoa.gr` |
| ΕΜΠ | `@ntua.gr`, `@mail.ntua.gr` |
| ΟΠΑ | `@aueb.gr` |
| ΠΑΝ. ΜΑΚΕΔΟΝΙΑΣ | `@uom.edu.gr` |
| ΠΑΝ. ΠΑΤΡΩΝ | `@upatras.gr` |
| ΠΑΝ. ΚΡΗΤΗΣ | `@uoc.gr` |
| ΠΑΝ. ΙΩΑΝΝΙΝΩΝ | `@uoi.gr` |
| ΔΠΘ | `@duth.gr` |
| ΠΑΝΤΕΙΟΝ | `@panteion.gr` |
| Άλλα | `*.edu.gr` |

---

## ⚖️ Σύγκριση 1v1

Χρησιμοποίησε το **⚖️ Σύγκριση** από το navbar ή
κλικ στο ⚖️ icon σε κάθε κάρτα καθηγητή.

---

## 🏗️ Δομή αρχείων

```
ratemyuni/
├── index.html        — Κύρια σελίδα
├── manifest.json     — PWA config
├── sw.js             — Service Worker
├── README.md         — Αυτός ο οδηγός
├── css/
│   └── main.css      — Design system (~1100 γραμμές)
├── js/
│   ├── data.js       — 30 πραγματικοί καθηγητές
│   └── app.js        — Πλήρης λογική (~1100 γραμμές)
└── assets/
    ├── icon-192.png  — PWA icon
    └── icon-512.png  — PWA icon
```

---

## ✅ Features

- 🔐 Auth με **υποχρεωτικό .edu.gr email** (+ Supabase)
- 🎓 Register ανά **πανεπιστήμιο & τμήμα**
- ⚖️ **Σύγκριση 1v1** καθηγητών
- 🔍 Αναζήτηση ανά καθηγητή / μάθημα / τμήμα
- 🎚️ Φίλτρα: πανεπιστήμιο, τμήμα, δυσκολία
- ↕️ Sorting: βαθμολογία / αλφαβητικά / πρόσφατο
- 👑 Professor of the Month
- 🔥 Trending (τελευταία 7 μέρες)
- 📈 Line chart εξέλιξης ανά εξάμηνο
- 🏆 Rankings με φίλτρο ανά ΑΕΙ/τμήμα
- 📊 Statistics Dashboard
- 🕐 Recently Viewed
- 📝 Οι Κριτικές μου
- 📤 Share (Twitter/WhatsApp/Copy)
- 📄 Export PDF αναφορά
- 🌙 Dark Mode
- 📱 PWA (εγκατάσταση στο κινητό)
- 🏅 Auto badges (Εύκολος/Εμπνέει/Οργανωμένος/Top)
- ✓ Verified badge για .edu emails
- 🚫 Anti-duplicate reviews

---

*RateMyUni v4 — Η φωνή των φοιτητών*
