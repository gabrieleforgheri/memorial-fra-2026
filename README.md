# 🏓 2° Memorial Fra - Torneo di Racchettoni

Applicazione web per la gestione completa di un torneo di racchettoni (beach tennis), con registrazione giocatori, gestione gironi, bracket ad eliminazione diretta e classifica live.

## 🎯 Funzionalità

### 👤 Registrazione Giocatori
- Form semplice: nome + sesso (M/F)
- Lista iscritti divisa per ATP (maschile) e WTA (femminile)

### 🏆 Tabellone Pubblico
- **Gironi**: Visualizzazione gruppi con classifica (punti, vittorie, sconfitte, differenza game)
- **Partite**: Lista partite con risultati e stato
- **Bracket**: Visualizzazione eliminazione diretta (semifinali + finale)
- **Classifica**: Classifica generale individuale

### ⚙️ Pannello Admin (protetto da password)
- Assegnazione categorie giocatori: **F** (Forte) / **N** (Normale)
- Generazione automatica gironi bilanciati (2F + 2N per girone)
- Inserimento risultati partite con calcolo automatico punti
- Gestione fasi torneo (avanzamento, reset)

## 📋 Regolamento Punti
| Risultato | Vincitore | Perdente |
|-----------|-----------|----------|
| Vittoria netta (es. 6-3) | 3 punti | 0 punti |
| Vittoria al tie-break (es. 6-5) | 2 punti | 1 punto |

## 🏗 Struttura Torneo
1. **Fase a Gironi**: Ogni girone ha 4 giocatori (2F + 2N). Le coppie sono: F1+N1 vs F2+N2 e F1+N2 vs F2+N1
2. **Lower Bracket**: I 3° e 4° classificati giocano un girone addizionale
3. **Eliminazione Diretta**: Cross-pairing tra gironi (miglior F del Girone A + miglior N del Girone B e viceversa)
4. **Semifinali → Finale**

## 🚀 Installazione

```bash
# Clona il repository
git clone https://github.com/YOURUSERNAME/memorial-fra-2026.git
cd memorial-fra-2026

# Installa dipendenze
npm install

# Configura l'ambiente
# Modifica .env con la tua password admin e JWT secret
cp .env.example .env

# Avvia il server
npm start
```

## 🔧 Configurazione

Crea un file `.env` nella root:

```env
ADMIN_PASSWORD=la_tua_password
PORT=3000
JWT_SECRET=una_chiave_segreta_random
```

## 💻 Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla HTML/CSS/JS (SPA)
- **Auth**: JWT
- **Design**: Dark theme premium con glassmorphism

## 📱 Compatibilità
- ✅ Desktop (Chrome, Firefox, Safari, Edge)
- ✅ Mobile (responsive design)
- ✅ Pelican Panel (Node.js egg)

## 📄 Licenza
MIT
