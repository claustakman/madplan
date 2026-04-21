# Madplan — CLAUDE.md

App til delt madplanlægning, opskriftskatalog og indkøbsliste med AI-assistance.

GitHub repo: https://github.com/claustakman/madplan
Frontend URL: https://madplan.pages.dev
Worker URL: https://madplan-worker.claus-takman.workers.dev

---

## Stack

| Lag       | Teknologi                          |
|-----------|------------------------------------|
| Frontend  | React + Vite → Cloudflare Pages    |
| API       | Cloudflare Workers (TypeScript)    |
| Database  | Cloudflare D1 (SQLite)             |
| Storage   | Cloudflare R2 (opskriftsbilleder)  |
| AI        | Anthropic Claude API               |
| CI/CD     | GitHub Actions                     |

---

## Mappestruktur

```
madplan/
├── CLAUDE.md
├── MADPLAN-SPEC.md
├── database/
│   ├── schema.sql
│   ├── categories.csv       ← 20 kategorier med id, name, sort_order
│   └── ingredients.csv      ← ~194 ingredienser med name, category name
├── worker/
│   ├── wrangler.toml
│   ├── migrations/
│   │   ├── 0001_initial.sql
│   │   ├── 0002_categories_and_ingredients.sql
│   │   ├── 0003_ingredients_times_bought.sql
│   │   └── 0004_ingredients_defaults.sql
│   └── src/
│       ├── index.ts
│       ├── lib/
│       │   ├── auth.ts
│       │   └── ai.ts
│       └── routes/
│           ├── auth.ts
│           ├── users.ts
│           ├── shopping.ts
│           ├── ingredients.ts
│           ├── recipes.ts
│           ├── mealplan.ts
│           ├── templates.ts
│           └── ai.ts
├── frontend/
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sw.js
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib/
│       │   ├── api.ts
│       │   └── auth.tsx
│       ├── components/
│       │   └── Layout.tsx
│       └── pages/
│           ├── Login.tsx
│           ├── Shopping.tsx
│           ├── Recipes.tsx
│           ├── MealPlan.tsx
│           ├── Archive.tsx
│           ├── Profile.tsx
│           └── Settings.tsx
└── .github/
    └── workflows/
        ├── deploy.yml
        └── migrate.yml
```

---

## Roller

| Rolle    | Rettigheder                                      |
|----------|--------------------------------------------------|
| `member` | Fuld adgang til alle features                    |
| `admin`  | Alt + brugeradministration (opret/slet brugere)  |

---

## Datamodel

### `users`
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);
```

### `ingredient_categories`
```sql
CREATE TABLE ingredient_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### `ingredients`
```sql
CREATE TABLE ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES ingredient_categories(id),
  times_bought INTEGER NOT NULL DEFAULT 0,  -- incremented on check-off
  default_quantity TEXT,                     -- pre-filled when adding to list
  default_store TEXT                         -- pre-filled when adding to list
);
```

### `shopping_items`
```sql
CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES ingredient_categories(id),
  quantity TEXT,
  store TEXT,
  checked INTEGER NOT NULL DEFAULT 0,
  checked_by TEXT REFERENCES users(id),
  checked_at TEXT,
  from_plan INTEGER NOT NULL DEFAULT 0,
  recipe_id TEXT REFERENCES recipes(id),
  added_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
```

### `recipes`
```sql
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  image_url TEXT,
  servings INTEGER DEFAULT 4,
  prep_minutes INTEGER,
  tags TEXT DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
```

