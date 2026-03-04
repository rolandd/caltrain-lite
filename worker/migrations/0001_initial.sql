-- Migration: Initial Schema
-- Created at: 2026-03-04
CREATE TABLE IF NOT EXISTS train_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_train_locations_timestamp ON train_locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_train_locations_created ON train_locations(created_at);
