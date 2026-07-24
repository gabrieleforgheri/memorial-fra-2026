// Simulation script for full tournament test
// Run with: node simulate.js

const BASE = 'http://localhost:3012/api';

async function req(endpoint, options = {}) {
    const url = `${BASE}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        console.error(`  ❌ ${options.method || 'GET'} ${endpoint} → ${res.status}: ${data?.error || 'unknown'}`);
        return { _error: true, status: res.status, ...(data || {}) };
    }
    return data;
}

let TOKEN = null;
async function adminReq(endpoint, options = {}) {
    options.headers = { ...(options.headers || {}), Authorization: `Bearer ${TOKEN}` };
    return req(endpoint, options);
}

const issues = [];
function issue(severity, section, msg) {
    issues.push({ severity, section, msg });
    const icon = severity === 'BUG' ? '🐛' : severity === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`  ${icon} [${section}] ${msg}`);
}

// Scores any pending singles tiebreak matches (a real admin would just play them
// on the spot when the "avanza fase" button tells them to). Returns how many were played.
async function resolvePendingTiebreaks() {
    const matches = await req('/tournament/matches');
    const pending = (matches || []).filter(m => m.phase === 'tiebreak' && !m.completed);
    for (const m of pending) {
        await adminReq(`/admin/matches/${m.id}/score`, { method: 'PUT', body: JSON.stringify({ score_team1: 6, score_team2: 4 }) });
    }
    return pending.length;
}

// Advances the tournament, automatically playing any singles tiebreak the
// advance uncovers and retrying, same as an admin would from the UI.
async function advanceRobust() {
    let result = await adminReq('/admin/tournament/advance', { method: 'POST' });
    // Each advance() call surfaces (and creates) at most one pending tiebreak at
    // a time (it throws on the first tie it finds while checking groups), so a
    // girone with ties in both ATP and WTA needs more than one retry to clear.
    for (let attempt = 0; attempt < 5 && result._error && result.error && result.error.includes('Pareggio'); attempt++) {
        const n = await resolvePendingTiebreaks();
        console.log(`  ⚖️  Pareggio rilevato: giocato ${n} singolo/i di spareggio`);
        result = await adminReq('/admin/tournament/advance', { method: 'POST' });
    }
    return result;
}

async function run() {
    console.log('\n🏁 === SIMULAZIONE TORNEO 3° MEMORIAL FRA ===\n');

    // 1. LOGIN
    console.log('📌 1. Login admin...');
    const login = await req('/auth/login', { method: 'POST', body: JSON.stringify({ password: 'icysun634' }) });
    if (login._error) { console.error('FATAL: cannot login'); return; }
    TOKEN = login.token;
    console.log('  ✅ Login OK\n');

    // 2. RESET
    console.log('📌 2. Reset torneo...');
    await adminReq('/admin/tournament/reset', { method: 'POST' });
    // Also delete all remaining players
    const existingPlayers = await req('/players');
    for (const p of (existingPlayers || [])) {
        await adminReq(`/admin/players/${p.id}`, { method: 'DELETE' });
    }
    const afterDelete = await req('/players');
    if (afterDelete && afterDelete.length > 0) issue('BUG', 'RESET', `Ci sono ancora ${afterDelete.length} giocatori dopo il reset completo`);
    else console.log('  ✅ Reset OK - 0 giocatori\n');

    // 3. REGISTRA 16 GIOCATORI (8M + 8F) - la data del torneo e' fissa (1 Ago),
    // registrata automaticamente dal server, non serve piu' passarla.
    console.log('📌 3. Registrazione 16 giocatori...');
    const maleNames = ['MARIO ROSSI', 'LUCA BIANCHI', 'ANDREA VERDI', 'MARCO NERI', 'PAOLO RUSSO', 'DAVIDE CONTI', 'FABIO RICCI', 'GIORGIO BRUNO'];
    const femaleNames = ['GIULIA ROSSI', 'SARA BIANCHI', 'CHIARA VERDI', 'ANNA NERI', 'ELENA RUSSO', 'MARTA CONTI', 'LAURA RICCI', 'SOFIA BRUNO'];

    for (const name of maleNames) {
        const r = await req('/players', { method: 'POST', body: JSON.stringify({ name, gender: 'M' }) });
        if (r._error) issue('BUG', 'REGISTRAZIONE', `Impossibile registrare ${name}`);
    }
    for (const name of femaleNames) {
        const r = await req('/players', { method: 'POST', body: JSON.stringify({ name, gender: 'F' }) });
        if (r._error) issue('BUG', 'REGISTRAZIONE', `Impossibile registrare ${name}`);
    }

    const players = await req('/players');
    const males = players.filter(p => p.gender === 'M');
    const females = players.filter(p => p.gender === 'F');
    console.log(`  Registrati: ${males.length}M + ${females.length}F = ${players.length} totali`);
    if (males.length !== 8) issue('BUG', 'REGISTRAZIONE', `Attesi 8 maschi, trovati ${males.length}`);
    if (females.length !== 8) issue('BUG', 'REGISTRAZIONE', `Attese 8 femmine, trovate ${females.length}`);
    if (players.some(p => p.accepted)) issue('BUG', 'REGISTRAZIONE', 'Un giocatore appena iscritto risulta già accettato');

    // Check dates (auto-recorded as the fixed tournament date)
    const dateStats = await req('/players/dates');
    console.log(`  Date votate: ${JSON.stringify(dateStats)}`);
    if (!dateStats || dateStats.length === 0) issue('BUG', 'DATE', 'Nessuna data salvata nonostante registrazioni');
    else {
        const d = dateStats.find(d => d.date === '2026-08-01');
        if (!d || d.count !== 16) issue('WARN', 'DATE', `1 Agosto: ${d ? d.count : 0} voti (attesi 16)`);
    }

    // 4. ACCETTA TUTTI GLI ISCRITTI, poi ASSEGNA CATEGORIE (metà F, metà N)
    console.log('\n📌 4. Accettazione iscritti e assegnazione categorie F/N...');
    for (const p of players) {
        const r = await adminReq(`/admin/players/${p.id}/accept`, { method: 'PUT' });
        if (r._error) issue('BUG', 'ACCETTAZIONE', `Impossibile accettare ${p.name}`);
    }

    const malesForCat = players.filter(p => p.gender === 'M');
    const femalesForCat = players.filter(p => p.gender === 'F');

    for (let i = 0; i < malesForCat.length; i++) {
        const cat = i < 4 ? 'F' : 'N';
        await adminReq(`/admin/players/${malesForCat[i].id}/category`, { method: 'PUT', body: JSON.stringify({ category: cat }) });
    }
    for (let i = 0; i < femalesForCat.length; i++) {
        const cat = i < 4 ? 'F' : 'N';
        await adminReq(`/admin/players/${femalesForCat[i].id}/category`, { method: 'PUT', body: JSON.stringify({ category: cat }) });
    }

    const updatedPlayers = await req('/players');
    const noCategory = updatedPlayers.filter(p => !p.category);
    if (noCategory.length > 0) issue('BUG', 'CATEGORIE', `${noCategory.length} giocatori senza categoria dopo assegnazione`);
    else console.log('  ✅ Tutti i giocatori hanno categoria F o N\n');

    // 5. GENERA GIRONI
    console.log('📌 5. Generazione gironi...');
    const genResult = await adminReq('/admin/groups/generate', { method: 'POST' });
    if (genResult._error) { issue('BUG', 'GIRONI', 'Impossibile generare gironi'); return; }
    
    const groups = await req('/tournament/groups');
    console.log(`  Gironi creati: ${groups.length}`);
    
    const atpGroups = groups.filter(g => g.type === 'ATP');
    const wtaGroups = groups.filter(g => g.type === 'WTA');
    console.log(`  ATP: ${atpGroups.length} gironi, WTA: ${wtaGroups.length} gironi`);
    
    if (atpGroups.length !== 2) issue('BUG', 'GIRONI', `Attesi 2 gironi ATP, trovati ${atpGroups.length}`);
    if (wtaGroups.length !== 2) issue('BUG', 'GIRONI', `Attesi 2 gironi WTA, trovati ${wtaGroups.length}`);
    
    for (const g of groups) {
        if (!g.players || g.players.length !== 4) {
            issue('BUG', 'GIRONI', `Girone "${g.name}" ha ${g.players?.length || 0} giocatori (attesi 4)`);
        } else {
            const fCount = g.players.filter(p => p.category === 'F').length;
            const nCount = g.players.filter(p => p.category === 'N').length;
            if (fCount !== 2 || nCount !== 2) {
                issue('BUG', 'GIRONI', `Girone "${g.name}": ${fCount}F + ${nCount}N (attesi 2F + 2N)`);
            }
        }
    }

    // Check state
    const stateAfterGroups = await req('/tournament/state');
    if (stateAfterGroups.phase !== 'groups_ready') issue('WARN', 'STATO', `Fase dopo generazione gironi: "${stateAfterGroups.phase}" (attesa "groups_ready")`);
    else console.log('  ✅ Stato: groups_ready\n');

    // 6. CHECK MATCHES CREATED
    console.log('📌 6. Verifica partite create...');
    const matches = await req('/tournament/matches');
    const groupMatches = matches.filter(m => m.phase === 'gironi');
    console.log(`  Partite gironi: ${groupMatches.length}`);
    // 4 groups * 2 matches each = 8
    if (groupMatches.length !== 8) issue('BUG', 'PARTITE', `Attese 8 partite gironi (4 gironi × 2), trovate ${groupMatches.length}`);

    // Check team composition: each team should have 1 F + 1 N
    for (const m of matches) {
        const t1cats = m.team1_players?.map(p => p.category) || [];
        const t2cats = m.team2_players?.map(p => p.category) || [];
        if (!t1cats.includes('F') || !t1cats.includes('N')) {
            issue('BUG', 'PARTITE', `Match ${m.id}: Team 1 non ha 1F+1N → ${t1cats.join('+')}`);
        }
        if (!t2cats.includes('F') || !t2cats.includes('N')) {
            issue('BUG', 'PARTITE', `Match ${m.id}: Team 2 non ha 1F+1N → ${t2cats.join('+')}`);
        }
        // Check names are not '?'
        if (m.team1_name?.includes('?') || m.team2_name?.includes('?')) {
            issue('WARN', 'PARTITE', `Match ${m.id}: nomi contengono "?" → "${m.team1_name}" vs "${m.team2_name}"`);
        }
    }
    console.log('  ✅ Composizione team verificata\n');

    // 7. AVVIA TORNEO
    console.log('📌 7. Avvio torneo...');
    const startResult = await adminReq('/admin/tournament/start', { method: 'POST' });
    if (startResult._error) issue('BUG', 'AVVIO', 'Impossibile avviare torneo');
    
    const stateAfterStart = await req('/tournament/state');
    if (stateAfterStart.phase !== 'gironi') issue('BUG', 'STATO', `Fase dopo avvio: "${stateAfterStart.phase}" (attesa "gironi")`);
    if (stateAfterStart.locked !== 1) issue('BUG', 'STATO', 'Torneo non lockato dopo avvio');
    console.log(`  ✅ Fase: ${stateAfterStart.phase}, locked: ${stateAfterStart.locked}\n`);

    // 8. VERIFICA BLOCCO REGISTRAZIONI
    console.log('📌 8. Test blocco registrazioni...');
    const blockedReg = await req('/players', { method: 'POST', body: JSON.stringify({ name: 'HACKER', gender: 'M' }) });
    if (!blockedReg._error) issue('BUG', 'SICUREZZA', 'Registrazione NON bloccata durante torneo!');
    else console.log('  ✅ Registrazione bloccata correttamente\n');

    // 9. INSERISCI RISULTATI GIRONI
    console.log('📌 9. Inserimento risultati gironi...');
    const scores = [
        [6, 3],  // vittoria netta → 3-0
        [5, 4],  // tie-break → 2-1
        [7, 2],  // vittoria netta → 3-0
        [4, 5],  // tie-break → 1-2
        [6, 1],  // vittoria netta → 3-0
        [3, 6],  // vittoria netta → 0-3
        [5, 4],  // tie-break → 2-1
        [6, 4],  // vittoria netta → 3-0
    ];
    
    for (let i = 0; i < groupMatches.length; i++) {
        const m = groupMatches[i];
        const [s1, s2] = scores[i] || [6, 3];
        const scoreResult = await adminReq(`/admin/matches/${m.id}/score`, {
            method: 'PUT',
            body: JSON.stringify({ score_team1: s1, score_team2: s2 })
        });
        if (scoreResult._error) issue('BUG', 'PUNTEGGI', `Impossibile salvare punteggio per match ${m.id}`);
    }
    
    // Verify all completed
    const matchesAfterScores = await req('/tournament/matches');
    const unfinishedGroup = matchesAfterScores.filter(m => m.phase === 'gironi' && !m.completed);
    if (unfinishedGroup.length > 0) issue('BUG', 'PUNTEGGI', `${unfinishedGroup.length} partite gironi ancora incomplete dopo inserimento`);
    else console.log('  ✅ Tutti i punteggi gironi inseriti\n');

    // 10. CHECK STANDINGS
    console.log('📌 10. Verifica classifica...');
    const standings = await req('/tournament/standings');
    const playersWithPoints = standings.filter(p => p.points > 0);
    console.log(`  Giocatori con punti: ${playersWithPoints.length}/${standings.length}`);
    if (playersWithPoints.length === 0) issue('BUG', 'CLASSIFICA', 'Nessun giocatore ha punti dopo i gironi!');

    // Check point calculation
    for (const s of standings) {
        if (s.category && s.points === 0 && (s.wins > 0 || s.losses > 0)) {
            issue('WARN', 'CLASSIFICA', `${s.name} ha V:${s.wins} P:${s.losses} ma 0 punti`);
        }
    }

    // 11. AVANZA → LOWER BRACKET
    console.log('\n📌 11. Avanzamento → Lower Bracket...');
    const advResult1 = await advanceRobust();
    if (advResult1._error) { issue('BUG', 'AVANZAMENTO', `Impossibile avanzare a lower bracket: ${advResult1.error}`); }
    
    const stateAfterLB = await req('/tournament/state');
    console.log(`  Fase: ${stateAfterLB.phase}`);
    if (stateAfterLB.phase !== 'lower_bracket') issue('BUG', 'STATO', `Fase dopo avanzamento: "${stateAfterLB.phase}" (attesa "lower_bracket")`);

    // Check lower bracket matches
    const matchesLB = await req('/tournament/matches');
    const lowerMatches = matchesLB.filter(m => m.phase === 'lower');
    console.log(`  Partite lower bracket: ${lowerMatches.length}`);
    if (lowerMatches.length === 0) issue('WARN', 'LOWER BRACKET', 'Nessuna partita lower bracket creata');

    // Insert lower bracket scores
    for (const m of lowerMatches) {
        await adminReq(`/admin/matches/${m.id}/score`, {
            method: 'PUT',
            body: JSON.stringify({ score_team1: 6, score_team2: 3 })
        });
    }
    console.log(`  ✅ Inseriti ${lowerMatches.length} risultati lower bracket\n`);

    // 12. AVANZA → ELIMINAZIONE (genera solo Semifinale 1: le due coppie upper si sfidano direttamente)
    console.log('📌 12. Avanzamento → Eliminazione diretta (Semifinale 1)...');
    const advResult2 = await advanceRobust();
    if (advResult2._error) { issue('BUG', 'AVANZAMENTO', `Impossibile avanzare a eliminazione: ${advResult2.error}`); }

    const stateAfterElim = await req('/tournament/state');
    console.log(`  Fase: ${stateAfterElim.phase}`);

    const matchesElim = await req('/tournament/matches');
    const sf1Matches = matchesElim.filter(m => m.phase === 'semifinal' && m.match_order === 1);
    console.log(`  Semifinali 1: ${sf1Matches.length}`);
    if (sf1Matches.length === 0) issue('BUG', 'SEMIFINALI', 'Nessuna Semifinale 1 creata!');
    if (sf1Matches.length > 0) {
        const sf1Unfinished = matchesElim.filter(m => m.phase === 'semifinal' && m.match_order === 2);
        if (sf1Unfinished.length > 0) issue('BUG', 'SEMIFINALI', 'Semifinale 2 generata prima che Semifinale 1 fosse giocata!');
    }

    // Insert SF1 scores (winner goes straight to the final, unchanged)
    for (const m of sf1Matches) {
        await adminReq(`/admin/matches/${m.id}/score`, {
            method: 'PUT',
            body: JSON.stringify({ score_team1: 6, score_team2: 4 })
        });
    }
    console.log(`  ✅ Inseriti ${sf1Matches.length} risultati Semifinale 1\n`);

    // 13. AVANZA → genera Semifinale 2 (perdente SF1 vs migliori del Lower Bracket)
    console.log('📌 13. Generazione Semifinale 2...');
    const advResult3 = await advanceRobust();
    if (advResult3._error) { issue('BUG', 'SEMIFINALI', `Impossibile generare Semifinale 2: ${advResult3.error}`); }

    const matchesAfterSF2Gen = await req('/tournament/matches');
    const sf2Matches = matchesAfterSF2Gen.filter(m => m.phase === 'semifinal' && m.match_order === 2);
    console.log(`  Semifinali 2: ${sf2Matches.length}`);
    if (sf2Matches.length === 0) issue('BUG', 'SEMIFINALI', 'Nessuna Semifinale 2 generata!');

    for (const m of sf2Matches) {
        await adminReq(`/admin/matches/${m.id}/score`, {
            method: 'PUT',
            body: JSON.stringify({ score_team1: 6, score_team2: 4 })
        });
    }
    console.log(`  ✅ Inseriti ${sf2Matches.length} risultati Semifinale 2\n`);

    // 14. AVANZA → genera finali
    console.log('📌 14. Generazione finali...');
    const advResult4 = await advanceRobust();
    if (advResult4._error) { issue('WARN', 'FINALI', `Avanzamento finali: ${advResult4.error || JSON.stringify(advResult4)}`); }

    const matchesFinal = await req('/tournament/matches');
    const finalMatches = matchesFinal.filter(m => m.phase === 'final');
    console.log(`  Finali: ${finalMatches.length}`);
    if (finalMatches.length === 0) issue('BUG', 'FINALI', 'Nessuna finale generata!');

    // Insert final scores
    for (const m of finalMatches) {
        await adminReq(`/admin/matches/${m.id}/score`, {
            method: 'PUT',
            body: JSON.stringify({ score_team1: 7, score_team2: 5 })
        });
    }

    // 15. AVANZA → COMPLETAMENTO
    console.log('\n📌 15. Completamento torneo...');
    const advResult5 = await advanceRobust();
    const stateEnd = await req('/tournament/state');
    console.log(`  Fase finale: ${stateEnd.phase}`);
    if (stateEnd.phase !== 'completed') issue('BUG', 'COMPLETAMENTO', `Torneo non completato: fase "${stateEnd.phase}"`);
    else console.log('  ✅ Torneo completato!\n');

    // 15. CHECK BRACKET
    console.log('📌 15. Verifica bracket API...');
    const bracket = await req('/tournament/bracket');
    if (!bracket) issue('BUG', 'BRACKET', 'Bracket API restituisce null');
    else {
        for (const type of ['ATP', 'WTA']) {
            if (!bracket[type]) { issue('BUG', 'BRACKET', `Manca sezione ${type}`); continue; }
            console.log(`  ${type}: semi=${bracket[type].semifinal?.length || 0}, final=${bracket[type].final?.length || 0}, lower=${bracket[type].lower?.length || 0}`);
            if ((bracket[type].semifinal?.length || 0) === 0) issue('WARN', 'BRACKET', `${type}: 0 semifinali nel bracket`);
            if ((bracket[type].final?.length || 0) === 0) issue('WARN', 'BRACKET', `${type}: 0 finali nel bracket`);
        }
    }

    // 16. FINAL STANDINGS
    console.log('\n📌 16. Classifica finale...');
    const finalStandings = await req('/tournament/standings');
    const maleStandings = finalStandings.filter(p => p.gender === 'M').sort((a, b) => b.points - a.points);
    const femaleStandings = finalStandings.filter(p => p.gender === 'F').sort((a, b) => b.points - a.points);
    
    console.log('  ATP Top 3:');
    maleStandings.slice(0, 3).forEach((p, i) => console.log(`    ${i+1}. ${p.name} - ${p.points}pt (V:${p.wins} P:${p.losses} D:${p.game_diff})`));
    console.log('  WTA Top 3:');
    femaleStandings.slice(0, 3).forEach((p, i) => console.log(`    ${i+1}. ${p.name} - ${p.points}pt (V:${p.wins} P:${p.losses} D:${p.game_diff})`));

    // 17. CHECK FRONTEND TEXTS / LABELS
    console.log('\n📌 17. Analisi label e testi...');
    // Check all match phase names
    const allFinalMatches = await req('/tournament/matches');
    for (const m of allFinalMatches) {
        if (!m.phase_name || m.phase_name === '') issue('WARN', 'LABEL', `Match ${m.id}: phase_name vuoto (phase="${m.phase}")`);
        if (m.team1_name?.includes('?')) issue('WARN', 'LABEL', `Match ${m.id}: team1 contiene "?" → "${m.team1_name}"`);
        if (m.team2_name?.includes('?')) issue('WARN', 'LABEL', `Match ${m.id}: team2 contiene "?" → "${m.team2_name}"`);
    }

    // 18. CHECK GROUPS AFTER COMPLETION
    console.log('\n📌 18. Verifica gironi dopo completamento...');
    const finalGroups = await req('/tournament/groups');
    for (const g of finalGroups) {
        if (!g.players || g.players.length === 0) {
            issue('WARN', 'GIRONI-FINAL', `Girone "${g.name}": nessun giocatore`);
        }
        // Check standings are calculated
        const hasPoints = g.players?.some(p => p.points > 0);
        if (g.bracket === 'upper' && !hasPoints) {
            issue('WARN', 'GIRONI-FINAL', `Girone upper "${g.name}": nessun giocatore ha punti`);
        }
    }

    // === REPORT ===
    console.log('\n\n========================================');
    console.log('📋 REPORT SIMULAZIONE');
    console.log('========================================\n');
    
    const bugs = issues.filter(i => i.severity === 'BUG');
    const warnings = issues.filter(i => i.severity === 'WARN');
    const infos = issues.filter(i => i.severity === 'INFO');
    
    if (issues.length === 0) {
        console.log('🎉 NESSUNA ANOMALIA RILEVATA!\n');
    } else {
        console.log(`Totale: ${bugs.length} BUG 🐛 | ${warnings.length} WARNING ⚠️ | ${infos.length} INFO ℹ️\n`);
        
        if (bugs.length > 0) {
            console.log('🐛 BUG:');
            bugs.forEach(b => console.log(`  - [${b.section}] ${b.msg}`));
            console.log('');
        }
        if (warnings.length > 0) {
            console.log('⚠️ WARNING:');
            warnings.forEach(w => console.log(`  - [${w.section}] ${w.msg}`));
            console.log('');
        }
    }
    
    console.log('========================================\n');
}

run().catch(err => console.error('FATAL:', err));
