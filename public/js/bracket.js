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

        if (!this.bracketData) {
            container.innerHTML = '<div class="text-center w-100 py-3 text-light">Dati bracket non disponibili.</div>';
            return;
        }

        const gender = window.tournamentApp ? window.tournamentApp.currentGender : 'all';
        const types = gender === 'M' ? ['ATP'] : gender === 'F' ? ['WTA'] : ['ATP', 'WTA'];

        const rounds = [
            { key: 'lower', label: 'Lower Bracket' },
            { key: 'semifinal', label: 'Semifinale' },
            { key: 'final', label: 'Finale' }
        ];

        let hasAny = false;

        types.forEach(type => {
            const typeData = this.bracketData[type];
            if (!typeData) return;

            rounds.forEach(({ key, label }) => {
                const matches = typeData[key] || [];
                if (matches.length === 0) return;
                hasAny = true;

                const roundDiv = document.createElement('div');
                roundDiv.className = 'bracket-round';

                const title = document.createElement('h4');
                title.className = 'text-center text-accent mb-1';
                title.textContent = `${label} ${type}`;
                roundDiv.appendChild(title);

                matches.forEach(match => {
                    const matchDiv = document.createElement('div');

                    const t1 = window.app.escapeHtml(match.team1_name || 'TBD');
                    const t2 = window.app.escapeHtml(match.team2_name || 'TBD');

                    const s1 = match.score_team1 !== null && match.score_team1 !== undefined ? match.score_team1 : '-';
                    const s2 = match.score_team2 !== null && match.score_team2 !== undefined ? match.score_team2 : '-';

                    const w1 = match.completed && match.score_team1 > match.score_team2;
                    const w2 = match.completed && match.score_team2 > match.score_team1;

                    matchDiv.className = `bracket-match ${match.completed ? 'completed' : ''}`;

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
        });

        if (!hasAny) {
            container.innerHTML = '<div class="text-center w-100 py-3 text-light">Nessuna partita a eliminazione diretta.</div>';
        }
    }
};

window.bracketApp = bracketApp;
