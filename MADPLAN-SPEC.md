# Madplan — Teknisk Specifikation

App til delt madplanlægning, opskriftskatalog og indkøbsliste med AI-assistance.

---

## Stack

| Lag       | Teknologi                        |
|-----------|----------------------------------|
| Frontend  | React + Vite → Cloudflare Pages  |
| API       | Cloudflare Workers (TypeScript)  |
| Database  | Cloudflare D1 (SQLite)           |
| Storage   | Cloudflare R2 (opskriftsbilleder)|
| AI        | Anthropic Claude API (sonnet-4)  |
| CI/CD     | GitHub Actions                   |

Infrastrukturen er identisk med CFC-appen (forzachang). Samme mønster for wrangler.toml, GitHub Actions deploy/migrate workflows og D1-migrationer.

---

## Mappestruktur

```
madplan/
├── database/
│   ├── schema.sql              # D1 database schema
│   └── seed.sql                # Eksempelkatalog (kategorier, ingredienser)
├── worker/                     # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts            # Router
│   │   ├── lib/
│   │   │   ├── auth.ts         # JWT + password helpers (kopieret fra CFC)
│   │   │   └── ai.ts           # Anthropic API wrapper
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── users.ts
│   │       ├── shopping.ts     # Indkøbsliste + items
│   │       ├── recipes.ts      # Opskriftskatalog
│   │       ├── mealplan.ts     # Ugeplaner
│   │       ├── templates.ts    # Madplanskabeloner
│   │       └── ai.ts           # AI-forslag (opskrifter + madplan)
│   └── wrangler.toml
├── frontend/
│   ├── public/
│   │   ├── manifest.json       # PWA manifest
│   │   ├── sw.js               # Service worker
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── auth.tsx        # Auth context (JWT i localStorage)
│   │   ├── components/
│   │   │   └── Layout.tsx      # Navigation shell
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Shopping.tsx    # Indkøbsliste
│   │       ├── Recipes.tsx     # Opskriftskatalog
│   │       ├── MealPlan.tsx    # Ugensplan
│   │       ├── Archive.tsx     # Arkiv af gamle madplaner
│   │       └── Profile.tsx
│   └── vite.config.ts
└── .github/workflows/
    ├── deploy.yml
    └── migrate.yml
```

---

## Roller

| Rolle   | Rettigheder                                                              |
|---------|--------------------------------------------------------------------------|
| `member`| Fuld adgang til alle features — se, redigere indkøbsliste, madplan m.m. |
| `admin` | Alt ovenstående + brugeradministration                                   |

> Alle brugere er ligestillede (husstands-model). Admin kan oprette/slette brugere.

---

## Datamodel

### Brugere (`users`)

| Felt         | Type    | Beskrivelse                          |
|--------------|---------|--------------------------------------|
| `id`         | TEXT    | UUID                                 |
| `name`       | TEXT    | Navn                                 |
| `email`      | TEXT    | Email (bruges til login)             |
| `password_hash` | TEXT | bcrypt hash                         |
| `role`       | TEXT    | `member` eller `admin`               |
| `created_at` | TEXT    | ISO 8601                             |

---

### Indkøbsliste

#### `shopping_items`

| Felt          | Type    | Beskrivelse                                               |
|---------------|---------|-----------------------------------------------------------|
| `id`          | TEXT    | UUID                                                      |
| `name`        | TEXT    | Varenavn                                                  |
| `category_id` | TEXT    | FK → `ingredient_categories.id`                           |
| `quantity`    | TEXT    | Antal/mængde (fritekst, fx "2 stk", "500g")               |
| `store`       | TEXT    | Specifik butik (valgfrit, fx "Lidl", "Meny")              |
| `checked`     | INTEGER | 0 = ikke fundet, 1 = fundet/krydset af                    |
| `checked_by`  | TEXT    | FK → `users.id` (hvem krydsede af)                        |
| `checked_at`  | TEXT    | ISO 8601                                                  |
| `from_plan`   | INTEGER | 1 = tilføjet automatisk fra madplan                       |
| `recipe_id`   | TEXT    | FK → `recipes.id` (hvilken opskrift den kom fra, valgfrit)|
| `added_by`    | TEXT    | FK → `users.id`                                           |
| `created_at`  | TEXT    | ISO 8601                                                  |

**Regler:**
- Indkøbslisten er global og delt mellem alle brugere
- `checked`-status opdateres i realtid via polling (hvert 5. sekund mens listen er åben)
- Varer kan tilføjes fra ingredienskatalog (autocomplete) eller fritekst
- "Ryd afkrydsede" sletter alle `checked = 1`-varer (kun admin eller fælles knap)

---

