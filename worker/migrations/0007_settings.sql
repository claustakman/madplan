CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('ai_model_shopping', 'claude-haiku-4-20250514'),
  ('ai_model_recipe',   'claude-sonnet-4-20250514'),
  ('ai_model_mealplan', 'claude-sonnet-4-20250514');
