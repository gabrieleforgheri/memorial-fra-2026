// admin.js

const adminApp = {
    currentMatchId: null,
    
    async init() {
        this.bindEvents();
        await this.checkAuth();
    },

    bindEvents() {
        // Login form
        const loginForm = document.getElementById('admin-login-form');
        if (loginForm && !loginForm.dataset.bound) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const pwd = document.getElementById('admin-password').value;
                try {
                    window.app.showLoader();
                    await window.api.login(pwd);
                    window.app.toast('Accesso effettuato');
                    await this.checkAuth();
                } catch (error) {
                    window.app.toast('Password errata', 'error');
                } finally {
                    window.app.hideLoader();
                }
            });
            loginForm.dataset.bound = 'true';
        }

        // Logout
        const logoutBtn = document.getElementById('admin-logout-btn');
        if (logoutBtn && !logoutBtn.dataset.bound) {
            logoutBtn.addEventListener('click', () => {
                window.api.setToken(null);
                this.checkAuth();
                window.app.toast('Logout effettuato');
            });
            logoutBtn.dataset.bound = 'true';
        }

        // Admin Tabs
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.admin-tab-content').forEach(c => {
                    c.classList.add('hidden');
                    c.classList.remove('active');
                });
                
                e.target.classList.add('active');
                const targetId = `tab-${e.target.dataset.tab}`;
                const content = document.getElementById(targetId);
                
                if (content) {
                    content.classList.remove('hidden');
                    content.classList.add('active');
                }
            });
            btn.dataset.bound = 'true';
        });

        // Group Generation
        const btnGen = document.getElementById('btn-generate-groups');
        if (btnGen && !btnGen.dataset.bound) {
            btnGen.addEventListener('click', async () => {
                if(!confirm('Generare nuovi gironi? Verranno sovrascritti quelli attuali.')) return;
                try {
                    window.app.showLoader();
                    await window.api.generateGroups();
                    window.app.toast('Gironi generati con successo! 🎉');
                    await this.loadDashboardData();
                } catch (e) {
                    window.app.toast(e.message || 'Errore nella generazione gironi', 'error');
                } finally {
                    window.app.hideLoader();
                }
            });
            btnGen.dataset.bound = 'true';
        }

        // Tournament Controls
        const bindControl = (id, method, confirmMsg, successMsg) => {
            const btn = document.getElementById(id);
            if (btn && !btn.dataset.bound) {
                btn.addEventListener('click', async () => {
                    if(!confirm(confirmMsg)) return;
                    try {
                        window.app.showLoader();
                        await window.api[method]();
                        window.app.toast(successMsg);
                        await this.loadDashboardData();
                    } catch (e) {
                        window.app.toast(e.message || 'Errore', 'error');
                    } finally {
                        window.app.hideLoader();
                    }
                });
                btn.dataset.bound = 'true';
            }
        };

        bindControl('btn-start-tournament', 'startTournament', 'Avviare il torneo? Le iscrizioni verranno chiuse.', 'Torneo avviato! 🏆');
        bindControl('btn-advance-phase', 'advanceTournament', 'Avanzare alla fase successiva?', 'Fase avanzata con successo!');
        bindControl('btn-reset-tournament', 'resetTournament', '⚠️ ATTENZIONE: Resettare tutto il torneo? Tutti i risultati andranno persi! Questa azione è IRREVERSIBILE.', 'Torneo resettato');
        
        // Simulation and Dates
        bindControl('btn-reset-simulation', 'resetSimulation', 'Ripristinare la simulazione? Tutte le partite, gironi e giocatori finti (senza data votata) verranno eliminati.', 'Simulazione ripristinata');
        bindControl('btn-clear-dates', 'clearDates', 'Azzzerare tutti i voti delle date per TUTTI i giocatori?', 'Voti date azzerati');

        // Score Modal bindings
        const cancelScore = document.getElementById('btn-cancel-score');
        if (cancelScore && !cancelScore.dataset.bound) {
            cancelScore.addEventListener('click', () => {
                document.getElementById('score-modal').classList.add('hidden');
            });
            cancelScore.dataset.bound = 'true';
        }

        const saveScore = document.getElementById('btn-save-score');
        if (saveScore && !saveScore.dataset.bound) {
            saveScore.addEventListener('click', async () => {
                const s1 = parseInt(document.getElementById('modal-score1').value);
                const s2 = parseInt(document.getElementById('modal-score2').value);
                const matchId = this.currentMatchId;
                
                if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
                    window.app.toast('Inserisci punteggi validi', 'error');
                    return;
                }
                
                if (s1 === s2) {
                    window.app.toast('Il punteggio non può essere un pareggio', 'error');
                    return;
                }
                
                try {
                    window.app.showLoader();
                    await window.api.updateScore(matchId, s1, s2);
                    window.app.toast('Risultato salvato ✅');
                    document.getElementById('score-modal').classList.add('hidden');
                    await this.loadDashboardData();
                } catch (e) {
                    window.app.toast(e.message || 'Errore nel salvataggio', 'error');
                } finally {
                    window.app.hideLoader();
                }
            });
            saveScore.dataset.bound = 'true';
        }

        // Close modal on backdrop click
        const modal = document.getElementById('score-modal');
        if (modal && !modal.dataset.bound) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
            modal.dataset.bound = 'true';
        }

        // Live preview of points in modal
        ['modal-score1', 'modal-score2'].forEach(id => {
            const input = document.getElementById(id);
            if (input && !input.dataset.bound) {
                input.addEventListener('input', () => this.updatePointsPreview());
                input.dataset.bound = 'true';
            }
        });
    },

    updatePointsPreview() {
        const s1 = parseInt(document.getElementById('modal-score1').value) || 0;
        const s2 = parseInt(document.getElementById('modal-score2').value) || 0;
        const preview = document.getElementById('modal-points-preview');
        
        let p1 = 0, p2 = 0;
        const diff = Math.abs(s1 - s2);
        
        if (s1 > s2) {
            if (diff > 1) { p1 = 3; p2 = 0; }
            else { p1 = 2; p2 = 1; }
        } else if (s2 > s1) {
            if (diff > 1) { p1 = 0; p2 = 3; }
            else { p1 = 1; p2 = 2; }
        }
        
        let typeLabel = '';
        if (diff === 1 && (s1 !== s2)) typeLabel = ' (tie-break)';
        else if (diff > 1 && (s1 !== s2)) typeLabel = ' (vittoria netta)';
        
        preview.innerHTML = `
            <span class="${p1 > p2 ? 'text-success' : (p1 < p2 ? 'text-danger' : '')}">${p1} pt${typeLabel}</span>
            <span class="${p2 > p1 ? 'text-success' : (p2 < p1 ? 'text-danger' : '')}">${p2} pt${typeLabel}</span>
        `;
    },

    async checkAuth() {
        const isAuth = await window.api.verifyAuth();
        const loginView = document.getElementById('admin-login-view');
        const dashView = document.getElementById('admin-dashboard-view');
        
        if (isAuth) {
            loginView.classList.add('hidden');
            dashView.classList.remove('hidden');
            await this.loadDashboardData();
        } else {
            loginView.classList.remove('hidden');
            dashView.classList.add('hidden');
        }
    },

    async loadDashboardData() {
        window.app.showLoader();
        try {
            const [players, state, matches, groups] = await Promise.all([
                window.api.getPlayers(),
                window.api.getTournamentState(),
                window.api.getMatches(),
                window.api.getGroups()
            ]);
            
            this.players = players || [];
            this.state = state || {};
            this.matches = matches || [];
            this.groups = groups || [];

            this.renderPlayersTable();
            this.renderState();
            this.renderMatches();
            this.renderGroups();
            
        } catch (e) {
            console.error('Error loading admin dash', e);
            window.app.toast('Errore nel caricamento', 'error');
        } finally {
            window.app.hideLoader();
        }
    },

    renderState() {
        const statusBadge = document.getElementById('admin-tournament-status');
        const phaseMap = {
            'registration': '📝 Iscrizioni Aperte',
            'groups_ready': '📋 Gironi Pronti',
            'gironi': '⚽ Fase a Gironi',
            'lower_bracket': '🔄 Lower Bracket',
            'elimination': '🏆 Eliminazione Diretta',
            'completed': '✅ Torneo Completato'
        };
        statusBadge.textContent = phaseMap[this.state.phase] || this.state.phase;
        
        // Stepper
        const phasesOrder = ['registration', 'groups_ready', 'gironi', 'lower_bracket', 'elimination', 'completed'];
        const currentIndex = phasesOrder.indexOf(this.state.phase);
        
        // Map stepper steps to our phases
        const stepMapping = {
            'registration': ['registration', 'groups_ready'],
            'groups': ['gironi', 'lower_bracket'],
            'elimination': ['elimination'],
            'completed': ['completed']
        };
        
        document.querySelectorAll('.tournament-stepper .step').forEach(step => {
            step.classList.remove('active', 'completed');
            const phase = step.dataset.phase;
            
            const stepPhases = stepMapping[phase] || [];
            
            if (stepPhases.includes(this.state.phase)) {
                step.classList.add('active');
            } else {
                // Check if current phase is after this step's phases
                const maxStepIndex = Math.max(...stepPhases.map(p => phasesOrder.indexOf(p)));
                if (currentIndex > maxStepIndex) {
                    step.classList.add('completed');
                }
            }
        });
        
        // Enable/disable buttons based on phase
        const btnStart = document.getElementById('btn-start-tournament');
        const btnAdvance = document.getElementById('btn-advance-phase');
        
        if (btnStart) {
            btnStart.disabled = this.state.phase !== 'groups_ready';
            btnStart.style.opacity = this.state.phase === 'groups_ready' ? '1' : '0.5';
        }
        if (btnAdvance) {
            const canAdvance = ['gironi', 'lower_bracket', 'elimination'].includes(this.state.phase);
            btnAdvance.disabled = !canAdvance;
            btnAdvance.style.opacity = canAdvance ? '1' : '0.5';
        }
    },

    renderPlayersTable() {
        const tbody = document.querySelector('#admin-players-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        // Stats
        const mPlayers = this.players.filter(p => p.gender === 'M');
        const fPlayers = this.players.filter(p => p.gender === 'F');
        
        const countCat = (list, cat) => list.filter(p => p.category === cat).length;
        const countUnassigned = (list) => list.filter(p => !p.category).length;
        
        const statsHtml = `
            <div style="font-size:0.85rem; display:flex; gap:1rem; flex-wrap:wrap;">
                <span class="text-accent">ATP: ${mPlayers.length} (${countCat(mPlayers, 'F')}F, ${countCat(mPlayers, 'N')}N, ${countUnassigned(mPlayers)}?)</span>
                <span class="text-secondary">WTA: ${fPlayers.length} (${countCat(fPlayers, 'F')}F, ${countCat(fPlayers, 'N')}N, ${countUnassigned(fPlayers)}?)</span>
            </div>
        `;
        document.getElementById('admin-players-stats').innerHTML = statsHtml;

        // Sort: unassigned first, then by gender, then by name
        const sorted = [...this.players].sort((a, b) => {
            if (!a.category && b.category) return -1;
            if (a.category && !b.category) return 1;
            if (a.gender !== b.gender) return a.gender === 'M' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        const formatDates = (dates) => {
            if (!dates || dates.length === 0) return '<span class="text-light">-</span>';
            return dates.map(d => {
                const dt = new Date(d + 'T12:00:00');
                return `${dt.getDate()} ${monthNames[dt.getMonth()]}`;
            }).join(', ');
        };

        sorted.forEach(p => {
            const tr = document.createElement('tr');
            const genderLabel = p.gender === 'M' ? '<span class="text-accent">ATP</span>' : '<span class="text-secondary">WTA</span>';

            tr.innerHTML = `
                <td>
                    <input type="text" class="form-input bg-dark-soft p-edit-name" value="${window.app.escapeHtml(p.name)}" data-id="${p.id}" style="padding:0.4rem; max-width:200px;">
                </td>
                <td>${genderLabel}</td>
                <td style="font-size:0.85rem; max-width:220px;">${formatDates(p.preferred_dates)}</td>
                <td>
                    <select class="form-input bg-dark-soft p-edit-cat" data-id="${p.id}" style="padding:0.4rem; min-width:120px;">
                        <option value="" ${!p.category ? 'selected' : ''}>— Non assegnato</option>
                        <option value="F" ${p.category === 'F' ? 'selected' : ''}>🔥 Forte (F)</option>
                        <option value="N" ${p.category === 'N' ? 'selected' : ''}>🌱 Normale (N)</option>
                    </select>
                </td>
                <td>
                    <button class="btn btn-danger btn-delete-p" data-id="${p.id}" style="padding:0.4rem 0.8rem; font-size:0.85rem;">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Bindings for table elements
        tbody.querySelectorAll('.p-edit-cat').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                try {
                    await window.api.updatePlayerCategory(e.target.dataset.id, e.target.value || null);
                    window.app.toast('Categoria aggiornata');
                    // Refresh stats
                    const players = await window.api.getPlayers();
                    this.players = players;
                    this.renderPlayersTable();
                } catch(err) { window.app.toast('Errore aggiornamento categoria', 'error'); }
            });
        });

        tbody.querySelectorAll('.p-edit-name').forEach(inp => {
            inp.addEventListener('change', async (e) => {
                if (!e.target.value.trim()) {
                    window.app.toast('Il nome non può essere vuoto', 'error');
                    return;
                }
                try {
                    await window.api.updatePlayerName(e.target.dataset.id, e.target.value);
                    window.app.toast('Nome aggiornato');
                } catch(err) { window.app.toast('Errore aggiornamento nome', 'error'); }
            });
        });

        tbody.querySelectorAll('.btn-delete-p').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const playerId = e.currentTarget.dataset.id;
                if(!confirm('Eliminare questo giocatore?')) return;
                try {
                    await window.api.deletePlayer(playerId);
                    window.app.toast('Giocatore eliminato');
                    await this.loadDashboardData();
                } catch(err) { window.app.toast(err.message || 'Errore eliminazione', 'error'); }
            });
        });
    },

    renderGroups() {
        const container = document.getElementById('admin-groups-preview');
        if (!container) return;
        
        container.innerHTML = '';
        if (!this.groups || this.groups.length === 0) {
            container.innerHTML = '<p class="text-light text-center w-100">Nessun girone generato. Usa il pulsante sopra per generarli.</p>';
            return;
        }

        this.groups.forEach(group => {
            const card = document.createElement('div');
            card.className = 'girone-card';
            
            const isATP = group.type === 'ATP';
            
            const header = document.createElement('div');
            header.className = `girone-header ${isATP ? 'text-accent' : 'text-secondary'}`;
            header.textContent = group.name;
            
            const table = document.createElement('table');
            table.className = 'girone-table';
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Giocatore</th>
                        <th>Cat</th>
                        <th>Pt</th>
                        <th>D/G</th>
                    </tr>
                </thead>
                <tbody>
                    ${(group.players || []).map(p => `
                        <tr>
                            <td><span class="fw-500">${window.app.escapeHtml(p.name)}</span></td>
                            <td>${p.category ? `<span class="cat-badge cat-${p.category.toLowerCase()}">${p.category}</span>` : '-'}</td>
                            <td class="fw-700">${p.points || 0}</td>
                            <td>${(p.diff || 0) > 0 ? '+' + p.diff : (p.diff || 0)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            
            card.appendChild(header);
            card.appendChild(table);
            container.appendChild(card);
        });
    },

    renderMatches() {
        const container = document.getElementById('admin-matches-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.matches || this.matches.length === 0) {
            container.innerHTML = '<p class="text-light text-center">Nessuna partita disponibile. Genera i gironi e avvia il torneo.</p>';
            return;
        }

        this.matches.forEach(match => {
            const card = document.createElement('div');
            card.className = 'match-card';
            card.style.cursor = 'pointer';
            
            const team1Names = match.team1_name || 'TBD';
            const team2Names = match.team2_name || 'TBD';

            const t1Score = match.score_team1 !== null && match.score_team1 !== undefined ? match.score_team1 : '-';
            const t2Score = match.score_team2 !== null && match.score_team2 !== undefined ? match.score_team2 : '-';

            const isCompleted = match.completed || match.status === 'completed';
            const typeLabel = match.type === 'ATP' ? '(ATP)' : '(WTA)';

            let statusDot = isCompleted
                ? '<span class="match-status status-completed">✅</span>'
                : '<span class="match-status status-upcoming">⏳</span>';

            card.innerHTML = `
                <div class="match-info" style="flex:1">
                    <div class="match-phase">${window.app.escapeHtml(match.phase_name || match.phase)} ${typeLabel}</div>
                    <div class="match-teams">
                        <div class="match-team" style="text-align:right; flex:1">
                            <span class="match-team-name">${window.app.escapeHtml(team1Names)}</span>
                        </div>
                        <div class="match-score-box" style="min-width:80px; justify-content:center">
                            <span class="match-score text-accent">${t1Score}</span>
                            <span class="match-vs">-</span>
                            <span class="match-score text-accent">${t2Score}</span>
                        </div>
                        <div class="match-team" style="flex:1">
                            <span class="match-team-name">${window.app.escapeHtml(team2Names)}</span>
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem">
                    ${statusDot}
                    <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.85rem">📝</button>
                </div>
            `;

            card.addEventListener('click', () => {
                this.openScoreModal(match, team1Names, team2Names);
            });

            container.appendChild(card);
        });
    },

    openScoreModal(match, t1, t2) {
        this.currentMatchId = match.id;
        document.getElementById('modal-team1-name').textContent = t1;
        document.getElementById('modal-team2-name').textContent = t2;
        
        document.getElementById('modal-score1').value = match.score_team1 !== null && match.score_team1 !== undefined ? match.score_team1 : 0;
        document.getElementById('modal-score2').value = match.score_team2 !== null && match.score_team2 !== undefined ? match.score_team2 : 0;
        
        this.updatePointsPreview();
        
        const modal = document.getElementById('score-modal');
        modal.classList.remove('hidden');
    }
};

window.adminApp = adminApp;
