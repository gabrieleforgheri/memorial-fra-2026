const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
    try {
        const players = db.prepare('SELECT * FROM players ORDER BY name').all();
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

router.post('/', (req, res) => {
    const { name, gender, preferred_dates } = req.body;
    
    if (!name || !gender) {
        return res.status(400).json({ error: 'Name and gender are required' });
    }
    
    if (gender !== 'M' && gender !== 'F') {
        return res.status(400).json({ error: 'Gender must be M or F' });
    }

    if (!preferred_dates || !Array.isArray(preferred_dates) || preferred_dates.length === 0) {
        return res.status(400).json({ error: 'Devi selezionare almeno una data' });
    }

    try {
        // Check if tournament is locked
        const state = db.prepare('SELECT locked FROM tournament_state WHERE id = 1').get();
        if (state && state.locked === 1) {
            return res.status(403).json({ error: 'Tournament is locked. Registration closed.' });
        }

        const newPlayer = db.transaction(() => {
            const stmt = db.prepare('INSERT INTO players (name, gender) VALUES (?, ?)');
            const result = stmt.run(name.trim().toUpperCase(), gender);
            const playerId = result.lastInsertRowid;

            const insertDate = db.prepare('INSERT INTO player_dates (player_id, date) VALUES (?, ?)');
            for (const date of preferred_dates) {
                insertDate.run(playerId, date);
            }

            return db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
        })();

        res.status(201).json(newPlayer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
