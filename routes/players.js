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

router.post('/', (req, res) => {
    const { name, gender } = req.body;
    
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

        const stmt = db.prepare('INSERT INTO players (name, gender) VALUES (?, ?)');
        const result = stmt.run(name.trim().toUpperCase(), gender);
        
        const newPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newPlayer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
