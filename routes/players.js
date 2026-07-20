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
            SELECT preferred_date as date, COUNT(*) as count 
            FROM players 
            WHERE preferred_date IS NOT NULL 
            GROUP BY preferred_date
            ORDER BY preferred_date ASC
        `).all();
        res.json(dates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', (req, res) => {
    const { name, gender, preferred_date } = req.body;
    
    if (!name || !gender) {
        return res.status(400).json({ error: 'Name and gender are required' });
    }
    
    if (gender !== 'M' && gender !== 'F') {
        return res.status(400).json({ error: 'Gender must be M or F' });
    }

    try {
        // Check if tournament is locked
        const state = db.prepare('SELECT locked FROM tournament_state WHERE id = 1').get();
        if (state && state.locked === 1) {
            return res.status(403).json({ error: 'Tournament is locked. Registration closed.' });
        }

        const stmt = db.prepare('INSERT INTO players (name, gender, preferred_date) VALUES (?, ?, ?)');
        const result = stmt.run(name.trim().toUpperCase(), gender, preferred_date || null);
        
        const newPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newPlayer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
