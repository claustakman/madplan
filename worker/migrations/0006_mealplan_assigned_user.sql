ALTER TABLE meal_plan_days ADD COLUMN assigned_user_id TEXT REFERENCES users(id);
