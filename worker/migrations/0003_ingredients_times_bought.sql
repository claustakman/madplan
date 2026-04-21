-- Migration 0003: track how many times an ingredient has been checked off
ALTER TABLE ingredients ADD COLUMN times_bought INTEGER NOT NULL DEFAULT 0;
