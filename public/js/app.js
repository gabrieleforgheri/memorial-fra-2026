// app.js - Main Application Logic & Routing

const app = {
    // UI Helpers
    showLoader() {
        document.getElementById('loader').classList.remove('hidden');
    },
    
    hideLoader() {
        document.getElementById('loader').classList.add('hidden');
    },

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    toast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Routing
    initRouter() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute(); // initial load
    },

    handleRoute() {
        let hash = window.location.hash || '#/';
        
        // Hide all views
        document.querySelectorAll('.view').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('active');
        });

        // Remove active class from nav links
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        
        // Close mobile menu if open
        const navLinks = document.getElementById('nav-links');
        if (navLinks.classList.contains('show')) {
            navLinks.classList.remove('show');
        }

        // Determine view
        let targetView = 'home';
        if (hash === '#/register') targetView = 'register';
        else if (hash === '#/tournament') targetView = 'tournament';
        else if (hash === '#/admin') targetView = 'admin';

        // Show view
        const viewEl = document.getElementById(`view-${targetView}`);
        if (viewEl) {
            viewEl.classList.remove('hidden');
            // small delay to ensure display block before adding active for transitions
            setTimeout(() => viewEl.classList.add('active'), 10);
        }

        // Highlight nav link
        const navLink = document.querySelector(`.nav-link[data-target="${targetView}"]`);
        if (navLink) navLink.classList.add('active');

        // Fire view-specific logic
        this.triggerViewLogic(targetView);
    },

    triggerViewLogic(view) {
        switch(view) {
            case 'home':
                this.loadHomeData();
                break;
            case 'register':
                if (window.registrationApp) window.registrationApp.init();
                break;
            case 'tournament':
                if (window.tournamentApp) window.tournamentApp.init();
                break;
            case 'admin':
                if (window.adminApp) window.adminApp.init();
                break;
        }
    },

    async loadHomeData() {
        try {
            const state = await window.api.getTournamentState();
            const statusText = document.getElementById('home-status-text');
            const statusContainer = document.getElementById('home-tournament-status');
            
            if (!state || !statusText) return;
            
            // Interpret state
            const phaseConfig = {
                'registration': { text: '📝 Iscrizioni Aperte', color: 'var(--success)', border: 'rgba(34, 197, 94, 0.3)' },
                'groups_ready': { text: '📋 Gironi Pronti - In attesa di inizio', color: 'var(--warning)', border: 'rgba(245, 158, 11, 0.3)' },
                'gironi': { text: '⚽ Fase a Gironi in corso', color: 'var(--accent)', border: 'rgba(255, 107, 53, 0.3)' },
                'lower_bracket': { text: '🔄 Lower Bracket in corso', color: 'var(--accent)', border: 'rgba(255, 107, 53, 0.3)' },
                'elimination': { text: '🏆 Eliminazione Diretta', color: 'var(--secondary)', border: 'rgba(78, 205, 196, 0.3)' },
                'completed': { text: '✅ Torneo Concluso', color: 'var(--text-muted)', border: 'rgba(148, 163, 184, 0.3)' }
            };
            
            const config = phaseConfig[state.phase] || phaseConfig['registration'];
            statusText.textContent = config.text;
            statusContainer.style.borderColor = config.border;
            statusContainer.style.color = config.color;

            const registerCard = document.getElementById('home-register-card');
            if (registerCard) registerCard.classList.toggle('hidden', state.locked === 1);
        } catch (e) {
            console.error('Error loading home data:', e);
        }
    },

    initMobileMenu() {
        const btn = document.getElementById('mobile-menu-btn');
        const links = document.getElementById('nav-links');
        
        if (btn && links) {
            btn.addEventListener('click', () => {
                links.classList.toggle('show');
            });
        }
    }
};

window.app = app;

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    app.initMobileMenu();
    app.initRouter();
});

// If the browser restores this page from the back-forward cache (common on iOS
// Safari when switching apps/tabs), the tab keeps running whatever JS was loaded
// at the time - which can be stale after a deploy and start talking to an API
// that has since changed shape. Force a fresh load in that case.
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});