### `recipe_ingredients`
```sql
CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(id),
  name TEXT NOT NULL,
  quantity TEXT,
  category_id TEXT REFERENCES ingredient_categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### `meal_plans`
```sql
CREATE TABLE meal_plans (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  name TEXT,
  is_template INTEGER NOT NULL DEFAULT 0,
  template_name TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
```

### `meal_plan_days`
```sql
CREATE TABLE meal_plan_days (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  recipe_id TEXT REFERENCES recipes(id),
  note TEXT
);
```

---

## Worker — index.ts routing-mønster

```typescript
// Alle routes tjekker JWT via requireAuth(request, env)
// Rolle-tjek: requireRole(user, 'admin')
// CORS headers på alle responses via withCors()
// Alle IDs genereres med crypto.randomUUID()
// Timestamps: new Date().toISOString()
// requireAuth() kaster en Response (fanges i index.ts catch block)
```

## Auth

- JWT i `Authorization: Bearer <token>`-header
- Token indeholder: `{ sub: userId, role, name, exp }`
- `JWT_SECRET` sættes som Worker secret (ikke i wrangler.toml)
- Ingen refresh tokens — tokens lever 30 dage
- Kodeord hashes med `bcryptjs` (pure JS — Node.js bcrypt virker ikke i Workers)
- JWT implementeret fra scratch med Web Crypto API (ingen jsonwebtoken)
- Key fix: `new TextEncoder().encode(...).buffer as ArrayBuffer` for Uint8Array → ArrayBuffer cast

---

## Frontend — api.ts mønster

```typescript
const BASE_URL = import.meta.env.PROD
  ? 'https://madplan-worker.claus-takman.workers.dev'
  : 'http://localhost:8787';

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem('madplan_token');
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
}
```

Token gemmes i `localStorage` under nøglen `madplan_token`.

---

## Mobil UI

- Lyst tema med hvide kort, subtile skygger
- CSS-variabler:
  - `--bg-primary: #f5f5f3`
  - `--bg-card: #ffffff`
  - `--accent: #1976D2` (blå)
  - `--text-primary: #1a1a1a`
  - `--text-secondary: #666666`
  - `--border: #e0e0e0`
  - `--danger: #e53935`
- `font-size: 16px` på alle inputs (undgår iOS auto-zoom)
- Touch targets: `min-height: 44px` på knapper og inputs
- Bundnavigation (fast, 4 ikoner): 🛒 Indkøb · 🍽️ Madplan · 📖 Opskrifter · ☰ Mere
- Mere-panel (slide-up sheet): Arkiv · Indstillinger · Profil · [Brugere — kun admin] · Log ud
- `padding-bottom: env(safe-area-inset-bottom)` på bundnav

---

## GitHub Actions — deploy.yml

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Deploy Worker
        run: |
          cd worker && npm ci && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Build Frontend
        run: |
          cd frontend && npm ci && npm run build
      - name: Deploy Pages
        # Run from worker/ dir so wrangler is available, point to ../frontend/dist
        run: |
          cd worker && npx wrangler pages deploy ../frontend/dist --project-name=madplan
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  migrate:
    runs-on: ubuntu-latest
    # Only runs when migration files change
    if: contains(join(github.event.commits.*.modified, ','), 'migrations/')
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run DB Migrations
        run: |
          cd worker && npm ci && npx wrangler d1 migrations apply madplan-db --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## wrangler.toml

```toml
name = "madplan-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "madplan-db"
database_id = "39ea9b83-d104-48f0-88a2-ac912594fec2"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "R2"
bucket_name = "madplan-assets"

[vars]
ENVIRONMENT = "production"
```

`JWT_SECRET` og `ANTHROPIC_API_KEY_MADPLAN` sættes som Worker secrets via:
```bash
wrangler secret put JWT_SECRET
wrangler secret put ANTHROPIC_API_KEY_MADPLAN
```

GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

---

## D1 SQLite quirks

- Boolean-felter returneres som `0`/`1` integers, ikke true/false — brug `Boolean(item.checked)`
- DEFAULT 0 kolonner returnerer `0` (ikke null) — tjek `Number(item.times_bought) > 0`
- Vis kun quantity hvis `item.quantity && item.quantity !== '1'`

---

## Vigtige konventioner

- Al kommunikation i kodekommentarer og commits på **engelsk**
- UI-tekster på **dansk**
- Brug altid `crypto.randomUUID()` til IDs — aldrig auto-increment integers
- Timestamps altid ISO 8601 (`.toISOString()`)
- Soft delete bruges **ikke** i denne app — hard delete er OK
- D1-migrationer som nummererede `.sql`-filer i `worker/migrations/`
- R2-billeder: `recipes/{uuid}/{filename}` — max 10 MB, kun billedformater
- CORS: `*` (tillades for alle origins)
- `requireAuth()` kaster en `Response` — fanges i `index.ts` catch-blok

---

## Seed-data (ingredient_categories) — 20 kategorier

```sql
INSERT INTO ingredient_categories (id, name, sort_order) VALUES
  ('cat-1',  'Frugt & grønt',            1),
  ('cat-2',  'Urter & krydderier',        2),
  ('cat-3',  'Mejeri & æg',              3),
  ('cat-4',  'Kød',                      4),
  ('cat-5',  'Fisk & skaldyr',           5),
  ('cat-6',  'Pålæg & ost',              6),
  ('cat-7',  'Brød & bagværk',           7),
  ('cat-8',  'Ris & pasta',              8),
  ('cat-9',  'Tørvarer & konserves',     9),
  ('cat-10', 'Olie, eddike & saucer',   10),
  ('cat-11', 'Bagning',                 11),
  ('cat-12', 'Snacks & slik',           12),
  ('cat-13', 'Frost',                   13),
  ('cat-14', 'Drikkevarer',             14),
  ('cat-15', 'Kaffe & te',              15),
  ('cat-16', 'Alkohol',                 16),
  ('cat-17', 'Rengøring',               17),
  ('cat-18', 'Husholdning',             18),
  ('cat-19', 'Personlig pleje',         19),
  ('cat-20', 'Andet',                   99);
```

