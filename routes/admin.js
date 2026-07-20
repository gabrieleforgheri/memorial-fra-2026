const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db/database');
const { generateGroupsLogistics, calculateScorePoints } = require('../utils/tournament');

router.use(auth); // Protect all admin routes

// Update player category (F/N)
router.put('/players/:id/category', (req, res) => {
    const { category } = req.body;
    if (category !== 'F' && category !== 'N' && category !== null && category !== '') {
        return res.status(400).json({ error: 'Category must be F, N, or null' });
    }
    try {
        const cat = category === '' ? null : category;
        db.prepare('UPDATE players SET category = ? WHERE id = ?').run(cat, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update player name (cascading - references are by ID so auto-cascading)
router.put('/players/:id/name', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name.trim().toUpperCase(), req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a player
router.delete('/players/:id', (req, res) => {
    try {
        const state = db.prepare('SELECT locked FROM tournament_state WHERE id = 1').get();
        if (state && state.locked === 1) {
            return res.status(403).json({ error: 'Tournament is locked. Cannot delete players.' });
        }
        db.prepare('DELETE FROM group_players WHERE player_id = ?').run(req.params.id);
        db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Auto-generate groups
router.post('/groups/generate', (req, res) => {
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM group_players').run();
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM groups').run();
            
            const males = db.prepare("SELECT * FROM players WHERE gender = 'M' AND category IS NOT NULL").all();
            const females = db.prepare("SELECT * FROM players WHERE gender = 'F' AND category IS NOT NULL").all();
            
            const atpGroups = generateGroupsLogistics(males, 'ATP');
            const wtaGroups = generateGroupsLogistics(females, 'WTA');
            
            const insertGroup = db.prepare('INSERT INTO groups (name, type) VALUES (?, ?)');
            const insertGroupPlayer = db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)');
            const insertMatch = db.prepare(`
                INSERT INTO matches (group_id, phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
                VALUES (?, 'gironi', ?, ?, ?, ?, ?, ?)
            `);

            for (const group of [...atpGroups, ...wtaGroups]) {
                const groupResult = insertGroup.run(group.name, group.type);
                const groupId = groupResult.lastInsertRowid;
                
                const fPlayers = group.players.filter(p => p.category === 'F');
                const nPlayers = group.players.filter(p => p.category === 'N');
                
                for (const p of group.players) {
                    insertGroupPlayer.run(groupId, p.id);
                }
                
                // Match 1: F1+N1 vs F2+N2
                insertMatch.run(groupId, group.type, fPlayers[0].id, nPlayers[0].id, fPlayers[1].id, nPlayers[1].id, 1);
                // Match 2: F1+N2 vs F2+N1
                insertMatch.run(groupId, group.type, fPlayers[0].id, nPlayers[1].id, fPlayers[1].id, nPlayers[0].id, 2);
            }
            
            db.prepare("UPDATE tournament_state SET phase = 'groups_ready' WHERE id = 1").run();
        })();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Manually set group compositions
router.put('/groups/manual', (req, res) => {
    const { groups } = req.body;
    if (!groups || !Array.isArray(groups)) {
        return res.status(400).json({ error: 'Groups array is required' });
    }
    
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM group_players').run();
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM groups').run();
            
            const insertGroup = db.prepare('INSERT INTO groups (name, type) VALUES (?, ?)');
            const insertGroupPlayer = db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)');
            const insertMatch = db.prepare(`
                INSERT INTO matches (group_id, phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
                VALUES (?, 'gironi', ?, ?, ?, ?, ?, ?)
            `);
            
            groups.forEach(group => {
                const groupResult = insertGroup.run(group.name, group.type);
                const groupId = groupResult.lastInsertRowid;
                
                const playerIds = group.player_ids;
                playerIds.forEach(pid => insertGroupPlayer.run(groupId, pid));
                
                // Get player details to create matches
                const players = playerIds.map(id => db.prepare('SELECT * FROM players WHERE id = ?').get(id));
                const fPlayers = players.filter(p => p.category === 'F');
                const nPlayers = players.filter(p => p.category === 'N');
                
                if (fPlayers.length >= 2 && nPlayers.length >= 2) {
                    insertMatch.run(groupId, group.type, fPlayers[0].id, nPlayers[0].id, fPlayers[1].id, nPlayers[1].id, 1);
                    insertMatch.run(groupId, group.type, fPlayers[0].id, nPlayers[1].id, fPlayers[1].id, nPlayers[0].id, 2);
                }
            });
            
            db.prepare("UPDATE tournament_state SET phase = 'groups_ready' WHERE id = 1").run();
        })();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start tournament (lock registrations)
router.post('/tournament/start', (req, res) => {
    try {
        // Verify groups exist
        const groupCount = db.prepare('SELECT COUNT(*) as cnt FROM groups').get();
        if (groupCount.cnt === 0) {
            return res.status(400).json({ error: 'Generate groups before starting the tournament' });
        }
        db.prepare("UPDATE tournament_state SET phase = 'gironi', locked = 1, started_at = CURRENT_TIMESTAMP WHERE id = 1").run();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update match score
router.put('/matches/:id/score', (req, res) => {
    const { score_team1, score_team2 } = req.body;
    
    if (score_team1 === undefined || score_team2 === undefined) {
        return res.status(400).json({ error: 'Both scores are required' });
    }
    
    try {
        const { pts1, pts2 } = calculateScorePoints(parseInt(score_team1), parseInt(score_team2));
        
        db.transaction(() => {
            db.prepare(`
                UPDATE matches SET score_team1 = ?, score_team2 = ?, points_team1 = ?, points_team2 = ?, completed = 1
                WHERE id = ?
            `).run(parseInt(score_team1), parseInt(score_team2), pts1, pts2, req.params.id);
            
            // Recalculate group standings for this match's group
            const match = db.prepare('SELECT group_id FROM matches WHERE id = ?').get(req.params.id);
            if (match && match.group_id) {
                recalculateGroupStandings(match.group_id);
            }
        })();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Advance tournament to next phase
router.post('/tournament/advance', (req, res) => {
    try {
        const state = db.prepare('SELECT * FROM tournament_state WHERE id = 1').get();
        
        if (state.phase === 'gironi') {
            // Check if all group matches are completed
            const unfinished = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'gironi' AND completed = 0").get();
            if (unfinished.cnt > 0) {
                return res.status(400).json({ error: `Ci sono ancora ${unfinished.cnt} partite dei gironi non completate` });
            }
            
            // Generate lower bracket groups and matches
            generateLowerBracket();
            
            db.prepare("UPDATE tournament_state SET phase = 'lower_bracket' WHERE id = 1").run();
            res.json({ success: true, phase: 'lower_bracket' });
            
        } else if (state.phase === 'lower_bracket') {
            // Check if all lower bracket matches are completed
            const unfinished = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'lower' AND completed = 0").get();
            if (unfinished.cnt > 0) {
                return res.status(400).json({ error: `Ci sono ancora ${unfinished.cnt} partite del lower bracket non completate` });
            }
            
            // Generate elimination (semifinals)
            generateElimination();
            
            db.prepare("UPDATE tournament_state SET phase = 'elimination' WHERE id = 1").run();
            res.json({ success: true, phase: 'elimination' });
            
        } else if (state.phase === 'elimination') {
            // Check if all semifinal matches are completed
            const unfinished = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase IN ('semifinal', 'final') AND completed = 0").get();
            if (unfinished.cnt > 0) {
                // If semifinals are done but finals aren't generated, generate them
                const semisUnfinished = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'semifinal' AND completed = 0").get();
                if (semisUnfinished.cnt === 0) {
                    const finalsExist = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'final'").get();
                    if (finalsExist.cnt === 0) {
                        generateFinals();
                        return res.json({ success: true, message: 'Finali generate' });
                    }
                }
                return res.status(400).json({ error: `Ci sono ancora ${unfinished.cnt} partite da completare` });
            }
            
            db.prepare("UPDATE tournament_state SET phase = 'completed' WHERE id = 1").run();
            res.json({ success: true, phase: 'completed' });
            
        } else {
            res.status(400).json({ error: 'Cannot advance from current phase: ' + state.phase });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset tournament
router.post('/tournament/reset', (req, res) => {
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM group_players').run();
            db.prepare('DELETE FROM groups').run();
            db.prepare("UPDATE tournament_state SET phase = 'registration', locked = 0, started_at = NULL WHERE id = 1").run();
        })();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset simulation (keeps players who voted for a date)
router.post('/tournament/reset-simulation', (req, res) => {
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM group_players').run();
            db.prepare('DELETE FROM groups').run();
            // Keep players that have at least one date vote
            db.prepare('DELETE FROM players WHERE id NOT IN (SELECT DISTINCT player_id FROM player_dates)').run();
            db.prepare("UPDATE tournament_state SET phase = 'registration', locked = 0, started_at = NULL WHERE id = 1").run();
        })();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clear all date votes
router.post('/tournament/clear-dates', (req, res) => {
    try {
        db.prepare('DELETE FROM player_dates').run();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === Helper functions ===

function recalculateGroupStandings(groupId) {
    const groupMatches = db.prepare('SELECT * FROM matches WHERE group_id = ? AND completed = 1').all(groupId);
    
    // Reset all standings for this group
    db.prepare('UPDATE group_players SET points = 0, games_won = 0, games_lost = 0, diff = 0 WHERE group_id = ?').run(groupId);
    
    for (const m of groupMatches) {
        const diff1 = m.score_team1 - m.score_team2;
        const diff2 = m.score_team2 - m.score_team1;
        
        // Update team 1 players (both get same points)
        db.prepare(`
            UPDATE group_players 
            SET points = points + ?, games_won = games_won + ?, games_lost = games_lost + ?, diff = diff + ? 
            WHERE group_id = ? AND player_id IN (?, ?)
        `).run(m.points_team1, m.score_team1, m.score_team2, diff1, groupId, m.team1_player1_id, m.team1_player2_id);
        
        // Update team 2 players
        db.prepare(`
            UPDATE group_players 
            SET points = points + ?, games_won = games_won + ?, games_lost = games_lost + ?, diff = diff + ? 
            WHERE group_id = ? AND player_id IN (?, ?)
        `).run(m.points_team2, m.score_team2, m.score_team1, diff2, groupId, m.team2_player1_id, m.team2_player2_id);
    }
    
    // Update positions
    const sorted = db.prepare(`
        SELECT * FROM group_players WHERE group_id = ? ORDER BY points DESC, diff DESC
    `).all(groupId);
    
    sorted.forEach((p, i) => {
        db.prepare('UPDATE group_players SET position = ? WHERE id = ?').run(i + 1, p.id);
    });
}

function generateLowerBracket() {
    // For each type (ATP/WTA), get the bottom 2 from each group and create lower bracket group
    ['ATP', 'WTA'].forEach(type => {
        const groups = db.prepare("SELECT * FROM groups WHERE type = ? AND bracket = 'upper'").all(type);
        
        if (groups.length < 2) return; // Need at least 2 groups
        
        // Get bottom 2 from each group (positions 3 and 4)
        const lowerPlayers = [];
        groups.forEach(g => {
            const bottomPlayers = db.prepare(`
                SELECT gp.*, p.name, p.category FROM group_players gp
                JOIN players p ON gp.player_id = p.id
                WHERE gp.group_id = ?
                ORDER BY gp.points DESC, gp.diff DESC
            `).all(g.id);
            
            // Take bottom 2 (or less if fewer players)
            const bottom = bottomPlayers.slice(2);
            bottom.forEach(p => lowerPlayers.push({ ...p, from_group: g.id }));
        });
        
        if (lowerPlayers.length >= 4) {
            // Create lower bracket group
            const lowerGroup = db.prepare("INSERT INTO groups (name, type, bracket, phase) VALUES (?, ?, 'lower', 'lower')").run(`Lower Bracket ${type}`, type);
            const lowerGroupId = lowerGroup.lastInsertRowid;
            
            lowerPlayers.forEach(p => {
                db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)').run(lowerGroupId, p.player_id);
            });
            
            // Create matches for lower bracket (same F+N pairing logic)
            const fPlayers = lowerPlayers.filter(p => p.category === 'F');
            const nPlayers = lowerPlayers.filter(p => p.category === 'N');
            
            if (fPlayers.length >= 2 && nPlayers.length >= 2) {
                db.prepare(`
                    INSERT INTO matches (group_id, phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
                    VALUES (?, 'lower', ?, ?, ?, ?, ?, 1)
                `).run(lowerGroupId, type, fPlayers[0].player_id, nPlayers[0].player_id, fPlayers[1].player_id, nPlayers[1].player_id);
                
                db.prepare(`
                    INSERT INTO matches (group_id, phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
                    VALUES (?, 'lower', ?, ?, ?, ?, ?, 2)
                `).run(lowerGroupId, type, fPlayers[0].player_id, nPlayers[1].player_id, fPlayers[1].player_id, nPlayers[0].player_id);
            }
        }
    });
}

function generateElimination() {
    // For each type, create semifinals by cross-pairing:
    // Best F from Group A + Best N from Group B vs Best F from Group B + Best N from Group A
    ['ATP', 'WTA'].forEach(type => {
        const upperGroups = db.prepare("SELECT * FROM groups WHERE type = ? AND bracket = 'upper'").all(type);
        const lowerGroups = db.prepare("SELECT * FROM groups WHERE type = ? AND bracket = 'lower'").all(type);
        
        if (upperGroups.length < 2) return;
        
        // Get top 2 from each upper group
        const getTop2 = (groupId) => {
            return db.prepare(`
                SELECT gp.*, p.name, p.category FROM group_players gp
                JOIN players p ON gp.player_id = p.id
                WHERE gp.group_id = ?
                ORDER BY gp.points DESC, gp.diff DESC
                LIMIT 4
            `).all(groupId);
        };
        
        const groupA = getTop2(upperGroups[0].id);
        const groupB = getTop2(upperGroups[1].id);
        
        // Find best F and best N from each group
        const bestF_A = groupA.find(p => p.category === 'F');
        const bestN_A = groupA.find(p => p.category === 'N');
        const bestF_B = groupB.find(p => p.category === 'F');
        const bestN_B = groupB.find(p => p.category === 'N');
        
        if (bestF_A && bestN_B && bestF_B && bestN_A) {
            // Semifinal 1: Best F from A + Best N from B vs winner from lower
            // Semifinal 2: Best F from B + Best N from A vs winner from lower
            
            // For now, get top 2 from lower bracket too
            let lowerTop = [];
            if (lowerGroups.length > 0) {
                lowerTop = db.prepare(`
                    SELECT gp.*, p.name, p.category FROM group_players gp
                    JOIN players p ON gp.player_id = p.id
                    WHERE gp.group_id = ?
                    ORDER BY gp.points DESC, gp.diff DESC
                `).all(lowerGroups[0].id);
            }
            
            const lowerF1 = lowerTop.find(p => p.category === 'F');
            const lowerN1 = lowerTop.find(p => p.category === 'N');
            const lowerF2 = lowerTop.filter(p => p.category === 'F')[1];
            const lowerN2 = lowerTop.filter(p => p.category === 'N')[1];
            
            // Semifinal 1: upper cross-pair 1 vs lower pair 1
            if (lowerF1 && lowerN1) {
                db.prepare(`
                    INSERT INTO matches (phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
                    VALUES ('semifinal', ?, ?, ?, ?, ?, 1)
                `).run(type, bestF_A.player_id, bestN_B.player_id, lowerF1.player_id, lowerN1.player_id);
            }
            
            // Semifinal 2: upper cross-pair 2 vs lower pair 2
            if (lowerF2 && lowerN2) {
                db.prepare(`
                    INSERT INTO matches (phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
                    VALUES ('semifinal', ?, ?, ?, ?, ?, 2)
                `).run(type, bestF_B.player_id, bestN_A.player_id, lowerF2.player_id, lowerN2.player_id);
            } else {
                // If lower bracket doesn't have enough, semi 2 is just the other cross-pair vs someone
                // Just create match with available players
                db.prepare(`
                    INSERT INTO matches (phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
                    VALUES ('semifinal', ?, ?, ?, ?, ?, 2)
                `).run(type, bestF_B.player_id, bestN_A.player_id, bestF_A.player_id, bestN_A.player_id);
            }
        }
    });
}

function generateFinals() {
    ['ATP', 'WTA'].forEach(type => {
        const semis = db.prepare("SELECT * FROM matches WHERE phase = 'semifinal' AND type = ? AND completed = 1").all(type);
        
        if (semis.length < 2) return;
        
        // Get winners from each semifinal
        const getWinner = (match) => {
            if (match.score_team1 > match.score_team2) {
                return { p1: match.team1_player1_id, p2: match.team1_player2_id };
            }
            return { p1: match.team2_player1_id, p2: match.team2_player2_id };
        };
        
        const winner1 = getWinner(semis[0]);
        const winner2 = getWinner(semis[1]);
        
        db.prepare(`
            INSERT INTO matches (phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order)
            VALUES ('final', ?, ?, ?, ?, ?, 1)
        `).run(type, winner1.p1, winner1.p2, winner2.p1, winner2.p2);
    });
}

module.exports = router;
