const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/state', (req, res) => {
    try {
        const state = db.prepare('SELECT * FROM tournament_state WHERE id = 1').get();
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/groups', (req, res) => {
    try {
        const groups = db.prepare('SELECT * FROM groups').all();
        
        for (const g of groups) {
            const players = db.prepare(`
                SELECT gp.*, p.name, p.gender, p.category 
                FROM group_players gp 
                JOIN players p ON gp.player_id = p.id 
                WHERE gp.group_id = ?
                ORDER BY gp.points DESC
            `).all(g.id);
            
            g.players = players;
            // Add gender field derived from type for frontend compatibility
            g.gender = g.type === 'ATP' ? 'M' : 'F';
        }
        
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/matches', (req, res) => {
    try {
        const matches = db.prepare(`
            SELECT m.*, 
                   t1p1.name as t1p1_name, t1p1.category as t1p1_cat,
                   t1p2.name as t1p2_name, t1p2.category as t1p2_cat,
                   t2p1.name as t2p1_name, t2p1.category as t2p1_cat,
                   t2p2.name as t2p2_name, t2p2.category as t2p2_cat,
                   g.name as group_name
            FROM matches m
            LEFT JOIN players t1p1 ON m.team1_player1_id = t1p1.id
            LEFT JOIN players t1p2 ON m.team1_player2_id = t1p2.id
            LEFT JOIN players t2p1 ON m.team2_player1_id = t2p1.id
            LEFT JOIN players t2p2 ON m.team2_player2_id = t2p2.id
            LEFT JOIN groups g ON m.group_id = g.id
            ORDER BY m.schedule_order, m.phase, m.match_order
        `).all();
        
        // Enrich matches with structured team data for frontend
        const enriched = matches.map(m => {
            // Map gender
            const gender = m.type === 'ATP' ? 'M' : 'F';
            
            // Build phase name
            let phase_name = m.group_name || '';
            if (m.phase === 'gironi') phase_name = m.group_name || 'Girone';
            else if (m.phase === 'lower') phase_name = 'Lower Bracket';
            else if (m.phase === 'semifinal') phase_name = 'Semifinale';
            else if (m.phase === 'final') phase_name = 'Finale';
            else if (m.phase === 'tiebreak') phase_name = `Spareggio (Singolo) - ${m.group_name || ''}`.trim();

            // Status
            let status = 'upcoming';
            if (m.completed) status = 'completed';

            return {
                ...m,
                gender,
                phase_name,
                status,
                team1_name: m.t1p2_name ? `${m.t1p1_name || '?'} / ${m.t1p2_name}` : (m.t1p1_name || '?'),
                team2_name: m.t2p2_name ? `${m.t2p1_name || '?'} / ${m.t2p2_name}` : (m.t2p1_name || '?'),
                team1_players: [
                    { name: m.t1p1_name, category: m.t1p1_cat },
                    { name: m.t1p2_name, category: m.t1p2_cat }
                ],
                team2_players: [
                    { name: m.t2p1_name, category: m.t2p1_cat },
                    { name: m.t2p2_name, category: m.t2p2_cat }
                ]
            };
        });
        
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/bracket', (req, res) => {
    try {
        // Get elimination phase matches
        const matches = db.prepare(`
            SELECT m.*, 
                   t1p1.name as t1p1_name, t1p2.name as t1p2_name,
                   t2p1.name as t2p1_name, t2p2.name as t2p2_name,
                   g.name as group_name
            FROM matches m
            LEFT JOIN players t1p1 ON m.team1_player1_id = t1p1.id
            LEFT JOIN players t1p2 ON m.team1_player2_id = t1p2.id
            LEFT JOIN players t2p1 ON m.team2_player1_id = t2p1.id
            LEFT JOIN players t2p2 ON m.team2_player2_id = t2p2.id
            LEFT JOIN groups g ON m.group_id = g.id
            WHERE m.phase IN ('semifinal', 'final', 'lower')
            ORDER BY m.type, m.phase, m.match_order
        `).all();
        
        // Structure as bracket data
        const bracket = {
            ATP: { semifinal: [], final: [], lower: [] },
            WTA: { semifinal: [], final: [], lower: [] }
        };
        
        matches.forEach(m => {
            const type = m.type; // ATP or WTA
            const phase = m.phase;
            
            const matchData = {
                id: m.id,
                team1_name: `${m.t1p1_name || '?'} / ${m.t1p2_name || '?'}`,
                team2_name: `${m.t2p1_name || '?'} / ${m.t2p2_name || '?'}`,
                score_team1: m.score_team1,
                score_team2: m.score_team2,
                completed: m.completed,
                group_name: m.group_name
            };
            
            if (bracket[type] && bracket[type][phase]) {
                bracket[type][phase].push(matchData);
            }
        });
        
        res.json(bracket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/standings', (req, res) => {
    try {
        // Build individual standings from group_players data
        const standings = db.prepare(`
            SELECT 
                p.id, p.name, p.gender, p.category,
                COALESCE(SUM(gp.points), 0) as points,
                COALESCE(SUM(gp.games_won), 0) as games_won,
                COALESCE(SUM(gp.games_lost), 0) as games_lost,
                COALESCE(SUM(gp.diff), 0) as game_diff
            FROM players p
            LEFT JOIN group_players gp ON p.id = gp.player_id
            GROUP BY p.id
            ORDER BY points DESC
        `).all();
        
        // Add wins/losses counts from match data
        for (const s of standings) {
            // Count wins: matches where this player was on winning team
            const asTeam1Winner = db.prepare(`
                SELECT COUNT(*) as cnt FROM matches 
                WHERE completed = 1 AND score_team1 > score_team2 
                AND (team1_player1_id = ? OR team1_player2_id = ?)
            `).get(s.id, s.id);
            
            const asTeam2Winner = db.prepare(`
                SELECT COUNT(*) as cnt FROM matches 
                WHERE completed = 1 AND score_team2 > score_team1 
                AND (team2_player1_id = ? OR team2_player2_id = ?)
            `).get(s.id, s.id);
            
            const asTeam1Loser = db.prepare(`
                SELECT COUNT(*) as cnt FROM matches 
                WHERE completed = 1 AND score_team1 < score_team2 
                AND (team1_player1_id = ? OR team1_player2_id = ?)
            `).get(s.id, s.id);
            
            const asTeam2Loser = db.prepare(`
                SELECT COUNT(*) as cnt FROM matches 
                WHERE completed = 1 AND score_team2 < score_team1 
                AND (team2_player1_id = ? OR team2_player2_id = ?)
            `).get(s.id, s.id);
            
            s.wins = (asTeam1Winner?.cnt || 0) + (asTeam2Winner?.cnt || 0);
            s.losses = (asTeam1Loser?.cnt || 0) + (asTeam2Loser?.cnt || 0);
        }
        
        res.json(standings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
