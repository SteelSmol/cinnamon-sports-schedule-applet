/**
 * Shared test helpers — pure logic extracted from the applet for testing.
 * These mirror the actual implementations but without GJS dependencies.
 */

const GameState = {
    SCHEDULED: 'scheduled',
    LIVE: 'live',
    FINAL: 'final',
    POSTPONED: 'postponed',
    CANCELLED: 'cancelled'
};

// Mirrors Utils.formatDate — local time YYYY-MM-DD
function formatDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Mirrors BaseSport.parseGameState
function parseGameState(game) {
    const state = game.status?.state;
    if (!state) return GameState.SCHEDULED;
    if (state === 'in' || state === 'live') return GameState.LIVE;
    if (state === 'post') return GameState.FINAL;
    if (state === 'postponed') return GameState.POSTPONED;
    if (state === 'cancelled') return GameState.CANCELLED;
    return GameState.SCHEDULED;
}

// Mirrors BaseSport._getScore
function getScore(competitor) {
    if (!competitor.score) return 0;
    if (typeof competitor.score === 'object') {
        return parseInt(competitor.score.value || competitor.score.displayValue || 0);
    }
    return parseInt(competitor.score) || 0;
}

// Mirrors BaseSport._validateParsedGame
function validateParsedGame(game) {
    if (!game) return false;
    if (!game.startTime || isNaN(game.startTime.getTime())) return false;
    if (!game.home?.id || !game.away?.id) return false;
    if (!game.home?.abbrev || !game.away?.abbrev) return false;
    return true;
}

// Mirrors applet.js _findRelevantGame (extracted as pure function)
function findRelevantGame(schedule, parseGameStateFn, todayStr, nowMs) {
    if (!schedule || schedule.length === 0) return null;

    const FIVE_HOURS = 5 * 60 * 60 * 1000;

    // First pass: Look for LIVE games
    for (const day of schedule) {
        if (!day.games || day.games.length === 0) continue;
        for (const game of day.games) {
            if (parseGameStateFn(game) === GameState.LIVE) {
                return game;
            }
        }
    }

    // Second pass: FINAL games from today only (within 5 hours)
    for (const day of schedule) {
        if (!day.games || day.games.length === 0) continue;
        if (day.date !== todayStr) continue;
        for (const game of day.games) {
            if (parseGameStateFn(game) === GameState.FINAL) {
                const gameDate = formatDate(new Date(game.startTime));
                if (gameDate !== todayStr) continue;
                const timeSinceStart = nowMs - game.startTime.getTime();
                if (timeSinceStart > 0 && timeSinceStart < FIVE_HOURS) {
                    return game;
                }
            }
        }
    }

    // Third pass: SCHEDULED games today
    for (const day of schedule) {
        if (!day.games || day.games.length === 0) continue;
        if (day.date === todayStr) {
            for (const game of day.games) {
                if (parseGameStateFn(game) === GameState.SCHEDULED) {
                    return game;
                }
            }
        }
    }

    // Fourth pass: SCHEDULED games future
    for (const day of schedule) {
        if (!day.games || day.games.length === 0) continue;
        if (day.date === todayStr) continue;
        for (const game of day.games) {
            if (parseGameStateFn(game) === GameState.SCHEDULED) {
                return game;
            }
        }
    }

    return null;
}

// Mirrors applet.js _isCacheValid (extracted as pure function)
function isCacheValid(game, parseGameStateFn, lastUpdateTime, nowMs) {
    if (!game || !game.startTime) return false;

    const state = parseGameStateFn(game);
    const age = nowMs - lastUpdateTime;

    const today = formatDate(new Date(nowMs));
    const gameDate = formatDate(new Date(game.startTime));
    if (gameDate !== today) return false;

    if (state === GameState.FINAL) {
        return age < 60 * 60 * 1000;
    }
    if (state === GameState.LIVE) {
        return age < 5 * 60 * 1000;
    }
    return age < 5 * 60 * 1000;
}

// Mirrors BaseSport.calculateRefreshDelay (extracted, with configurable pause delay)
function calculateRefreshDelay(gameState, game, getLivePauseDelayFn, liveRefreshMs) {
    const ONE_MINUTE = 60 * 1000;
    const FIVE_MINUTES = 5 * ONE_MINUTE;
    const THIRTY_MINUTES = 30 * ONE_MINUTE;
    const ONE_HOUR = 60 * ONE_MINUTE;

    switch (gameState) {
        case GameState.LIVE:
            if (liveRefreshMs) return liveRefreshMs;
            return getLivePauseDelayFn ? getLivePauseDelayFn(game) : ONE_MINUTE;
        case GameState.FINAL: {
            const now = Date.now();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const timeUntilMidnight = midnight.getTime() - now;
            return Math.min(THIRTY_MINUTES, timeUntilMidnight);
        }
        case GameState.SCHEDULED:
            if (game.startTime) {
                const timeUntilStart = game.startTime - Date.now();
                if (timeUntilStart < FIVE_MINUTES) return ONE_MINUTE;
                if (timeUntilStart < ONE_HOUR) return FIVE_MINUTES;
            }
            return ONE_HOUR;
        default:
            return ONE_HOUR;
    }
}

// Helper to build a game object for testing
function makeGame(overrides = {}) {
    const now = new Date();
    return {
        gamePk: '12345',
        startTime: now,
        preferredTeamId: 23,
        home: { id: 23, abbrev: 'PIT', score: 0 },
        away: { id: 1, abbrev: 'BAL', score: 0 },
        status: { state: 'pre', detail: '' },
        venue: 'Test Stadium',
        live: null,
        ...overrides
    };
}

// Helper to build a schedule day for testing
function makeDay(date, games) {
    return { date, games };
}

module.exports = {
    GameState,
    formatDate,
    parseGameState,
    getScore,
    validateParsedGame,
    findRelevantGame,
    isCacheValid,
    calculateRefreshDelay,
    makeGame,
    makeDay
};
