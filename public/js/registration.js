// registration.js

const registrationApp = {
    async init() {
        this.bindEvents();
        await this.loadPlayers();
    },

    bindEvents() {
        const form = document.getElementById('register-form');
        // Prevent multiple bindings if init is called multiple times
        if (form && !form.dataset.bound) {
            form.addEventListener('submit', this.handleRegister.bind(this));
            form.dataset.bound = 'true';
        }
    },

    async handleRegister(e) {
        e.preventDefault();
        const nameInput = document.getElementById('player-name');
        const genderInput = document.querySelector('input[name="gender"]:checked');
        
        if (!nameInput.value.trim() || !genderInput) {
            window.app.toast('Compila tutti i campi', 'error');
            return;
        }

        try {
            window.app.showLoader();
            await window.api.registerPlayer(nameInput.value.trim(), genderInput.value);
            window.app.toast('Iscrizione completata con successo!');
            nameInput.value = ''; // reset
            await this.loadPlayers();
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
            
            let icon = p.gender === 'M' ? '🎾' : '🎀';
            let catBadge = '';
            if (p.category) {
                catBadge = `<span class="cat-badge cat-${p.category.toLowerCase()}">${p.category}</span>`;
            }

            li.innerHTML = `
                <div class="d-flex align-center gap-1">
                    <span>${icon}</span>
                    <span class="fw-500">${p.name}</span>
                </div>
                ${catBadge}
            `;
            container.appendChild(li);
        });
    }
};

window.registrationApp = registrationApp;
