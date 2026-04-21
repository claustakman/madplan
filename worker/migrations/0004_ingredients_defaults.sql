-- Migration 0004: default quantity and store per ingredient
ALTER TABLE ingredients ADD COLUMN default_quantity TEXT;
ALTER TABLE ingredients ADD COLUMN default_store TEXT;
