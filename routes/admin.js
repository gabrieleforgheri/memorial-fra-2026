const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db/database');
const { generateGroupsLogistics, calculateScorePoints, validateBalancedCategories } = require('../utils/tournament');

router.use(auth); // Protect all admin routes

// Global match play order: matches are sorted by schedule_order. Each phase
// gets its own numeric block (with headroom for future phases/matches), and
// WTA always sorts before ATP within a block via typeOffset, per tournament
// running order: gironi WTA -> gironi ATP -> spareggi gironi WTA -> spareggi
// gironi ATP -> lower WTA -> lower ATP -> spareggi lower WTA -> spareggi
// lower ATP -> SF1 WTA -> SF1 ATP -> SF2 WTA -> SF2 ATP -> finale WTA -> finale ATP.
const SCHEDULE_BLOCK = { gironi: 1000, tiebreak_gironi: 2000, lower: 3000, tiebreak_lower: 4000, sf1: 5000, sf2: 6000, final: 7000 };
const TYPE_OFFSET = { WTA: 0, ATP: 100 };
function scheduleValue(blockName, type, suborder) {
    return SCHEDULE_BLOCK[blockName] + TYPE_OFFSET[type] + suborder;
}

// Accept a pending registration
router.put('/players/:id/accept', (req, res) => {
    try {
        db.prepare('UPDATE players SET accepted = 1 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Undo an acceptance (move back to pending)
router.put('/players/:id/unaccept', (req, res) => {
    try {
        db.prepare('UPDATE players SET accepted = 0 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Un giocatore con questo nome è già iscritto' });
        }
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
        const males = db.prepare("SELECT * FROM players WHERE gender = 'M' AND category IS NOT NULL AND accepted = 1").all();
        const females = db.prepare("SELECT * FROM players WHERE gender = 'F' AND category IS NOT NULL AND accepted = 1").all();

        if (males.length === 0 && females.length === 0) {
            return res.status(400).json({ error: 'Nessun giocatore accettato con categoria assegnata. Accetta le iscrizioni e assegna F/N prima di generare i gironi.' });
        }

        const maleBalance = validateBalancedCategories(males);
        if (!maleBalance.balanced) {
            return res.status(400).json({ error: `ATP: giocatori Forti (${maleBalance.fCount}) e Normali (${maleBalance.nCount}) non sono in numero uguale. Correggi le categorie prima di generare i gironi.` });
        }
        const femaleBalance = validateBalancedCategories(females);
        if (!femaleBalance.balanced) {
            return res.status(400).json({ error: `WTA: giocatrici Forti (${femaleBalance.fCount}) e Normali (${femaleBalance.nCount}) non sono in numero uguale. Correggi le categorie prima di generare i gironi.` });
        }

        db.transaction(() => {
            db.prepare('DELETE FROM group_players').run();
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM groups').run();

            const atpGroups = generateGroupsLogistics(males, 'ATP');
            const wtaGroups = generateGroupsLogistics(females, 'WTA');

            const insertGroup = db.prepare('INSERT INTO groups (name, type) VALUES (?, ?)');
            const insertGroupPlayer = db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)');

            // WTA gironi play out entirely before ATP gironi; within each type
            // matches interleave between Girone A/B/... rather than finishing
            // one girone before starting the next.
            [...wtaGroups, ...atpGroups].forEach(group => {
                const groupResult = insertGroup.run(group.name, group.type);
                group.id = groupResult.lastInsertRowid;
                for (const p of group.players) {
                    insertGroupPlayer.run(group.id, p.id);
                }
                group.fPlayers = group.players.filter(p => p.category === 'F');
                group.nPlayers = group.players.filter(p => p.category === 'N');
            });

            scheduleGironiMatches(wtaGroups, 'WTA');
            scheduleGironiMatches(atpGroups, 'ATP');

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
        for (const group of groups) {
            const players = (group.player_ids || []).map(id => db.prepare('SELECT category, accepted, name FROM players WHERE id = ?').get(id));
            const notAccepted = players.filter(p => !p || !p.accepted);
            if (notAccepted.length > 0) {
                return res.status(400).json({ error: `Girone "${group.name}": include giocatori non ancora accettati.` });
            }
            const { fCount, nCount, balanced } = validateBalancedCategories(players);
            if (!balanced) {
                return res.status(400).json({ error: `Girone "${group.name}": Forti (${fCount}) e Normali (${nCount}) non sono in numero uguale.` });
            }
        }

        db.transaction(() => {
            db.prepare('DELETE FROM group_players').run();
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM groups').run();

            const insertGroup = db.prepare('INSERT INTO groups (name, type) VALUES (?, ?)');
            const insertGroupPlayer = db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)');

            const createdGroups = groups.map(group => {
                const groupResult = insertGroup.run(group.name, group.type);
                const groupId = groupResult.lastInsertRowid;

                const playerIds = group.player_ids;
                playerIds.forEach(pid => insertGroupPlayer.run(groupId, pid));

                const players = playerIds.map(id => db.prepare('SELECT * FROM players WHERE id = ?').get(id));
                return {
                    id: groupId,
                    type: group.type,
                    fPlayers: players.filter(p => p.category === 'F'),
                    nPlayers: players.filter(p => p.category === 'N')
                };
            });

            // WTA gironi play out entirely before ATP gironi; within each type
            // matches interleave between gironi rather than finishing one
            // girone before starting the next.
            ['WTA', 'ATP'].forEach(type => {
                const typeGroups = createdGroups.filter(g => g.type === type && g.fPlayers.length >= 2 && g.nPlayers.length >= 2);
                scheduleGironiMatches(typeGroups, type);
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

    const s1 = parseInt(score_team1);
    const s2 = parseInt(score_team2);
    if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0) {
        return res.status(400).json({ error: 'Scores must be non-negative integers' });
    }
    if (s1 === s2) {
        return res.status(400).json({ error: 'Il punteggio non può essere un pareggio' });
    }

    try {
        const { pts1, pts2 } = calculateScorePoints(s1, s2);
        
        db.transaction(() => {
            db.prepare(`
                UPDATE matches SET score_team1 = ?, score_team2 = ?, points_team1 = ?, points_team2 = ?, completed = 1
                WHERE id = ?
            `).run(s1, s2, pts1, pts2, req.params.id);
            
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

            // Resolve any F/N ties before creating real matches, so a
            // PENDING_TIEBREAK can't leave the lower bracket half-generated.
            checkBracketReady('upper');

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

            checkBracketReady('upper');

            // Generate semifinal 1 only - the two upper-group qualifying pairs play each other directly
            generateSemifinal1();

            db.prepare("UPDATE tournament_state SET phase = 'elimination' WHERE id = 1").run();
            res.json({ success: true, phase: 'elimination' });

        } else if (state.phase === 'elimination') {
            const sf1Unfinished = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'semifinal' AND match_order = 1 AND completed = 0").get();
            if (sf1Unfinished.cnt > 0) {
                return res.status(400).json({ error: `Ci sono ancora ${sf1Unfinished.cnt} semifinali 1 non completate` });
            }

            const sf2Exists = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'semifinal' AND match_order = 2").get();
            if (sf2Exists.cnt === 0) {
                checkBracketReady('lower');
                generateSemifinal2();
                return res.json({ success: true, message: 'Semifinale 2 generata: il perdente della semifinale 1 sfida i qualificati dal Lower Bracket' });
            }

            const sf2Unfinished = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'semifinal' AND match_order = 2 AND completed = 0").get();
            if (sf2Unfinished.cnt > 0) {
                return res.status(400).json({ error: `Ci sono ancora ${sf2Unfinished.cnt} semifinali 2 non completate` });
            }

            const finalsExist = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'final'").get();
            if (finalsExist.cnt === 0) {
                generateFinals();
                return res.json({ success: true, message: 'Finali generate' });
            }

            const finalsUnfinished = db.prepare("SELECT COUNT(*) as cnt FROM matches WHERE phase = 'final' AND completed = 0").get();
            if (finalsUnfinished.cnt > 0) {
                return res.status(400).json({ error: `Ci sono ancora ${finalsUnfinished.cnt} finali non completate` });
            }

            db.prepare("UPDATE tournament_state SET phase = 'completed' WHERE id = 1").run();
            res.json({ success: true, phase: 'completed' });

        } else {
            res.status(400).json({ error: 'Cannot advance from current phase: ' + state.phase });
        }
    } catch (err) {
        if (err.code === 'PENDING_TIEBREAK') {
            return res.status(400).json({ error: err.message });
        }
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

// Creates the 2 round-robin matches of a girone (F1+N1 vs F2+N2, F1+N2 vs F2+N1)
// for every group of one type (WTA or ATP), with schedule_order set so matches
// interleave across gironi (Girone A match 1, Girone B match 1, Girone A match 2,
// Girone B match 2, ...) instead of finishing one girone before the next.
function scheduleGironiMatches(groups, type) {
    const insertMatch = db.prepare(`
        INSERT INTO matches (group_id, phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order, schedule_order)
        VALUES (?, 'gironi', ?, ?, ?, ?, ?, ?, ?)
    `);
    let suborder = 1;
    for (let matchIdx = 0; matchIdx < 2; matchIdx++) {
        for (const group of groups) {
            const [f1, f2] = group.fPlayers;
            const [n1, n2] = group.nPlayers;
            const [t1p2, t2p2] = matchIdx === 0 ? [n1, n2] : [n2, n1];
            insertMatch.run(
                group.id, type,
                f1.id, t1p2.id, f2.id, t2p2.id,
                matchIdx + 1,
                scheduleValue('gironi', type, suborder++)
            );
        }
    }
}

// Finds (or creates) the singles tiebreak match between two tied players of a group.
function ensureTiebreakMatch(groupId, type, p1, p2, blockName) {
    const existing = db.prepare(`
        SELECT * FROM matches WHERE phase = 'tiebreak' AND group_id = ?
        AND ((team1_player1_id = ? AND team2_player1_id = ?) OR (team1_player1_id = ? AND team2_player1_id = ?))
    `).get(groupId, p1.player_id, p2.player_id, p2.player_id, p1.player_id);
    if (existing) return existing;

    const suborder = 1 + db.prepare(`
        SELECT COUNT(*) as cnt FROM matches WHERE phase = 'tiebreak' AND type = ? AND schedule_order BETWEEN ? AND ?
    `).get(type, SCHEDULE_BLOCK[blockName], SCHEDULE_BLOCK[blockName] + TYPE_OFFSET.ATP + 99).cnt;

    const result = db.prepare(`
        INSERT INTO matches (group_id, phase, type, team1_player1_id, team2_player1_id, match_order, schedule_order)
        VALUES (?, 'tiebreak', ?, ?, ?, 1, ?)
    `).run(groupId, type, p1.player_id, p2.player_id, scheduleValue(blockName, type, suborder));
    return db.prepare('SELECT * FROM matches WHERE id = ?').get(result.lastInsertRowid);
}

// Best/worst F and N of a group by points only. A genuine tie can only ever
// involve the two players of one category (mathematically impossible for 3+,
// or for an F and an N to tie - see the two round-robin matches' point
// structure) and is resolved by a singles match, per tournament rules, rather
// than by game difference or a coin flip. Throws PENDING_TIEBREAK (after
// creating the singles match if it doesn't exist yet) when that match hasn't
// been played, so callers must check readiness before generating real matches.
function pickBestAndWorst(groupId) {
    const players = db.prepare(`
        SELECT gp.*, p.name, p.category FROM group_players gp
        JOIN players p ON gp.player_id = p.id
        WHERE gp.group_id = ?
        ORDER BY gp.points DESC
    `).all(groupId);

    const groupInfo = db.prepare('SELECT name, type, bracket FROM groups WHERE id = ?').get(groupId);
    const blockName = groupInfo.bracket === 'lower' ? 'tiebreak_lower' : 'tiebreak_gironi';

    const resolve = (list) => {
        if (list.length < 2) return { best: list[0], worst: list[1] };
        const [p1, p2] = list;
        if (p1.points !== p2.points) {
            return { best: p1, worst: p2 };
        }

        const tiebreak = ensureTiebreakMatch(groupId, groupInfo.type, p1, p2, blockName);
        if (!tiebreak.completed) {
            const err = new Error(`Pareggio in ${groupInfo.name} tra ${p1.name} e ${p2.name}: gioca il singolo di spareggio prima di continuare.`);
            err.code = 'PENDING_TIEBREAK';
            throw err;
        }
        const winnerId = tiebreak.score_team1 > tiebreak.score_team2 ? tiebreak.team1_player1_id : tiebreak.team2_player1_id;
        return {
            best: list.find(p => p.player_id === winnerId),
            worst: list.find(p => p.player_id !== winnerId)
        };
    };

    const fResult = resolve(players.filter(p => p.category === 'F'));
    const nResult = resolve(players.filter(p => p.category === 'N'));

    return { bestF: fResult.best, worstF: fResult.worst, bestN: nResult.best, worstN: nResult.worst };
}

// Verifies (and, as a side effect, creates any missing singles tiebreak matches
// for) every group of the given bracket, WITHOUT writing any new
// gironi/semifinal matches - callers should call this before generating real
// matches so a mid-generation PENDING_TIEBREAK can't leave things half-created.
function checkBracketReady(bracket) {
    const groups = db.prepare("SELECT * FROM groups WHERE bracket = ?").all(bracket);
    for (const g of groups) {
        pickBestAndWorst(g.id);
    }
}

function recalculateGroupStandings(groupId) {
    // Tiebreak singles matches don't count toward group standings - they only
    // exist to decide a tie, not to add points/games to it.
    const groupMatches = db.prepare("SELECT * FROM matches WHERE group_id = ? AND completed = 1 AND phase != 'tiebreak'").all(groupId);
    
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
    
    // Update positions (points only - game diff is no longer a ranking
    // criterion; genuine point ties are resolved by a singles tiebreak match)
    const sorted = db.prepare(`
        SELECT * FROM group_players WHERE group_id = ? ORDER BY points DESC
    `).all(groupId);
    
    sorted.forEach((p, i) => {
        db.prepare('UPDATE group_players SET position = ? WHERE id = ?').run(i + 1, p.id);
    });
}

function generateLowerBracket() {
    // For each type (ATP/WTA): the F and N who did NOT qualify from each upper
    // group (i.e. the ones who aren't that group's best F / best N) form the
    // Lower bracket girone. Round robin, cross-paired by origin group first
    // (match 1), then paired within their own original group (match 2) - the
    // two are the only possible F+N pairings among these 4 players.
    ['ATP', 'WTA'].forEach(type => {
        const groups = db.prepare("SELECT * FROM groups WHERE type = ? AND bracket = 'upper'").all(type);
        if (groups.length < 2) return;

        const A = pickBestAndWorst(groups[0].id);
        const B = pickBestAndWorst(groups[1].id);

        if (!A.worstF || !A.worstN || !B.worstF || !B.worstN) return;

        const lowerGroup = db.prepare("INSERT INTO groups (name, type, bracket, phase) VALUES (?, ?, 'lower', 'lower')").run(`Lower Bracket ${type}`, type);
        const lowerGroupId = lowerGroup.lastInsertRowid;

        [A.worstF, A.worstN, B.worstF, B.worstN].forEach(p => {
            db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)').run(lowerGroupId, p.player_id);
        });

        // Match 1: cross-group pair vs cross-group pair
        db.prepare(`
            INSERT INTO matches (group_id, phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order, schedule_order)
            VALUES (?, 'lower', ?, ?, ?, ?, ?, 1, ?)
        `).run(lowerGroupId, type, A.worstF.player_id, B.worstN.player_id, B.worstF.player_id, A.worstN.player_id, scheduleValue('lower', type, 1));

        // Match 2: same-origin-group pair vs same-origin-group pair
        db.prepare(`
            INSERT INTO matches (group_id, phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order, schedule_order)
            VALUES (?, 'lower', ?, ?, ?, ?, ?, 2, ?)
        `).run(lowerGroupId, type, A.worstF.player_id, A.worstN.player_id, B.worstF.player_id, B.worstN.player_id, scheduleValue('lower', type, 2));
    });
}

// Semifinal 1: the two upper-group qualifying pairs play each other directly.
// Best F from Group A + Best N from Group B vs Best F from Group B + Best N from Group A.
function generateSemifinal1() {
    ['ATP', 'WTA'].forEach(type => {
        const upperGroups = db.prepare("SELECT * FROM groups WHERE type = ? AND bracket = 'upper'").all(type);
        if (upperGroups.length < 2) return;

        const A = pickBestAndWorst(upperGroups[0].id);
        const B = pickBestAndWorst(upperGroups[1].id);

        if (!A.bestF || !A.bestN || !B.bestF || !B.bestN) return;

        db.prepare(`
            INSERT INTO matches (phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order, schedule_order)
            VALUES ('semifinal', ?, ?, ?, ?, ?, 1, ?)
        `).run(type, A.bestF.player_id, B.bestN.player_id, B.bestF.player_id, A.bestN.player_id, scheduleValue('sf1', type, 1));
    });
}

// Semifinal 2: the loser of semifinal 1 plays the Lower bracket's best F + best N,
// for the second spot in the final. Only generated once semifinal 1 has a result.
function generateSemifinal2() {
    ['ATP', 'WTA'].forEach(type => {
        const sf1 = db.prepare("SELECT * FROM matches WHERE phase = 'semifinal' AND type = ? AND match_order = 1").get(type);
        if (!sf1 || !sf1.completed) return;

        const alreadyGenerated = db.prepare("SELECT id FROM matches WHERE phase = 'semifinal' AND type = ? AND match_order = 2").get(type);
        if (alreadyGenerated) return;

        const lowerGroup = db.prepare("SELECT * FROM groups WHERE type = ? AND bracket = 'lower'").get(type);
        if (!lowerGroup) return;

        const lower = pickBestAndWorst(lowerGroup.id);
        if (!lower.bestF || !lower.bestN) return;

        const loser = sf1.score_team1 > sf1.score_team2
            ? { p1: sf1.team2_player1_id, p2: sf1.team2_player2_id }
            : { p1: sf1.team1_player1_id, p2: sf1.team1_player2_id };

        db.prepare(`
            INSERT INTO matches (phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order, schedule_order)
            VALUES ('semifinal', ?, ?, ?, ?, ?, 2, ?)
        `).run(type, lower.bestF.player_id, lower.bestN.player_id, loser.p1, loser.p2, scheduleValue('sf2', type, 1));
    });
}

// Final: semifinal 1's winner advances unchanged; semifinal 2's winner takes the other spot.
function generateFinals() {
    ['ATP', 'WTA'].forEach(type => {
        const sf1 = db.prepare("SELECT * FROM matches WHERE phase = 'semifinal' AND type = ? AND match_order = 1").get(type);
        const sf2 = db.prepare("SELECT * FROM matches WHERE phase = 'semifinal' AND type = ? AND match_order = 2").get(type);
        if (!sf1 || !sf1.completed || !sf2 || !sf2.completed) return;

        const getWinner = (match) => match.score_team1 > match.score_team2
            ? { p1: match.team1_player1_id, p2: match.team1_player2_id }
            : { p1: match.team2_player1_id, p2: match.team2_player2_id };

        const winner1 = getWinner(sf1);
        const winner2 = getWinner(sf2);

        db.prepare(`
            INSERT INTO matches (phase, type, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, match_order, schedule_order)
            VALUES ('final', ?, ?, ?, ?, ?, 1, ?)
        `).run(type, winner1.p1, winner1.p2, winner2.p1, winner2.p2, scheduleValue('final', type, 1));
    });
}

module.exports = router;
