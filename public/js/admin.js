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
            const [players, state, matches, groups, datesStats] = await Promise.all([
                window.api.getPlayers(),
                window.api.getTournamentState(),
                window.api.getMatches(),
                window.api.getGroups(),
                window.api.getDatesStats()
            ]);

            this.players = players || [];
            this.state = state || {};
            this.matches = matches || [];
            this.groups = groups || [];
            this.datesStats = datesStats || [];

            this.renderPendingTable();
            this.renderPlayersTable();
            this.renderState();
            this.renderMatches();
            this.renderGroups();
            this.renderStats();

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

    renderPendingTable() {
        const tbody = document.querySelector('#admin-pending-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const pending = (this.players || []).filter(p => !p.accepted);

        const statsEl = document.getElementById('admin-pending-stats');
        if (statsEl) {
            statsEl.innerHTML = `<span class="text-accent">${pending.length} in attesa</span>`;
        }

        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-light p-2">Nessun iscritto in attesa</td></tr>';
            return;
        }

        pending.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        pending.forEach(p => {
            const tr = document.createElement('tr');
            const genderLabel = p.gender === 'M' ? '<span class="text-accent">ATP</span>' : '<span class="text-secondary">WTA</span>';
            const createdAt = p.created_at ? new Date(p.created_at.replace(' ', 'T')).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

            tr.innerHTML = `
                <td><span class="fw-500">${window.app.escapeHtml(p.name)}</span></td>
                <td>${genderLabel}</td>
                <td class="text-light" style="font-size:0.85rem;">${createdAt}</td>
                <td style="display:flex; gap:0.5rem;">
                    <button class="btn btn-primary btn-accept-p" data-id="${p.id}" style="padding:0.4rem 0.8rem; font-size:0.85rem;">✓ Accetta</button>
                    <button class="btn btn-danger btn-delete-p" data-id="${p.id}" style="padding:0.4rem 0.8rem; font-size:0.85rem;">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-accept-p').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const playerId = e.currentTarget.dataset.id;
                try {
                    await window.api.acceptPlayer(playerId);
                    window.app.toast('Iscrizione accettata ✅');
                    await this.loadDashboardData();
                } catch (err) { window.app.toast(err.message || 'Errore accettazione', 'error'); }
            });
        });

        tbody.querySelectorAll('.btn-delete-p').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const playerId = e.currentTarget.dataset.id;
                if (!confirm('Rifiutare ed eliminare questa iscrizione?')) return;
                try {
                    await window.api.deletePlayer(playerId);
                    window.app.toast('Iscrizione eliminata');
                    await this.loadDashboardData();
                } catch (err) { window.app.toast(err.message || 'Errore eliminazione', 'error'); }
            });
        });
    },

    renderPlayersTable() {
        const tbody = document.querySelector('#admin-players-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const accepted = (this.players || []).filter(p => p.accepted);

        // Stats
        const mPlayers = accepted.filter(p => p.gender === 'M');
        const fPlayers = accepted.filter(p => p.gender === 'F');
        
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
        const sorted = [...accepted].sort((a, b) => {
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

    renderStats() {
        const chartContainer = document.getElementById('admin-stats-chart');
        const summaryLine = document.getElementById('stats-summary-line');
        if (!chartContainer) return;

        const TOURNAMENT_DATE_MIN = '2026-07-25';
        const TOURNAMENT_DATE_MAX = '2026-08-15';
        const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

        const countByDate = {};
        (this.datesStats || []).forEach(d => { countByDate[d.date] = d.count; });

        const dates = [];
        let cur = new Date(TOURNAMENT_DATE_MIN + 'T12:00:00');
        const end = new Date(TOURNAMENT_DATE_MAX + 'T12:00:00');
        while (cur <= end) {
            dates.push(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }

        const totalPlayers = (this.players || []).length;

        if (totalPlayers === 0) {
            chartContainer.innerHTML = '<p class="text-center text-light py-2">Nessun iscritto ancora: il grafico apparirà alle prime iscrizioni.</p>';
            if (summaryLine) summaryLine.textContent = '';
            const detail = document.getElementById('admin-stats-detail');
            if (detail) detail.innerHTML = '';
            return;
        }

        const counts = dates.map(d => countByDate[d] || 0);
        const maxCount = Math.max(1, ...counts);
        const peakIndex = counts.indexOf(maxCount);
        const peakDate = dates[peakIndex];

        if (summaryLine) {
            const dt = new Date(peakDate + 'T12:00:00');
            summaryLine.textContent = `Picco: ${dt.getDate()} ${monthNames[dt.getMonth()]} (${maxCount}/${totalPlayers} iscritti)`;
        }

        // Layout
        const barSlot = 24;
        const barWidth = 16;
        const chartHeight = 140;
        const axisHeight = 34;
        const width = dates.length * barSlot;
        const svgHeight = chartHeight + axisHeight;
        const niceMax = Math.max(5, Math.ceil(maxCount / 5) * 5);

        const gridLines = [0, 0.5, 1].map(f => {
            const y = chartHeight - f * chartHeight;
            const val = Math.round(f * niceMax);
            return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" class="stats-gridline" />
                    <text x="-6" y="${y + 3}" text-anchor="end" class="stats-axis-label">${val}</text>`;
        }).join('');

        const bars = dates.map((date, i) => {
            const count = countByDate[date] || 0;
            const h = niceMax > 0 ? (count / niceMax) * chartHeight : 0;
            const x = i * barSlot + (barSlot - barWidth) / 2;
            const y = chartHeight - h;
            const r = Math.min(4, h);
            const dt = new Date(date + 'T12:00:00');
            const isFirstOfMonth = dt.getDate() === 1 || i === 0;
            const dayLabel = dt.getDate();

            let path;
            if (h <= 0) {
                path = '';
            } else {
                path = `M ${x},${chartHeight} L ${x},${y + r} Q ${x},${y} ${x + r},${y}
                        L ${x + barWidth - r},${y} Q ${x + barWidth},${y} ${x + barWidth},${y + r}
                        L ${x + barWidth},${chartHeight} Z`;
            }

            const peakLabel = i === peakIndex
                ? `<text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" class="stats-peak-label">${count}</text>`
                : '';

            const monthLabel = isFirstOfMonth
                ? `<text x="${x + barWidth / 2}" y="${chartHeight + axisHeight - 4}" text-anchor="middle" class="stats-month-label">${monthNames[dt.getMonth()]}</text>`
                : '';

            return `
                <g class="stats-bar-group" data-date="${date}" tabindex="0" role="button" aria-label="${dayLabel} ${monthNames[dt.getMonth()]}, ${count} disponibili">
                    <rect x="${x - 2}" y="0" width="${barWidth + 4}" height="${chartHeight}" fill="transparent" class="stats-bar-hit" />
                    ${h > 0 ? `<path d="${path}" class="stats-bar" />` : `<rect x="${x}" y="${chartHeight - 2}" width="${barWidth}" height="2" class="stats-bar-zero" />`}
                    ${peakLabel}
                    <text x="${x + barWidth / 2}" y="${chartHeight + 14}" text-anchor="middle" class="stats-day-label">${dayLabel}</text>
                    ${monthLabel}
                    <title>${dayLabel} ${monthNames[dt.getMonth()]}: ${count} disponibil${count === 1 ? 'e' : 'i'} su ${totalPlayers}</title>
                </g>`;
        }).join('');

        chartContainer.innerHTML = `
            <svg viewBox="-28 -14 ${width + 32} ${svgHeight + 14}" width="${Math.max(width + 40, 500)}" height="${svgHeight + 14}" class="stats-svg">
                ${gridLines}
                ${bars}
            </svg>
        `;

        chartContainer.querySelectorAll('.stats-bar-group').forEach(g => {
            g.addEventListener('click', () => this.renderStatsDetail(g.dataset.date));
            g.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.renderStatsDetail(g.dataset.date); }
            });
        });

        // Keep the previously selected day highlighted/shown across re-renders, default to the peak day
        this.renderStatsDetail(this.selectedStatsDate && dates.includes(this.selectedStatsDate) ? this.selectedStatsDate : peakDate);
    },

    renderStatsDetail(date) {
        this.selectedStatsDate = date;

        document.querySelectorAll('.stats-bar-group').forEach(g => {
            g.classList.toggle('selected', g.dataset.date === date);
        });

        const container = document.getElementById('admin-stats-detail');
        if (!container || !date) return;

        const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        const dt = new Date(date + 'T12:00:00');
        const label = `${dt.getDate()} ${monthNames[dt.getMonth()]}`;

        const available = (this.players || []).filter(p => (p.preferred_dates || []).includes(date));
        const unavailable = (this.players || []).filter(p => !(p.preferred_dates || []).includes(date));

        const renderPlayerRow = (p) => {
            const icon = p.gender === 'M' ? '🎾' : '🏓';
            const catBadge = p.category ? `<span class="cat-badge cat-${p.category.toLowerCase()}">${p.category}</span>` : '';
            return `<li class="player-item"><div class="d-flex align-center gap-1"><span>${icon}</span><span class="fw-500">${window.app.escapeHtml(p.name)}</span></div>${catBadge}</li>`;
        };

        container.innerHTML = `
            <h3 class="font-heading mb-1">${label} <span class="text-light" style="font-weight:400; font-size:0.9rem;">— ${available.length} disponibili, ${unavailable.length} no</span></h3>
            <div class="stats-detail-columns">
                <div>
                    <h4 class="text-success mb-1 text-sm">✓ Disponibili (${available.length})</h4>
                    <ul class="players-list custom-scrollbar">
                        ${available.length ? available.map(renderPlayerRow).join('') : '<li class="text-light p-1 text-center">Nessuno</li>'}
                    </ul>
                </div>
                <div>
                    <h4 class="text-danger mb-1 text-sm">✕ Non disponibili (${unavailable.length})</h4>
                    <ul class="players-list custom-scrollbar">
                        ${unavailable.length ? unavailable.map(renderPlayerRow).join('') : '<li class="text-light p-1 text-center">Nessuno</li>'}
                    </ul>
                </div>
            </div>
        `;
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
