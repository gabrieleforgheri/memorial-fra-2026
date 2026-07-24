const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
    try {
        const players = db.prepare('SELECT * FROM players ORDER BY name').all();
        const getDates = db.prepare('SELECT date FROM player_dates WHERE player_id = ? ORDER BY date');
        for (const p of players) {
            p.preferred_dates = getDates.all(p.id).map(d => d.date);
        }
        res.json(players);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/dates', (req, res) => {
    try {
        const dates = db.prepare(`
            SELECT date, COUNT(*) as count 
            FROM player_dates 
            GROUP BY date
            ORDER BY date ASC
        `).all();
        res.json(dates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// The tournament date is fixed - registrants no longer pick availability,
// but we still record it as a preferred date for consistency with the
// historical player_dates data the admin stats view already shows.
const TOURNAMENT_DATE = '2026-08-01';

router.post('/', (req, res) => {
    const { name, gender } = req.body;

    if (!name || !name.trim() || !gender) {
        return res.status(400).json({ error: 'Name and gender are required' });
    }

    if (gender !== 'M' && gender !== 'F') {
        return res.status(400).json({ error: 'Gender must be M or F' });
    }

    const normalizedName = name.trim().toUpperCase();

    try {
        // Check if tournament is locked
        const state = db.prepare('SELECT locked FROM tournament_state WHERE id = 1').get();
        if (state && state.locked === 1) {
            return res.status(403).json({ error: 'Tournament is locked. Registration closed.' });
        }

        const existing = db.prepare('SELECT id FROM players WHERE name = ?').get(normalizedName);
        if (existing) {
            return res.status(400).json({ error: 'Un giocatore con questo nome è già iscritto' });
        }

        const newPlayer = db.transaction(() => {
            const stmt = db.prepare('INSERT INTO players (name, gender) VALUES (?, ?)');
            const result = stmt.run(normalizedName, gender);
            const playerId = result.lastInsertRowid;

            db.prepare('INSERT INTO player_dates (player_id, date) VALUES (?, ?)').run(playerId, TOURNAMENT_DATE);

            return db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
        })();

        res.status(201).json(newPlayer);
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Un giocatore con questo nome è già iscritto' });
        }
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
