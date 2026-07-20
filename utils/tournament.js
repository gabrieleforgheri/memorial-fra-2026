const db = require('../db/database');

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateGroupsLogistics(players, type) {
    const fPlayers = shuffleArray(players.filter(p => p.category === 'F'));
    const nPlayers = shuffleArray(players.filter(p => p.category === 'N'));
    
    const groups = [];
    let groupIndex = 0;
    
    while (fPlayers.length >= 2 && nPlayers.length >= 2) {
        const group = {
            name: `Girone ${String.fromCharCode(65 + groupIndex)} ${type}`,
            type: type,
            players: [
                fPlayers.pop(),
                fPlayers.pop(),
                nPlayers.pop(),
                nPlayers.pop()
            ]
        };
        groups.push(group);
        groupIndex++;
    }
    
    return groups;
}

function calculateScorePoints(score1, score2) {
    if (score1 === null || score2 === null) return { pts1: 0, pts2: 0 };
    
    const diff = Math.abs(score1 - score2);
    if (score1 > score2) {
        if (diff > 1) return { pts1: 3, pts2: 0 };
        return { pts1: 2, pts2: 1 };
    } else if (score2 > score1) {
        if (diff > 1) return { pts1: 0, pts2: 3 };
        return { pts1: 1, pts2: 2 };
    }
    return { pts1: 0, pts2: 0 }; 
}

module.exports = {
    shuffleArray,
    generateGroupsLogistics,
    calculateScorePoints
};