#### `ingredient_categories`

| Felt       | Type    | Beskrivelse                          |
|------------|---------|--------------------------------------|
| `id`       | TEXT    | UUID                                 |
| `name`     | TEXT    | Kategori (fx "Grøntsager", "Mejeri") |
| `sort_order` | INTEGER | Visningsrækkefølge i supermarked    |

Seed-data med typiske supermarkedskategorier sorteret logisk (frugt/grønt → mejeri → kød → frys → tørvarer → non-food).

---

#### `ingredients` (katalog)

| Felt          | Type | Beskrivelse                        |
|---------------|------|------------------------------------|
| `id`          | TEXT | UUID                               |
| `name`        | TEXT | Ingrediensnavn                     |
| `category_id` | TEXT | FK → `ingredient_categories.id`    |

Bruges til autocomplete når man tilføjer varer til indkøbslisten. Kan udvides af brugere.

---

### Opskriftskatalog

#### `recipes`

| Felt          | Type    | Beskrivelse                                        |
|---------------|---------|----------------------------------------------------|
| `id`          | TEXT    | UUID                                               |
| `title`       | TEXT    | Opskriftsnavn                                      |
| `description` | TEXT    | Kort beskrivelse                                   |
| `url`         | TEXT    | Eksternt link (valgfrit)                           |
| `image_url`   | TEXT    | R2-URL til billede (valgfrit)                      |
| `servings`    | INTEGER | Antal portioner (default 4)                        |
| `prep_minutes`| INTEGER | Tilberedningstid i minutter (valgfrit)             |
| `tags`        | TEXT    | JSON-array af tags (fx ["vegetar","hurtig","asiatisk"]) |
| `created_by`  | TEXT    | FK → `users.id`                                    |
| `created_at`  | TEXT    | ISO 8601                                           |

#### `recipe_ingredients`

| Felt            | Type    | Beskrivelse                              |
|-----------------|---------|------------------------------------------|
| `id`            | TEXT    | UUID                                     |
| `recipe_id`     | TEXT    | FK → `recipes.id`                        |
| `ingredient_id` | TEXT    | FK → `ingredients.id` (NULL = fritekst)  |
| `name`          | TEXT    | Ingrediensnavn (fritekst fallback)        |
| `quantity`      | TEXT    | Mængde (fx "200g", "1 dåse")             |
| `category_id`   | TEXT    | FK → `ingredient_categories.id`          |
| `sort_order`    | INTEGER | Rækkefølge i opskrift                    |

**Regler:**
- Opskrifter kan tagges frit
- Søgning på titel, tags og ingredienser
- Billeder lagres i R2 under `recipes/`-præfiks (max 10 MB, kun billedformater)
- AI kan foreslå nye opskrifter baseret på prompt (gemmes i katalog hvis brugeren ønsker)

---

### Madplan

#### `meal_plans`

| Felt          | Type    | Beskrivelse                                              |
|---------------|---------|----------------------------------------------------------|
| `id`          | TEXT    | UUID                                                     |
| `week_start`  | TEXT    | ISO 8601-dato for mandag i den pågældende uge            |
| `name`        | TEXT    | Valgfrit navn (fx "Uge 3 2025" — auto-genereret)         |
| `is_template` | INTEGER | 1 = skabelon (vises ikke i arkiv)                        |
| `template_name`| TEXT   | Navn på skabelon (kun relevant hvis `is_template = 1`)   |
| `archived`    | INTEGER | 1 = arkiveret                                            |
| `created_by`  | TEXT    | FK → `users.id`                                          |
| `created_at`  | TEXT    | ISO 8601                                                 |

#### `meal_plan_days`

| Felt          | Type    | Beskrivelse                                      |
|---------------|---------|--------------------------------------------------|
| `id`          | TEXT    | UUID                                             |
| `plan_id`     | TEXT    | FK → `meal_plans.id`                             |
| `weekday`     | INTEGER | 1 = mandag … 7 = søndag                          |
| `recipe_id`   | TEXT    | FK → `recipes.id` (NULL = ingen ret planlagt)    |
| `note`        | TEXT    | Fritekst-note (fx "Takeaway", "Rester")          |

**Regler:**
- Kun aftensmad planlægges (én ret per dag)
- Aktiv ugeplan: `week_start = indeværende uges mandag`, `archived = 0`, `is_template = 0`
- Arkivering sker manuelt eller ved oprettelse af ny plan for samme uge
- Skabeloner kopieres til ny plan (alle 7 dage kopieres)
- "Tilføj til indkøbsliste" knap: opretter `shopping_items` for alle ingredienser i planens opskrifter (springer allerede tilføjede over)

---

## AI-features

### Opskriftsforslag

