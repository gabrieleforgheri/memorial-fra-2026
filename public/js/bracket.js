// bracket.js

const bracketApp = {
    bracketData: null,
    matchesData: null,

    setData(bracket, matches) {
        this.bracketData = bracket;
        this.matchesData = matches;
    },

    render() {
        const container = document.getElementById('bracket-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.bracketData || !this.matchesData) {
            container.innerHTML = '<div class="text-center w-100 py-3 text-light">Dati bracket non disponibili.</div>';
            return;
        }

        // We assume bracketData might have Upper/Lower or just rounds
        // Let's render a basic structure
        
        const gender = window.tournamentApp ? window.tournamentApp.currentGender : 'all';
        
        // Filter matches for the bracket (phase: elimination)
        let elimMatches = this.matchesData.filter(m => m.phase === 'elimination');
        if (gender !== 'all') {
            elimMatches = elimMatches.filter(m => m.gender === gender);
        }

        if (elimMatches.length === 0) {
            container.innerHTML = '<div class="text-center w-100 py-3 text-light">Nessuna partita a eliminazione diretta.</div>';
            return;
        }

        // Group matches by round (semifinal, final, etc.) based on phase_name
        // e.g. "Semifinale Upper", "Finale Lower"
        const rounds = {};
        elimMatches.forEach(m => {
            const rn = m.phase_name || 'Altro';
            if (!rounds[rn]) rounds[rn] = [];
            rounds[rn].push(m);
        });

        // Basic vertical layout of rounds
        Object.keys(rounds).forEach(roundName => {
            const roundDiv = document.createElement('div');
            roundDiv.className = 'bracket-round';
            
            const title = document.createElement('h4');
            title.className = 'text-center text-accent mb-1';
            title.textContent = roundName;
            roundDiv.appendChild(title);

            rounds[roundName].forEach(match => {
                const matchDiv = document.createElement('div');
                
                const t1 = match.team1_players ? match.team1_players.map(p=>p.name).join(' / ') : match.team1_name || 'TBD';
                const t2 = match.team2_players ? match.team2_players.map(p=>p.name).join(' / ') : match.team2_name || 'TBD';
                
                const s1 = match.score_team1 !== null ? match.score_team1 : '-';
                const s2 = match.score_team2 !== null ? match.score_team2 : '-';
                
                const w1 = match.score_team1 > match.score_team2;
                const w2 = match.score_team2 > match.score_team1;

                matchDiv.className = `bracket-match ${(w1||w2) ? 'completed' : ''}`;
                
                matchDiv.innerHTML = `
                    <div class="bracket-team ${w1 ? 'winner text-accent fw-700' : ''}">
                        <span>${t1}</span>
                        <span>${s1}</span>
                    </div>
                    <div class="bracket-team ${w2 ? 'winner text-accent fw-700' : ''}" style="border-top:1px solid rgba(255,255,255,0.1); margin-top:5px; padding-top:5px;">
                        <span>${t2}</span>
                        <span>${s2}</span>
                    </div>
                `;
                
                roundDiv.appendChild(matchDiv);
            });
            
            container.appendChild(roundDiv);
        });
        
        // In a real sophisticated bracket, we'd draw SVG lines between elements.
        // For this premium UI, the horizontal layout with distinct rounds gives a clean look.
    }
};

window.bracketApp = bracketApp;
