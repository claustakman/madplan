-- Migration 0001: Initial schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingredient_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES ingredient_categories(id)
);

CREATE TABLE IF NOT EXISTS shopping_items (
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

CREATE TABLE IF NOT EXISTS recipes (
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

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(id),
  name TEXT NOT NULL,
  quantity TEXT,
  category_id TEXT REFERENCES ingredient_categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  name TEXT,
  is_template INTEGER NOT NULL DEFAULT 0,
  template_name TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_plan_days (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  recipe_id TEXT REFERENCES recipes(id),
  note TEXT
);

-- Seed ingredient categories
INSERT OR IGNORE INTO ingredient_categories (id, name, sort_order) VALUES
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
