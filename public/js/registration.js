// registration.js

const registrationApp = {
    currentStep: 1,

    async init() {
        this.bindEvents();
        await this.loadPlayers();
        this.goToStep(1);
    },

    bindEvents() {
        const form = document.getElementById('register-form');
        if (form && !form.dataset.bound) {
            form.addEventListener('submit', this.handleRegister.bind(this));
            form.dataset.bound = 'true';
        }

        document.querySelectorAll('.reg-next-btn').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.addEventListener('click', () => this.tryAdvance(parseInt(btn.dataset.next)));
            btn.dataset.bound = 'true';
        });

        document.querySelectorAll('.reg-back-btn').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.addEventListener('click', () => this.goToStep(parseInt(btn.dataset.back)));
            btn.dataset.bound = 'true';
        });
    },

    tryAdvance(targetStep) {
        if (this.currentStep === 1) {
            const nameInput = document.getElementById('player-name');
            if (!nameInput.value.trim()) {
                window.app.toast('Inserisci nome e cognome', 'error');
                return;
            }
        }

        if (targetStep === 2) this.renderSummary();
        this.goToStep(targetStep);
    },

    goToStep(step) {
        this.currentStep = step;

        document.querySelectorAll('.reg-step-panel').forEach(panel => {
            panel.classList.toggle('hidden', parseInt(panel.dataset.stepPanel) !== step);
            panel.classList.toggle('active', parseInt(panel.dataset.stepPanel) === step);
        });

        document.querySelectorAll('.reg-step').forEach(stepEl => {
            const n = parseInt(stepEl.dataset.step);
            stepEl.classList.toggle('active', n === step);
            stepEl.classList.toggle('done', n < step);
        });
    },

    renderSummary() {
        const name = document.getElementById('player-name').value.trim();
        const gender = document.querySelector('input[name="gender"]:checked')?.value;

        document.getElementById('summary-name').textContent = name;
        document.getElementById('summary-gender').textContent = gender === 'M' ? 'Uomo (ATP)' : 'Donna (WTA)';
    },

    async handleRegister(e) {
        e.preventDefault();
        const nameInput = document.getElementById('player-name');
        const genderInput = document.querySelector('input[name="gender"]:checked');

        if (!nameInput.value.trim() || !genderInput) {
            window.app.toast('Compila tutti i campi', 'error');
            this.goToStep(1);
            return;
        }

        try {
            window.app.showLoader();
            await window.api.registerPlayer(nameInput.value.trim(), genderInput.value);
            window.app.toast('Iscrizione completata con successo!');

            nameInput.value = '';
            await this.loadPlayers();
            this.goToStep(1);
        } catch (error) {
            window.app.toast(error.message || 'Errore durante l\'iscrizione', 'error');
        } finally {
            window.app.hideLoader();
        }
    },

    async loadPlayers() {
        try {
            const players = await window.api.getPlayers();
            if (!players) return;

            const males = players.filter(p => p.gender === 'M');
            const females = players.filter(p => p.gender === 'F');

            this.renderList('players-list-m', males);
            this.renderList('players-list-f', females);

            document.getElementById('count-m').textContent = males.length;
            document.getElementById('count-f').textContent = females.length;
            document.getElementById('total-registered').textContent = players.length;

        } catch (error) {
            console.error('Failed to load players', error);
        }
    },

    renderList(containerId, players) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (players.length === 0) {
            container.innerHTML = '<li class="text-light p-1 text-center">Nessun iscritto</li>';
            return;
        }

        players.forEach(p => {
            const li = document.createElement('li');
            li.className = 'player-item';

            let icon = p.gender === 'M' ? '🎾' : '🏓';
            let catBadge = '';
            if (p.category) {
                catBadge = `<span class="cat-badge cat-${p.category.toLowerCase()}">${p.category}</span>`;
            }

            li.innerHTML = `
                <div class="d-flex align-center gap-1">
                    <span>${icon}</span>
                    <span class="fw-500">${window.app.escapeHtml(p.name)}</span>
                </div>
                ${catBadge}
            `;
            container.appendChild(li);
        });
    }
};

window.registrationApp = registrationApp;
