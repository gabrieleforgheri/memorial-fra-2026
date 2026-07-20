require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/players', require('./routes/players'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tournament', require('./routes/tournament'));

// Catch-all to serve index.html for SPA if needed
app.get('*', (req, res) => {
    // Only serve index.html for non-api routes
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'API route not found' });
    }
});

const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