**Endpoint:** `POST /api/ai/suggest-recipes`

**Request body:**
```json
{
  "prompt": "Noget med kylling og citron, max 30 minutter"
}
```

**Svar:** JSON-array med 3 opskriftsforslag, hvert med:
- `title`, `description`, `tags`, `ingredients[]`, `url` (søgt op / NULL)
- Brugeren kan vælge at gemme ét eller flere forslag i kataloget

---

### Madplansforslag

**Endpoint:** `POST /api/ai/suggest-plan`

**Request body:**
```json
{
  "prompt": "Vi har pasta, ris og kylling i huset. Gerne noget vegetarisk til onsdag. Ingen laks.",
  "days": [1, 2, 3, 4, 5],
  "existing_recipe_ids": ["uuid1", "uuid2"]
}
```

**Svar:** JSON med `weekday → recipe_id | suggested_recipe` mapping. Eksisterende opskrifter foretrækkes; AI foreslår nye kun hvis nødvendigt.

---

## API-routes

### Auth

| Method | Path            | Rolle   | Beskrivelse        |
|--------|-----------------|---------|--------------------|
| POST   | /api/auth/login | public  | Login, returnerer JWT |
| POST   | /api/auth/logout| member+ | Invalidér token    |
| GET    | /api/auth/me    | member+ | Hent egen bruger   |

### Brugere

| Method | Path            | Rolle | Beskrivelse                  |
|--------|-----------------|-------|------------------------------|
| GET    | /api/users      | admin | Liste alle brugere           |
| POST   | /api/users      | admin | Opret bruger                 |
| PUT    | /api/users/:id  | admin | Opdatér bruger               |
| DELETE | /api/users/:id  | admin | Slet bruger                  |

### Indkøbsliste

| Method | Path                        | Rolle   | Beskrivelse                        |
|--------|-----------------------------|---------|------------------------------------|
| GET    | /api/shopping               | member+ | Hent alle aktive varer             |
| POST   | /api/shopping               | member+ | Tilføj vare                        |
| PUT    | /api/shopping/:id           | member+ | Opdatér vare (navn, antal, butik)  |
| PATCH  | /api/shopping/:id/check     | member+ | Kryds af / fjern afkrydsning       |
| DELETE | /api/shopping/:id           | member+ | Slet vare                          |
| DELETE | /api/shopping/checked       | member+ | Slet alle afkrydsede varer         |

### Ingredienser/kategorier

| Method | Path                        | Rolle   | Beskrivelse                |
|--------|-----------------------------|---------|----------------------------|
| GET    | /api/ingredients            | member+ | Søg/list ingredienser      |
| POST   | /api/ingredients            | member+ | Tilføj ny ingrediens       |
| GET    | /api/ingredients/categories | member+ | List kategorier            |

### Opskrifter

| Method | Path                            | Rolle   | Beskrivelse                          |
|--------|---------------------------------|---------|--------------------------------------|
| GET    | /api/recipes                    | member+ | Søg opskrifter (query, tags, ingredients) |
| POST   | /api/recipes                    | member+ | Opret opskrift                       |
| GET    | /api/recipes/:id                | member+ | Hent opskrift inkl. ingredienser     |
| PUT    | /api/recipes/:id                | member+ | Opdatér opskrift                     |
| DELETE | /api/recipes/:id                | member+ | Slet opskrift                        |
| POST   | /api/recipes/:id/image          | member+ | Upload billede → R2                  |

### Madplan

| Method | Path                                  | Rolle   | Beskrivelse                             |
|--------|---------------------------------------|---------|-----------------------------------------|
| GET    | /api/mealplans/current                | member+ | Aktiv ugeplan                           |
| GET    | /api/mealplans                        | member+ | Liste (arkiverede + skabeloner)         |
| POST   | /api/mealplans                        | member+ | Opret ny plan (evt. fra skabelon)       |
| PUT    | /api/mealplans/:id/days/:weekday      | member+ | Sæt opskrift/note på dag               |
| POST   | /api/mealplans/:id/to-shopping-list   | member+ | Tilføj alle ingredienser til indkøbsliste |
| POST   | /api/mealplans/:id/archive            | member+ | Arkivér plan                            |
| DELETE | /api/mealplans/:id                    | member+ | Slet plan                               |

### AI

| Method | Path                       | Rolle   | Beskrivelse             |
|--------|----------------------------|---------|-------------------------|
| POST   | /api/ai/suggest-recipes    | member+ | AI opskriftsforslag     |
| POST   | /api/ai/suggest-plan       | member+ | AI madplansforslag      |

---

## Frontend — sider

### Shopping.tsx (`/indkobsliste`)

