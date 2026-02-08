const fs = require('fs');
const path = require('path');
const { describe, it, assertEqual, assertNotNull, assertNull, assertTrue, assertGreaterThan } = require('./runner');
const { GameState, getScore, validateParsedGame, parseGameState } = require('./helpers');

// --- Score parsing tests ---

describe('getScore (ESPN score parsing)', () => {
    it('handles plain number score', () => {
        assertEqual(getScore({ score: '5' }), 5);
    });

    it('handles plain number score as integer', () => {
        assertEqual(getScore({ score: 3 }), 3);
    });

    it('handles nested score object with value', () => {
        assertEqual(getScore({ score: { value: 6.0, displayValue: '6' } }), 6);
    });

    it('handles nested score object with displayValue only', () => {
        assertEqual(getScore({ score: { displayValue: '10' } }), 10);
    });

    it('returns 0 for missing score', () => {
        assertEqual(getScore({}), 0);
    });

    it('returns 0 for null score', () => {
        assertEqual(getScore({ score: null }), 0);
    });

    it('returns 0 for undefined score', () => {
        assertEqual(getScore({ score: undefined }), 0);
    });

    it('returns 0 for score "0"', () => {
        assertEqual(getScore({ score: '0' }), 0);
    });

    it('handles nested score with value 0', () => {
        assertEqual(getScore({ score: { value: 0, displayValue: '0' } }), 0);
    });
});

// --- Game validation tests ---

describe('validateParsedGame', () => {
    it('returns true for valid game', () => {
        const game = {
            gamePk: '123',
            startTime: new Date('2026-02-07T19:00:00'),
            home: { id: 23, abbrev: 'PIT' },
            away: { id: 1, abbrev: 'BAL' }
        };
        assertTrue(validateParsedGame(game));
    });

    it('returns false for null game', () => {
        assertTrue(!validateParsedGame(null));
    });

    it('returns false for missing startTime', () => {
        const game = {
            gamePk: '123',
            home: { id: 23, abbrev: 'PIT' },
            away: { id: 1, abbrev: 'BAL' }
        };
        assertTrue(!validateParsedGame(game));
    });

    it('returns false for invalid startTime (NaN)', () => {
        const game = {
            gamePk: '123',
            startTime: new Date('invalid'),
            home: { id: 23, abbrev: 'PIT' },
            away: { id: 1, abbrev: 'BAL' }
        };
        assertTrue(!validateParsedGame(game));
    });

    it('returns false for missing home team id', () => {
        const game = {
            gamePk: '123',
            startTime: new Date(),
            home: { abbrev: 'PIT' },
            away: { id: 1, abbrev: 'BAL' }
        };
        assertTrue(!validateParsedGame(game));
    });

    it('returns false for missing away team abbreviation', () => {
        const game = {
            gamePk: '123',
            startTime: new Date(),
            home: { id: 23, abbrev: 'PIT' },
            away: { id: 1 }
        };
        assertTrue(!validateParsedGame(game));
    });
});

// --- parseGameState tests ---

describe('parseGameState', () => {
    it('returns SCHEDULED for pre state', () => {
        assertEqual(parseGameState({ status: { state: 'pre' } }), GameState.SCHEDULED);
    });

    it('returns LIVE for in state', () => {
        assertEqual(parseGameState({ status: { state: 'in' } }), GameState.LIVE);
    });

    it('returns LIVE for live state', () => {
        assertEqual(parseGameState({ status: { state: 'live' } }), GameState.LIVE);
    });

    it('returns FINAL for post state', () => {
        assertEqual(parseGameState({ status: { state: 'post' } }), GameState.FINAL);
    });

    it('returns POSTPONED for postponed state', () => {
        assertEqual(parseGameState({ status: { state: 'postponed' } }), GameState.POSTPONED);
    });

    it('returns CANCELLED for cancelled state', () => {
        assertEqual(parseGameState({ status: { state: 'cancelled' } }), GameState.CANCELLED);
    });

    it('returns SCHEDULED for missing status', () => {
        assertEqual(parseGameState({}), GameState.SCHEDULED);
    });

    it('returns SCHEDULED for null state', () => {
        assertEqual(parseGameState({ status: { state: null } }), GameState.SCHEDULED);
    });

    it('returns SCHEDULED for unknown state', () => {
        assertEqual(parseGameState({ status: { state: 'mystery' } }), GameState.SCHEDULED);
    });
});

// --- ESPN fixture parsing tests ---

function loadFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures', filename);
    if (!fs.existsSync(fixturePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

// Mirrors BaseSport._parseEvent for testing (without GJS deps)
function parseEvent(event, preferredTeamId) {
    const comp = event.competitions?.[0];
    if (!comp || !comp.competitors) return null;

    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    if (!home || !away) return null;

    const status = comp.status || {};
    const statusType = status.type || {};

    const game = {
        gamePk: event.id,
        startTime: new Date(event.date),
        preferredTeamId: preferredTeamId,
        home: {
            id: parseInt(home.team.id),
            abbrev: home.team.abbreviation,
            score: getScore(home)
        },
        away: {
            id: parseInt(away.team.id),
            abbrev: away.team.abbreviation,
            score: getScore(away)
        },
        status: {
            state: statusType.state || 'pre',
            detail: statusType.detail || ''
        },
        venue: comp.venue?.fullName || ''
    };

    return validateParsedGame(game) ? game : null;
}

describe('ESPN NFL fixture parsing', () => {
    const nflData = loadFixture('espn_nfl_schedule.json');

    if (!nflData) {
        it('SKIP: NFL fixture not found', () => { assertTrue(true); });
        return;
    }

    it('has events array', () => {
        assertNotNull(nflData.events);
        assertTrue(Array.isArray(nflData.events));
    });

    it('parses first event successfully', () => {
        const game = parseEvent(nflData.events[0], 23);
        assertNotNull(game, 'First event should parse. ');
    });

    it('extracts correct home/away team IDs', () => {
        const game = parseEvent(nflData.events[0], 23);
        assertNotNull(game);
        assertTrue(typeof game.home.id === 'number', 'Home ID should be number. ');
        assertTrue(typeof game.away.id === 'number', 'Away ID should be number. ');
        assertTrue(game.home.id > 0, 'Home ID should be positive. ');
        assertTrue(game.away.id > 0, 'Away ID should be positive. ');
    });

    it('handles nested score objects correctly', () => {
        const game = parseEvent(nflData.events[0], 23);
        assertNotNull(game);
        // NFL fixture has nested scores {value: 6.0, displayValue: "6"}
        assertTrue(typeof game.home.score === 'number', 'Home score should be number. ');
        assertTrue(typeof game.away.score === 'number', 'Away score should be number. ');
        assertTrue(!isNaN(game.home.score), 'Home score should not be NaN. ');
        assertTrue(!isNaN(game.away.score), 'Away score should not be NaN. ');
    });

    it('parses startTime as valid Date', () => {
        const game = parseEvent(nflData.events[0], 23);
        assertNotNull(game);
        assertTrue(game.startTime instanceof Date, 'startTime should be Date. ');
        assertTrue(!isNaN(game.startTime.getTime()), 'startTime should be valid. ');
    });

    it('extracts venue name', () => {
        const game = parseEvent(nflData.events[0], 23);
        assertNotNull(game);
        assertTrue(typeof game.venue === 'string', 'Venue should be string. ');
    });

    it('extracts correct game state', () => {
        const game = parseEvent(nflData.events[0], 23);
        assertNotNull(game);
        const state = parseGameState(game);
        assertTrue(
            [GameState.SCHEDULED, GameState.LIVE, GameState.FINAL, GameState.POSTPONED, GameState.CANCELLED].includes(state),
            `State should be known value, got: ${state}. `
        );
    });

    it('validates all events in fixture', () => {
        let parsed = 0;
        let failed = 0;
        for (const event of nflData.events) {
            const game = parseEvent(event, 23);
            if (game) {
                parsed++;
            } else {
                failed++;
            }
        }
        assertGreaterThan(parsed, 0, 'Should parse at least one event. ');
    });
});

describe('ESPN MLB fixture parsing', () => {
    const mlbData = loadFixture('espn_mlb_schedule.json');

    if (!mlbData) {
        it('SKIP: MLB fixture not found', () => { assertTrue(true); });
        return;
    }

    it('has events array', () => {
        assertNotNull(mlbData.events);
        assertTrue(Array.isArray(mlbData.events));
    });

    it('parses events without crashing', () => {
        let parsed = 0;
        for (const event of mlbData.events.slice(0, 10)) {
            const game = parseEvent(event, 23);
            if (game) parsed++;
        }
        assertGreaterThan(parsed, 0, 'Should parse at least one MLB event. ');
    });

    it('handles scores correctly across events', () => {
        for (const event of mlbData.events.slice(0, 10)) {
            const game = parseEvent(event, 23);
            if (!game) continue;
            assertTrue(!isNaN(game.home.score), `Home score NaN for game ${game.gamePk}. `);
            assertTrue(!isNaN(game.away.score), `Away score NaN for game ${game.gamePk}. `);
        }
    });
});

describe('ESPN NHL fixture parsing', () => {
    const nhlData = loadFixture('espn_nhl_schedule.json');

    if (!nhlData) {
        it('SKIP: NHL fixture not found', () => { assertTrue(true); });
        return;
    }

    it('has events array', () => {
        assertNotNull(nhlData.events);
        assertTrue(Array.isArray(nhlData.events));
    });

    it('parses events without crashing', () => {
        let parsed = 0;
        for (const event of nhlData.events.slice(0, 10)) {
            const game = parseEvent(event, 5);
            if (game) parsed++;
        }
        assertGreaterThan(parsed, 0, 'Should parse at least one NHL event. ');
    });
});

// --- Edge case: missing fields ---

describe('ESPN parsing edge cases', () => {
    it('returns null for event with no competitions', () => {
        const event = { id: '999', date: '2026-02-07T19:00Z' };
        assertNull(parseEvent(event, 23));
    });

    it('returns null for event with no competitors', () => {
        const event = {
            id: '999',
            date: '2026-02-07T19:00Z',
            competitions: [{ status: { type: { state: 'pre' } } }]
        };
        assertNull(parseEvent(event, 23));
    });

    it('returns null for event with missing home', () => {
        const event = {
            id: '999',
            date: '2026-02-07T19:00Z',
            competitions: [{
                competitors: [
                    { homeAway: 'away', team: { id: '1', abbreviation: 'BAL' }, score: '0' }
                ],
                status: { type: { state: 'pre' } }
            }]
        };
        assertNull(parseEvent(event, 23));
    });

    it('handles missing venue gracefully', () => {
        const event = {
            id: '999',
            date: '2026-02-07T19:00Z',
            competitions: [{
                competitors: [
                    { homeAway: 'home', team: { id: '23', abbreviation: 'PIT' }, score: '0' },
                    { homeAway: 'away', team: { id: '1', abbreviation: 'BAL' }, score: '0' }
                ],
                status: { type: { state: 'pre', detail: '' } }
            }]
        };
        const game = parseEvent(event, 23);
        assertNotNull(game);
        assertEqual(game.venue, '');
    });
});
