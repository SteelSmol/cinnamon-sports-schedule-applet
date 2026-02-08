const { describe, it, assertTrue, assertFalse } = require('./runner');
const { GameState, formatDate, parseGameState, isCacheValid, makeGame } = require('./helpers');

// Fixed "now" for deterministic tests
const NOW = new Date(2026, 1, 7, 15, 0, 0);
const NOW_MS = NOW.getTime();

describe('isCacheValid', () => {
    it('returns false for null game', () => {
        assertFalse(isCacheValid(null, parseGameState, NOW_MS - 1000, NOW_MS));
    });

    it('returns false for game without startTime', () => {
        const game = makeGame();
        delete game.startTime;
        assertFalse(isCacheValid(game, parseGameState, NOW_MS - 1000, NOW_MS));
    });

    it('returns false for game from yesterday', () => {
        const yesterday = new Date(2026, 1, 6, 19, 0, 0);
        const game = makeGame({
            startTime: yesterday,
            status: { state: 'post', detail: 'Final' }
        });
        assertFalse(isCacheValid(game, parseGameState, NOW_MS - 1000, NOW_MS));
    });

    it('returns true for FINAL game updated <1 hour ago', () => {
        const game = makeGame({
            startTime: new Date(2026, 1, 7, 13, 0, 0),
            status: { state: 'post', detail: 'Final' }
        });
        const lastUpdate = NOW_MS - 30 * 60 * 1000; // 30 min ago
        assertTrue(isCacheValid(game, parseGameState, lastUpdate, NOW_MS));
    });

    it('returns false for FINAL game updated >1 hour ago', () => {
        const game = makeGame({
            startTime: new Date(2026, 1, 7, 12, 0, 0),
            status: { state: 'post', detail: 'Final' }
        });
        const lastUpdate = NOW_MS - 90 * 60 * 1000; // 90 min ago
        assertFalse(isCacheValid(game, parseGameState, lastUpdate, NOW_MS));
    });

    it('returns true for LIVE game updated <5 minutes ago', () => {
        const game = makeGame({
            startTime: new Date(2026, 1, 7, 14, 0, 0),
            status: { state: 'in', detail: 'Top 5th' }
        });
        const lastUpdate = NOW_MS - 3 * 60 * 1000; // 3 min ago
        assertTrue(isCacheValid(game, parseGameState, lastUpdate, NOW_MS));
    });

    it('returns false for LIVE game updated >5 minutes ago', () => {
        const game = makeGame({
            startTime: new Date(2026, 1, 7, 14, 0, 0),
            status: { state: 'in', detail: 'Bottom 7th' }
        });
        const lastUpdate = NOW_MS - 6 * 60 * 1000; // 6 min ago
        assertFalse(isCacheValid(game, parseGameState, lastUpdate, NOW_MS));
    });

    it('returns true for SCHEDULED game updated <5 minutes ago', () => {
        const game = makeGame({
            startTime: new Date(2026, 1, 7, 19, 0, 0),
            status: { state: 'pre', detail: '' }
        });
        const lastUpdate = NOW_MS - 2 * 60 * 1000; // 2 min ago
        assertTrue(isCacheValid(game, parseGameState, lastUpdate, NOW_MS));
    });

    it('returns false for SCHEDULED game updated >5 minutes ago', () => {
        const game = makeGame({
            startTime: new Date(2026, 1, 7, 19, 0, 0),
            status: { state: 'pre', detail: '' }
        });
        const lastUpdate = NOW_MS - 10 * 60 * 1000; // 10 min ago
        assertFalse(isCacheValid(game, parseGameState, lastUpdate, NOW_MS));
    });

    it('uses local dates, not UTC (timezone fix verification)', () => {
        // 10pm local on Feb 7 — UTC would be Feb 8 for many US timezones
        const evening = new Date(2026, 1, 7, 22, 0, 0);
        const eveningMs = evening.getTime();

        const game = makeGame({
            startTime: new Date(2026, 1, 7, 19, 0, 0),
            status: { state: 'post', detail: 'Final' }
        });
        const lastUpdate = eveningMs - 30 * 60 * 1000;

        // Should be valid: game is "today" in local time, updated 30 min ago
        assertTrue(isCacheValid(game, parseGameState, lastUpdate, eveningMs),
            'Evening game should be valid with local date comparison. ');
    });
});