- Varer organiseret i kategorisektioner (supermarkedsrækkefølge)
- Afkrydsede varer vises nedtonet/gennemstreget i bunden af kategori
- Tilføj-knap: autocomplete fra ingredienskatalog + fritekst fallback
  - Valgfrit: antal/mængde og butik
- "Ryd afkrydsede"-knap
- Polling hvert 5. sekund (opdaterer `checked`-status i realtid)
- Visuel indikator hvis en anden bruger har krydset noget af siden sidst

### Recipes.tsx (`/opskrifter`)

- Søgefelt (titel, tag, ingrediens)
- Filtrerbar tag-liste (chips)
- Opskriftskort med billede, titel, tags, tilberedningstid
- Detailvisning med ingrediensliste og link til ekstern opskrift
- "Tilføj til madplan"-knap (vælg ugedag)
- AI forslag-knap: modal med tekstprompt → viser 3 forslag → kan gemmes

### MealPlan.tsx (`/madplan`)

- Ugevisning: mandag–søndag, én slot per dag (aftensmad)
- Klik på dag: vælg opskrift fra katalog eller skriv fritekst-note
- "AI foreslå uge"-knap: modal med prompt → udfylder tomme dage
- "Tilføj til indkøbsliste"-knap (tilføjer alle ingredienser for ugen)
- "Gem som skabelon"-knap
- Navigation: forrige/næste uge

### Archive.tsx (`/arkiv`)

- Liste over arkiverede madplaner (nyeste øverst)
- Skabeloner vist i separat sektion
- Klik: vis den pågældende plans opskrifter
- Skabelon: knap til "Brug som udgangspunkt" (kopierer til aktuel uge)

### Profile.tsx (`/profil`)

- Skift navn og kodeord

---

## Realtime (indkøbsliste)

Polling-baseret (som CFC's voting-feature). Ingen WebSocket.

- Frontend poller `GET /api/shopping` hvert 5. sekund mens siden er åben
- Server returnerer `updated_at` timestamp — frontend viser "opdateret for X sekunder siden"
- `checked_by_name` returneres for at vise "Krydset af [navn]" som tooltip

---

## Søgning i opskrifter

`GET /api/recipes?q=kylling&tags=hurtig,asiatisk&ingredient=ingefær`

SQL-forespørgsel bruger `LIKE`-søgning på `recipes.title` + `JSON_EACH(recipes.tags)` + `recipe_ingredients.name`.

---

## GitHub Actions

### `deploy.yml` (push til `main`)

1. Build frontend (Vite)
2. Deploy frontend → Cloudflare Pages
3. Deploy worker → Cloudflare Workers
4. Kør D1-migrationer

### `migrate.yml` (manuel workflow)

Manuel kørsel af specifikke SQL-migrationsfiler mod D1-databasen.

---

## Miljøvariabler / Secrets

### Worker (wrangler.toml + CF Dashboard secrets)

| Navn              | Beskrivelse                        |
|-------------------|------------------------------------|
| `JWT_SECRET`      | Signeringsnøgle til JWT            |
| `ANTHROPIC_API_KEY` | Claude API-nøgle                 |

### GitHub Actions secrets

| Navn                    | Beskrivelse                    |
|-------------------------|--------------------------------|
| `CLOUDFLARE_API_TOKEN`  | CF API-token                   |
| `CLOUDFLARE_ACCOUNT_ID` | CF Account ID                  |

---

## PWA

- `manifest.json` med app-navn "Madplan", tema-farver, ikoner
- Service worker med offline-cache for shell (ikke data)
- Installerbar på iOS og Android

---

## Mobil UI

Samme principper som CFC-appen:

- Lyst tema
- Bundnavigation med 3 faste ikoner: 🛒 Indkøb · 🍽️ Madplan · 📖 Opskrifter
- Mere-panel (☰): Arkiv, Profil, Log ud
- `font-size: 16px` på inputs (undgår iOS zoom)
- Touch targets min 44px
- `env(safe-area-inset-bottom)` på bundnav

---

## Faseplan (forslag)

| Fase | Indhold                                                          |
|------|------------------------------------------------------------------|
| 1    | Auth + brugeradmin + grundlæggende infrastruktur (deploy pipeline) |
| 2    | Indkøbsliste: kategorier, tilføj/fjern/kryds af, polling         |
| 3    | Opskriftskatalog: CRUD, søgning, tags, billeder                  |
| 4    | Madplan: ugevisning, opskriftsvalg, arkiv, skabeloner             |
| 5    | "Tilføj til indkøbsliste" fra madplan                            |
| 6    | AI: opskriftsforslag + madplansforslag                           |
| 7    | PWA + mobil polish                                               |
