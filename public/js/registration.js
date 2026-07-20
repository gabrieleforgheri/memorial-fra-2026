// registration.js

const registrationApp = {
    async init() {
        this.bindEvents();
        await this.loadPlayers();
        await this.loadCalendar();
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
        const dateInput = document.getElementById('preferred-date');
        
        if (!nameInput.value.trim() || !genderInput) {
            window.app.toast('Compila tutti i campi', 'error');
            return;
        }
        
        if (!dateInput.value) {
            window.app.toast('Devi selezionare una data dal calendario', 'error');
            return;
        }

        try {
            window.app.showLoader();
            await window.api.registerPlayer(nameInput.value.trim(), genderInput.value, dateInput.value);
            window.app.toast('Iscrizione completata con successo!');
            nameInput.value = ''; // reset
            dateInput.value = ''; // reset
            document.getElementById('selected-date-display').classList.add('hidden');
            
            // clear selected calendar day
            document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
            
            await this.loadPlayers();
            await this.loadCalendar();
        } catch (error) {
            window.app.toast(error.message || 'Errore durante l\'iscrizione', 'error');
        } finally {
            window.app.hideLoader();
        }
    },

    async loadCalendar() {
        const container = document.getElementById('date-calendar');
        if (!container) return;
        
        container.innerHTML = '<div class="text-light">Caricamento calendario...</div>';
        
        try {
            const stats = await window.api.getDatesStats();
            const dateMap = {};
            let maxVotes = 0;
            stats.forEach(s => {
                dateMap[s.date] = s.count;
                if (s.count > maxVotes) maxVotes = s.count;
            });
            
            // Generate dates from Jul 25 to Aug 25
            const startDate = new Date('2026-07-25');
            const endDate = new Date('2026-08-25');
            
            container.innerHTML = '';
            
            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayNum = currentDate.getDate();
                const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
                const monthName = monthNames[currentDate.getMonth()];
                
                const votes = dateMap[dateStr] || 0;
                
                // Calculate color intensity based on votes
                let bgStyle = '';
                if (votes > 0 && maxVotes > 0) {
                    const intensity = Math.max(0.2, votes / maxVotes); // At least 0.2 opacity if it has votes
                    bgStyle = `style="background-color: rgba(255, 71, 87, ${intensity}); border-color: rgba(255, 71, 87, ${intensity + 0.2});"`;
                }
                
                const dayEl = document.createElement('div');
                dayEl.className = 'calendar-day';
                if (bgStyle) dayEl.setAttribute('style', `background-color: rgba(255, 71, 87, ${Math.max(0.2, votes/maxVotes)}); border-color: rgba(255, 71, 87, 0.8);`);
                
                dayEl.innerHTML = `
                    <span class="day-num">${dayNum}</span>
                    <span class="month-name">${monthName}</span>
                    <span class="vote-count">${votes} <small>voti</small></span>
                `;
                
                dayEl.dataset.date = dateStr;
                dayEl.addEventListener('click', () => {
                    document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
                    dayEl.classList.add('selected');
                    
                    const dateInput = document.getElementById('preferred-date');
                    dateInput.value = dateStr;
                    
                    const display = document.getElementById('selected-date-display');
                    display.classList.remove('hidden');
                    document.getElementById('selected-date-text').textContent = `${dayNum} ${monthName}`;
                });
                
                container.appendChild(dayEl);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } catch (error) {
            container.innerHTML = '<div class="text-danger">Errore caricamento calendario</div>';
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
