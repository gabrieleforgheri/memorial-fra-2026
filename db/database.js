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
  self_rating INTEGER CHECK(self_rating IS NULL OR (self_rating BETWEEN 1 AND 10)),
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);



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
  phase TEXT NOT NULL DEFAULT 'gironi' CHECK(phase IN ('gironi', 'lower', 'semifinal', 'final', 'tiebreak')),
  type TEXT NOT NULL CHECK(type IN ('ATP', 'WTA')),
  team1_player1_id INTEGER NOT NULL REFERENCES players(id),
  team1_player2_id INTEGER REFERENCES players(id),
  team2_player1_id INTEGER NOT NULL REFERENCES players(id),
  team2_player2_id INTEGER REFERENCES players(id),
  score_team1 INTEGER DEFAULT NULL,
  score_team2 INTEGER DEFAULT NULL,
  points_team1 INTEGER DEFAULT NULL,
  points_team2 INTEGER DEFAULT NULL,
  match_order INTEGER DEFAULT 0,
  schedule_order INTEGER DEFAULT 0,
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

// Auto-migrate to add preferred_date if it doesn't exist
try {
  db.exec("ALTER TABLE players ADD COLUMN preferred_date TEXT;");
} catch (err) {
  // Column likely already exists
}

// Auto-migrate to add self_rating if it doesn't exist
try {
  db.exec("ALTER TABLE players ADD COLUMN self_rating INTEGER CHECK(self_rating IS NULL OR (self_rating BETWEEN 1 AND 10));");
} catch (err) {
  // Column likely already exists
}

// New table for multiple dates per player
db.exec(`
  CREATE TABLE IF NOT EXISTS player_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    UNIQUE(player_id, date)
  );
`);

// Auto-migrate to add accepted (admin approval) if it doesn't exist. Existing
// registrants go through the same approval queue as new ones, rather than
// being silently pre-accepted.
try {
  const playersCols = db.prepare("PRAGMA table_info(players)").all();
  if (!playersCols.some(c => c.name === 'accepted')) {
    db.exec("ALTER TABLE players ADD COLUMN accepted INTEGER NOT NULL DEFAULT 0;");
  }
} catch (err) {
  console.error('players.accepted migration failed:', err.message);
}

// Names are stored trimmed+uppercased, so a plain unique index is case-insensitive in practice.
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_players_name_unique ON players(name);');
} catch (err) {
  // Existing duplicate names in the DB prevent the index from being created; leave as-is.
}

// Migrate matches table to allow singles (tiebreak) entries: team*_player2_id nullable,
// and 'tiebreak' added to the phase check. SQLite can't ALTER a column's constraints
// in place, so rebuild the table when the old (stricter) schema is detected.
try {
  const matchesCols = db.prepare("PRAGMA table_info(matches)").all();
  const player2Col = matchesCols.find(c => c.name === 'team1_player2_id');
  if (player2Col && player2Col.notnull === 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE matches_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id INTEGER REFERENCES groups(id),
          phase TEXT NOT NULL DEFAULT 'gironi' CHECK(phase IN ('gironi', 'lower', 'semifinal', 'final', 'tiebreak')),
          type TEXT NOT NULL CHECK(type IN ('ATP', 'WTA')),
          team1_player1_id INTEGER NOT NULL REFERENCES players(id),
          team1_player2_id INTEGER REFERENCES players(id),
          team2_player1_id INTEGER NOT NULL REFERENCES players(id),
          team2_player2_id INTEGER REFERENCES players(id),
          score_team1 INTEGER DEFAULT NULL,
          score_team2 INTEGER DEFAULT NULL,
          points_team1 INTEGER DEFAULT NULL,
          points_team2 INTEGER DEFAULT NULL,
          match_order INTEGER DEFAULT 0,
          schedule_order INTEGER DEFAULT 0,
          scheduled_time TEXT DEFAULT NULL,
          completed INTEGER DEFAULT 0,
          round_number INTEGER DEFAULT 1
        );
      `);
      db.exec(`
        INSERT INTO matches_new (id, group_id, phase, type, team1_player1_id, team1_player2_id,
          team2_player1_id, team2_player2_id, score_team1, score_team2, points_team1, points_team2,
          match_order, scheduled_time, completed, round_number)
        SELECT id, group_id, phase, type, team1_player1_id, team1_player2_id,
          team2_player1_id, team2_player2_id, score_team1, score_team2, points_team1, points_team2,
          match_order, scheduled_time, completed, round_number
        FROM matches;
      `);
      db.exec('DROP TABLE matches;');
      db.exec('ALTER TABLE matches_new RENAME TO matches;');
    })();
  }
} catch (err) {
  console.error('matches table migration failed:', err.message);
}

// Auto-migrate to add schedule_order (global match play order) if it doesn't exist
try {
  const matchesCols = db.prepare("PRAGMA table_info(matches)").all();
  if (!matchesCols.some(c => c.name === 'schedule_order')) {
    db.exec('ALTER TABLE matches ADD COLUMN schedule_order INTEGER DEFAULT 0;');
  }
} catch (err) {
  console.error('matches.schedule_order migration failed:', err.message);
}

module.exports = db;
