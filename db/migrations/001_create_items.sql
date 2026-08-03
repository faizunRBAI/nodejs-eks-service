-- Migration 001: Create items table
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).
-- Run by the configure stage via:
--   psql "$DATABASE_URL" -f db/migrations/001_create_items.sql

CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 255),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_created_at_idx ON items (created_at DESC);