---

## Faseplan

| Fase | Indhold                                                            | Status |
|------|--------------------------------------------------------------------|--------|
| 1    | Infrastruktur: repo, wrangler, D1, R2, deploy pipeline, auth       | ✅     |
| 2    | Indkøbsliste: kategorier, tilføj/fjern/kryds af, polling           | ✅     |
| 2b   | Ingredienskatalog + Settings-side (admin: ingredienser, kategorier)| ✅     |
| 3    | Opskriftskatalog: CRUD, søgning, tags, billeder                    | ✅     |
| 4    | Madplan: ugevisning, opskriftsvalg, arkiv, skabeloner              | ⬜     |
| 5    | "Tilføj til indkøbsliste" fra madplan                              | ⬜     |
| 6    | AI: opskriftsforslag + madplansforslag                             | ⬜     |
| 7    | PWA + mobil polish                                                 | ⬜     |

---

## Fase 2 — Implementerede features

### Shopping (indkøbsliste)
- Polling hvert 5. sekund for real-time sync
- Optimistisk UI med rollback ved fejl
- Ingredienser sorteret efter `times_bought DESC, name ASC` i autocomplete
- `times_bought` på `ingredients` — inkrementeres ved afkrydsning
- `default_quantity` og `default_store` på `ingredients` — overføres automatisk ved tilføjelse fra katalog
- One-click tilføjelse fra autocomplete-forslag
- Fritekst uden match → kategorivælger → tilføjer til liste OG katalog
- Detaljepanel (slide-up på mobil, sidebar på desktop): viser tilføjet af, købt X gange, redigér antal/butik
- Slet afkrydsede varer med ét tryk

### Settings (/indstillinger)
- To faner: Ingredienser og Kategorier
- Ingredienser: søg, rediger (navn, kategori, standard antal, standard butik), slet
- Kategorier: rediger (navn, sorteringsrækkefølge), slet (nullstiller kategori på ingredienser/varer)
- Kun tilgængeligt for alle (ikke kun admin)

---

## Fase 3 — Implementerede features

### Opskrifter (/opskrifter)
- CRUD: opret, vis, rediger, slet
- Søgning (debounced) + tag-filter (collapsible dropdown)
- 125 opskrifter importeret fra Safari-bookmarks via Node.js-script
- Hvert kort viser: titel, ⏱ tid, 👤 portioner, 🔗 link-indikator, tags
- Tags som blå pills (`#e3f0fc` baggrund, `#1565C0` tekst)
- Detailview: link-knap, meta (tid/portioner), tags, ingrediensliste, fremgangsmåde
- `description`-kolonne i DB genbruges til fremgangsmåde/instruktioner
- Ingrediensliste i view-mode: mængde + navn, `🛒 Tilføj alle til indkøbsliste`-knap
  - Knappen POSTer alle ingredienser til `/api/shopping` og viser "✓ Tilføjet" i 2,5 sek.
- Edit-mode ingredienser: to faner
  - **Tekst**: fritekst textarea, én ingrediens per linje — kan paste fra hjemmesider
  - **Liste**: strukturerede rækker `[mgl.-felt] [navn med autocomplete] [✕]` + `+ Tilføj ingrediens`
  - Skift mellem faner konverterer data automatisk (text↔structured)
  - Autocomplete: debounced (300ms) GET `/api/ingredients?q=…`, viser navn + kategori
  - Ingen match → gemmes som fritekst (opretter ikke i katalog)
- `PUT /api/recipes/{id}/ingredients`: erstatter alle ingredienser atomisk
- Indkøbsliste UX: blå tema, kategori-shading, fed mængde, lilla butik
- Mængde vises til venstre for ingrediensnavn med fed skrift

### Shopping UX-forbedringer (fase 2b→3)
- Blåt farvetema (accent #1976D2) erstatter grønt
- Kategorigruppe-header: blå shading (#e3f0fc), blå tekst
- Butik vises med lilla farve (#7B1FA2) hvis udfyldt
- Mængde vises til venstre for varenavn med fed skrift
- Flimmer-fix: 600ms delay på `noMatch`-visning ved kategorivælger
