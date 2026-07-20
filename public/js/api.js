// api.js - Handles all API communication
const API_BASE = '/api';

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

const api = {
    getToken() {
        return localStorage.getItem('admin_token');
    },
    
    setToken(token) {
        if (token) localStorage.setItem('admin_token', token);
        else localStorage.removeItem('admin_token');
    },

    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            
            // If response is not JSON (e.g. empty 204), don't parse it
            const contentType = response.headers.get('content-type');
            let data = null;
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            }

            if (!response.ok) {
                throw new ApiError(data?.message || data?.error || 'Errore di rete', response.status);
            }

            return data;
        } catch (error) {
            console.error(`API Error on ${endpoint}:`, error);
            throw error;
        }
    },

    // Public API
    async registerPlayer(name, gender, preferred_dates, category) {
        return this.request('/players', {
            method: 'POST',
            body: JSON.stringify({ name, gender, preferred_dates, category })
        });
    },

    async getPlayers() {
        return this.request('/players');
    },

    async getDatesStats() {
        return this.request('/players/dates');
    },

    async getTournamentState() {
        return this.request('/tournament/state');
    },

    async getGroups() {
        return this.request('/tournament/groups');
    },

    async getMatches() {
        return this.request('/tournament/matches');
    },

    async getBracket() {
        return this.request('/tournament/bracket');
    },

    async getStandings() {
        return this.request('/tournament/standings');
    },

    // Auth API
    async login(password) {
        const res = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
        this.setToken(res.token);
        return res;
    },

    async verifyAuth() {
        if (!this.getToken()) return false;
        try {
            await this.request('/auth/verify');
            return true;
        } catch (e) {
            this.setToken(null);
            return false;
        }
    },

    // Admin API
    async updatePlayerCategory(id, category) {
        return this.request(`/admin/players/${id}/category`, {
            method: 'PUT',
            body: JSON.stringify({ category })
        });
    },

    async deletePlayer(id) {
        return this.request(`/admin/players/${id}`, { method: 'DELETE' });
    },
    
    async updatePlayerName(id, name) {
        return this.request(`/admin/players/${id}/name`, {
            method: 'PUT',
            body: JSON.stringify({ name })
        });
    },

    async generateGroups() {
        return this.request('/admin/groups/generate', { method: 'POST' });
    },

    async saveGroupsManual(groups) {
        return this.request('/admin/groups/manual', {
            method: 'PUT',
            body: JSON.stringify({ groups })
        });
    },

    async startTournament() {
        return this.request('/admin/tournament/start', { method: 'POST' });
    },

    async updateScore(matchId, scoreTeam1, scoreTeam2) {
        return this.request(`/admin/matches/${matchId}/score`, {
            method: 'PUT',
            body: JSON.stringify({ score_team1: scoreTeam1, score_team2: scoreTeam2 })
        });
    },

    async advanceTournament() {
        return this.request('/admin/tournament/advance', { method: 'POST' });
    },

    async resetTournament() {
        return this.request('/admin/tournament/reset', { method: 'POST' });
    },

    async resetSimulation() {
        return this.request('/admin/tournament/reset-simulation', { method: 'POST' });
    },

    async clearDates() {
        return this.request('/admin/tournament/clear-dates', { method: 'POST' });
    }
};

window.api = api;
