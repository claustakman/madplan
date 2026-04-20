# Madplan — CLAUDE.md

App til delt madplanlægning, opskriftskatalog og indkøbsliste med AI-assistance.

GitHub repo: https://github.com/claustakman/madplan

---

## Stack

| Lag       | Teknologi                          |
|-----------|------------------------------------|
| Frontend  | React + Vite → Cloudflare Pages    |
| API       | Cloudflare Workers (TypeScript)    |
| Database  | Cloudflare D1 (SQLite)             |
| Storage   | Cloudflare R2 (opskriftsbilleder)  |
| AI        | Anthropic Claude API (claude-sonnet-4-20250514) |
| CI/CD     | GitHub Actions                     |

---

## Mappestruktur

```
madplan/
├── CLAUDE.md
├── MADPLAN-SPEC.md
├── database/
│   ├── schema.sql
│   └── seed.sql
├── worker/
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts
│       ├── lib/
│       │   ├── auth.ts
│       │   └── ai.ts
│       └── routes/
│           ├── auth.ts
│           ├── users.ts
│           ├── shopping.ts
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
│           └── Profile.tsx
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
  category_id TEXT REFERENCES ingredient_categories(id)
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
// CORS headers på alle responses
// Alle IDs genereres med crypto.randomUUID()
// Timestamps: new Date().toISOString()
```

## Auth

- JWT i `Authorization: Bearer <token>`-header
- Token indeholder: `{ sub: userId, role, name, exp }`
- `JWT_SECRET` sættes som Worker secret (ikke i wrangler.toml)
- Ingen refresh tokens — tokens lever 30 dage
- Kodeord hashes med bcrypt (brug `bcryptjs` npm-pakken)

---

## Frontend — api.ts mønster

```typescript
const BASE_URL = import.meta.env.PROD
  ? 'https://madplan-worker.DITBRUGERNAVN.workers.dev'
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
  - `--accent: #4CAF50` (grøn — mad-tema)
  - `--text-primary: #1a1a1a`
  - `--text-secondary: #666666`
  - `--border: #e0e0e0`
- `font-size: 16px` på alle inputs (undgår iOS auto-zoom)
- Touch targets: `min-height: 44px` på knapper og inputs
- Bundnavigation (fast, 3 ikoner): 🛒 Indkøb · 🍽️ Madplan · 📖 Opskrifter
- Mere-panel (☰ slide-up): Arkiv · Profil · Log ud
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
          cd worker
          npm ci
          npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Build Frontend
        run: |
          cd frontend
          npm ci
          npm run build
      - name: Deploy Pages
        run: |
          cd frontend
          npx wrangler pages deploy dist --project-name=madplan
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Run DB Migrations
        run: |
          cd worker
          npx wrangler d1 migrations apply madplan-db --remote
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
database_id = "INDSÆT-EFTER-OPRETTELSE"

[[r2_buckets]]
binding = "R2"
bucket_name = "madplan-assets"

[vars]
ENVIRONMENT = "production"
```

`JWT_SECRET` og `ANTHROPIC_API_KEY` sættes som Worker secrets via:
```bash
wrangler secret put JWT_SECRET
wrangler secret put ANTHROPIC_API_KEY
```

---

## Vigtige konventioner

- Al kommunikation i kodekommentarer og commits på **engelsk**
- UI-tekster på **dansk**
- Brug altid `crypto.randomUUID()` til IDs — aldrig auto-increment integers
- Timestamps altid ISO 8601 (`.toISOString()`)
- Soft delete bruges **ikke** i denne app — hard delete er OK
- D1-migrationer som nummererede `.sql`-filer i `worker/migrations/`
- R2-billeder: `recipes/{uuid}/{filename}` — max 10 MB, kun billedformater
- CORS: tillad `*` i development, Pages-URL i production

---

## Seed-data (ingredient_categories)

```sql
INSERT INTO ingredient_categories (id, name, sort_order) VALUES
  ('cat-1', 'Frugt & grønt', 1),
  ('cat-2', 'Urter & krydderier', 2),
  ('cat-3', 'Mejeri & æg', 3),
  ('cat-4', 'Kød & fisk', 4),
  ('cat-5', 'Pålæg & ost', 5),
  ('cat-6', 'Brød & bagværk', 6),
  ('cat-7', 'Tørvarer & pasta', 7),
  ('cat-8', 'Dåser & glas', 8),
  ('cat-9', 'Frost', 9),
  ('cat-10', 'Drikkevarer', 10),
  ('cat-11', 'Rengøring & husholdning', 11),
  ('cat-12', 'Andet', 99);
```

---

## Faseplan

| Fase | Indhold                                                            | Status |
|------|--------------------------------------------------------------------|--------|
| 1    | Infrastruktur: repo, wrangler, D1, R2, deploy pipeline, auth       | ⬜     |
| 2    | Indkøbsliste: kategorier, tilføj/fjern/kryds af, polling           | ⬜     |
| 3    | Opskriftskatalog: CRUD, søgning, tags, billeder                    | ⬜     |
| 4    | Madplan: ugevisning, opskriftsvalg, arkiv, skabeloner              | ⬜     |
| 5    | "Tilføj til indkøbsliste" fra madplan                             | ⬜     |
| 6    | AI: opskriftsforslag + madplansforslag                             | ⬜     |
| 7    | PWA + mobil polish                                                 | ⬜     |
