const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'tournament.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema
const schema = `
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('M', 'F')),
  category TEXT CHECK(category IN ('F', 'N', NULL)),
  preferred_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

// Auto-migrate to add preferred_date if it doesn't exist
try {
  db.exec("ALTER TABLE players ADD COLUMN preferred_date TEXT;");
} catch (err) {
  // Column likely already exists
}

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ATP', 'WTA')),
  bracket TEXT NOT NULL DEFAULT 'upper' CHECK(bracket IN ('upper', 'lower')),
  phase TEXT NOT NULL DEFAULT 'gironi' CHECK(phase IN ('gironi', 'lower', 'eliminazione'))
);

CREATE TABLE IF NOT EXISTS group_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  points INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  diff INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER REFERENCES groups(id),
  phase TEXT NOT NULL DEFAULT 'gironi' CHECK(phase IN ('gironi', 'lower', 'semifinal', 'final')),
  type TEXT NOT NULL CHECK(type IN ('ATP', 'WTA')),
  team1_player1_id INTEGER NOT NULL REFERENCES players(id),
  team1_player2_id INTEGER NOT NULL REFERENCES players(id),
  team2_player1_id INTEGER NOT NULL REFERENCES players(id),
  team2_player2_id INTEGER NOT NULL REFERENCES players(id),
  score_team1 INTEGER DEFAULT NULL,
  score_team2 INTEGER DEFAULT NULL,
  points_team1 INTEGER DEFAULT NULL,
  points_team2 INTEGER DEFAULT NULL,
  match_order INTEGER DEFAULT 0,
  scheduled_time TEXT DEFAULT NULL,
  completed INTEGER DEFAULT 0,
  round_number INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tournament_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  phase TEXT DEFAULT 'registration' CHECK(phase IN ('registration', 'groups_ready', 'gironi', 'lower_bracket', 'elimination', 'completed')),
  started_at DATETIME DEFAULT NULL,
  locked INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO tournament_state (id, phase, locked) VALUES (1, 'registration', 0);
`;

db.exec(schema);

module.exports = db;
