// tournament.js

const tournamentApp = {
    currentGender: 'all', // all, M, F
    
    async init() {
        this.bindEvents();
        await this.loadData();
    },

    bindEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn:not(.admin-tab-btn)').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn:not(.admin-tab-btn)').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#view-tournament .tab-content').forEach(c => {
                    c.classList.add('hidden');
                    c.classList.remove('active');
                });
                
                e.target.classList.add('active');
                const targetId = `tab-${e.target.dataset.tab}`;
                const content = document.getElementById(targetId);
                
                if (content) {
                    content.classList.remove('hidden');
                    content.classList.add('active');
                    
                    // Render specific tab if needed
                    if (e.target.dataset.tab === 'bracket' && window.bracketApp) {
                        window.bracketApp.render();
                    }
                }
            });
            btn.dataset.bound = 'true';
        });

        // Gender filter
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentGender = e.target.dataset.gender;
                this.renderAll(); // Re-render with new filter
            });
            btn.dataset.bound = 'true';
        });
        
        // Match phase filter
        const matchFilter = document.getElementById('match-phase-filter');
        if (matchFilter && !matchFilter.dataset.bound) {
            matchFilter.addEventListener('change', () => this.renderMatches());
            matchFilter.dataset.bound = 'true';
        }
    },

    async loadData() {
        window.app.showLoader();
        try {
            const results = await Promise.allSettled([
                window.api.getTournamentState(),
                window.api.getGroups(),
                window.api.getMatches(),
                window.api.getBracket(),
                window.api.getStandings()
            ]);
            
            this.state = results[0].status === 'fulfilled' ? results[0].value : null;
            this.groups = results[1].status === 'fulfilled' ? (results[1].value || []) : [];
            this.matches = results[2].status === 'fulfilled' ? (results[2].value || []) : [];
            this.bracket = results[3].status === 'fulfilled' ? results[3].value : null;
            this.standings = results[4].status === 'fulfilled' ? (results[4].value || []) : [];
            
            this.renderAll();
            
            if (window.bracketApp) {
                window.bracketApp.setData(this.bracket, this.matches);
                const bracketTab = document.querySelector('.tab-btn[data-tab="bracket"]');
                if (bracketTab && bracketTab.classList.contains('active')) {
                    window.bracketApp.render();
                }
            }
            
        } catch (error) {
            console.error('Failed to load tournament data', error);
            window.app.toast('Errore nel caricamento dati torneo', 'error');
        } finally {
            window.app.hideLoader();
        }
    },

    renderAll() {
        this.renderGroups();
        this.renderMatches();
        this.renderStandings();
    },

    renderGroups() {
        const container = document.getElementById('gironi-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (!this.groups || this.groups.length === 0) {
            container.innerHTML = '<div class="text-center w-100 py-3 text-light">Nessun girone generato. In attesa dell\'organizzazione.</div>';
            return;
        }

        let filteredGroups = this.groups;
        if (this.currentGender !== 'all') {
            const genderType = this.currentGender === 'M' ? 'ATP' : 'WTA';
            filteredGroups = this.groups.filter(g => g.type === genderType || g.gender === this.currentGender);
        }

        if (filteredGroups.length === 0) {
            container.innerHTML = '<div class="text-center w-100 py-3 text-light">Nessun girone per il filtro selezionato.</div>';
            return;
        }

        filteredGroups.forEach(group => {
            const card = document.createElement('div');
            card.className = 'girone-card';
            
            const isATP = group.type === 'ATP';
            const bracketLabel = group.bracket === 'lower' ? ' (Lower)' : '';
            
            const header = document.createElement('div');
            header.className = `girone-header ${isATP ? 'text-accent' : 'text-secondary'}`;
            header.textContent = (group.name || `Girone ${isATP ? 'ATP' : 'WTA'}`) + bracketLabel;
            
            const table = document.createElement('table');
            table.className = 'girone-table';
            
            const players = group.players || [];
            
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Giocatore</th>
                        <th>Cat</th>
                        <th>Pt</th>
                        <th>GV</th>
                        <th>GP</th>
                        <th>D/G</th>
                    </tr>
                </thead>
                <tbody>
                    ${players.map((p, index) => {
                        // Top 2 qualify, bottom 2 go to lower
                        let rowClass = '';
                        if (players.length >= 4) {
                            if (index < 2) rowClass = 'girone-row-qualify';
                            else rowClass = 'girone-row-eliminate';
                        }
                        
                        const diff = p.diff || 0;
                        const diffStr = diff > 0 ? '+' + diff : diff;
                        
                        return `
                        <tr class="${rowClass}">
                            <td>
                                <span class="fw-500">${window.app.escapeHtml(p.name) || '?'}</span>
                            </td>
                            <td>
                                ${p.category ? `<span class="cat-badge cat-${p.category.toLowerCase()}">${p.category}</span>` : '-'}
                            </td>
                            <td class="fw-700">${p.points || 0}</td>
                            <td>${p.games_won || 0}</td>
                            <td>${p.games_lost || 0}</td>
                            <td>${diffStr}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            `;
            
            card.appendChild(header);
            card.appendChild(table);
            container.appendChild(card);
        });
    },

    renderMatches() {
        const container = document.getElementById('matches-container');
        const filterSelect = document.getElementById('match-phase-filter');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.matches || this.matches.length === 0) {
            container.innerHTML = '<div class="text-center py-3 text-light">Nessuna partita disponibile.</div>';
            return;
        }

        let filteredMatches = [...this.matches];
        
        // Phase filter
        if (filterSelect && filterSelect.value !== 'all') {
            if (filterSelect.value === 'group') {
                filteredMatches = filteredMatches.filter(m => m.phase === 'gironi' || m.phase === 'lower');
            } else if (filterSelect.value === 'elimination') {
                filteredMatches = filteredMatches.filter(m => m.phase === 'semifinal' || m.phase === 'final');
            }
        }
        
        // Gender filter
        if (this.currentGender !== 'all') {
            const genderType = this.currentGender === 'M' ? 'ATP' : 'WTA';
            filteredMatches = filteredMatches.filter(m => m.type === genderType || m.gender === this.currentGender);
        }

        if (filteredMatches.length === 0) {
            container.innerHTML = '<div class="text-center py-3 text-light">Nessuna partita per i filtri selezionati.</div>';
            return;
        }

        filteredMatches.forEach(match => {
            const card = document.createElement('div');
            card.className = 'match-card';
            
            // Team names
            const team1Names = match.team1_name || 'TBD';
            const team2Names = match.team2_name || 'TBD';
            
            // Status badge
            let statusBadge = '';
            if (match.completed || match.status === 'completed') {
                statusBadge = '<span class="match-status status-completed">Conclusa</span>';
            } else {
                statusBadge = '<span class="match-status status-upcoming">Da Giocare</span>';
            }

            const t1Score = match.score_team1 !== null && match.score_team1 !== undefined ? match.score_team1 : '-';
            const t2Score = match.score_team2 !== null && match.score_team2 !== undefined ? match.score_team2 : '-';
            
            const t1Class = match.score_team1 > match.score_team2 ? 'winner' : '';
            const t2Class = match.score_team2 > match.score_team1 ? 'winner' : '';
            
            // Points info
            let pointsInfo = '';
            if (match.completed && match.points_team1 !== null) {
                pointsInfo = `<div class="text-sm text-light" style="margin-top:4px">${match.points_team1}pt - ${match.points_team2}pt</div>`;
            }
            
            const typeLabel = match.type === 'ATP' ? '(ATP)' : '(WTA)';

            card.innerHTML = `
                <div class="match-info">
                    <div class="match-phase">${window.app.escapeHtml(match.phase_name || match.phase)} ${typeLabel}</div>
                    <div class="match-teams">
                        <div class="match-team" style="text-align:right">
                            <span class="match-team-name ${t1Class}">${window.app.escapeHtml(team1Names)}</span>
                        </div>
                        <div class="match-score-box">
                            <span class="match-score ${t1Class}">${t1Score}</span>
                            <span class="match-vs">-</span>
                            <span class="match-score ${t2Class}">${t2Score}</span>
                        </div>
                        <div class="match-team">
                            <span class="match-team-name ${t2Class}">${window.app.escapeHtml(team2Names)}</span>
                        </div>
                    </div>
                    ${pointsInfo}
                </div>
                <div>${statusBadge}</div>
            `;
            container.appendChild(card);
        });
    },

    renderStandings() {
        const container = document.getElementById('classifica-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.standings || this.standings.length === 0) {
            container.innerHTML = '<div class="text-center py-3 text-light">Classifica non ancora disponibile.</div>';
            return;
        }

        const renderTable = (players, title, colorClass) => {
            if (!players || players.length === 0) return '';
            
            return `
                <div class="card glass mb-2">
                    <h3 class="font-heading mb-1 ${colorClass}">${title}</h3>
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Giocatore</th>
                                    <th>Cat</th>
                                    <th>Pt</th>
                                    <th>G</th>
                                    <th>V</th>
                                    <th>P</th>
                                    <th>D/G</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${players.map((p, i) => `
                                    <tr>
                                        <td class="fw-600">${i + 1}</td>
                                        <td>
                                            <span class="fw-500">${window.app.escapeHtml(p.name)}</span>
                                        </td>
                                        <td>
                                            ${p.category ? `<span class="cat-badge cat-${p.category.toLowerCase()}">${p.category}</span>` : '-'}
                                        </td>
                                        <td class="fw-700 text-accent">${p.points || 0}</td>
                                        <td>${(p.wins || 0) + (p.losses || 0)}</td>
                                        <td class="text-success">${p.wins || 0}</td>
                                        <td class="text-danger">${p.losses || 0}</td>
                                        <td>${(p.game_diff || 0) > 0 ? '+' + p.game_diff : (p.game_diff || 0)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        };

        let html = '';
        if (this.currentGender === 'all' || this.currentGender === 'M') {
            const males = this.standings.filter(p => p.gender === 'M');
            html += renderTable(males, '🎾 Classifica ATP (Maschile)', 'text-accent');
        }
        if (this.currentGender === 'all' || this.currentGender === 'F') {
            const females = this.standings.filter(p => p.gender === 'F');
            html += renderTable(females, '🎀 Classifica WTA (Femminile)', 'text-secondary');
        }
        
        container.innerHTML = html || '<div class="text-center py-3 text-light">Nessun dato.</div>';
    }
};

window.tournamentApp = tournamentApp;
