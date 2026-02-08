const { describe, it, assertEqual, assertNotNull, assertNull } = require('./runner');
const {
    GameState, formatDate, parseGameState,
    findRelevantGame, makeGame, makeDay
} = require('./helpers');

// Fixed "now" for deterministic tests: Feb 7 2026, 3:00 PM local
const NOW = new Date(2026, 1, 7, 15, 0, 0);
const NOW_MS = NOW.getTime();
const TODAY = formatDate(NOW);

describe('findRelevantGame', () => {
    it('returns null for empty schedule', () => {
        const result = findRelevantGame([], parseGameState, TODAY, NOW_MS);
        assertNull(result);
    });

    it('returns null for schedule with no games', () => {
        const schedule = [makeDay(TODAY, [])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertNull(result);
    });

    it('returns null for null schedule', () => {
        const result = findRelevantGame(null, parseGameState, TODAY, NOW_MS);
        assertNull(result);
    });

    it('returns LIVE game over FINAL game', () => {
        const liveGame = makeGame({
            gamePk: 'live1',
            startTime: new Date(NOW_MS - 2 * 60 * 60 * 1000),
            status: { state: 'in', detail: 'Top 5th' }
        });
        const finalGame = makeGame({
            gamePk: 'final1',
            startTime: new Date(NOW_MS - 3 * 60 * 60 * 1000),
            status: { state: 'post', detail: 'Final' }
        });
        const schedule = [makeDay(TODAY, [finalGame, liveGame])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'live1');
    });

    it('returns LIVE game over SCHEDULED game', () => {
        const liveGame = makeGame({
            gamePk: 'live1',
            startTime: new Date(NOW_MS - 60 * 60 * 1000),
            status: { state: 'in', detail: 'Period 2' }
        });
        const scheduledGame = makeGame({
            gamePk: 'sched1',
            startTime: new Date(NOW_MS + 2 * 60 * 60 * 1000),
            status: { state: 'pre', detail: '' }
        });
        const schedule = [makeDay(TODAY, [scheduledGame, liveGame])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'live1');
    });

    it('returns FINAL game from today over SCHEDULED game', () => {
        const finalGame = makeGame({
            gamePk: 'final1',
            startTime: new Date(NOW_MS - 2 * 60 * 60 * 1000),
            status: { state: 'post', detail: 'Final' }
        });
        const scheduledGame = makeGame({
            gamePk: 'sched1',
            startTime: new Date(NOW_MS + 4 * 60 * 60 * 1000),
            status: { state: 'pre', detail: '' }
        });
        const schedule = [makeDay(TODAY, [finalGame, scheduledGame])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'final1');
    });

    it('skips FINAL game from yesterday', () => {
        const yesterday = new Date(NOW_MS - 24 * 60 * 60 * 1000);
        const yesterdayStr = formatDate(yesterday);
        const finalGame = makeGame({
            gamePk: 'final_yesterday',
            startTime: yesterday,
            status: { state: 'post', detail: 'Final' }
        });
        const scheduledGame = makeGame({
            gamePk: 'sched_today',
            startTime: new Date(NOW_MS + 2 * 60 * 60 * 1000),
            status: { state: 'pre', detail: '' }
        });
        const schedule = [
            makeDay(yesterdayStr, [finalGame]),
            makeDay(TODAY, [scheduledGame])
        ];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'sched_today');
    });

    it('skips FINAL game older than 5 hours', () => {
        const oldFinalGame = makeGame({
            gamePk: 'old_final',
            startTime: new Date(NOW_MS - 6 * 60 * 60 * 1000),
            status: { state: 'post', detail: 'Final' }
        });
        // Game started 6hrs ago but day.date is today — should be skipped by 5hr window
        const schedule = [makeDay(TODAY, [oldFinalGame])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertNull(result);
    });

    it('returns FINAL game within 5-hour window', () => {
        const recentFinal = makeGame({
            gamePk: 'recent_final',
            startTime: new Date(NOW_MS - 4 * 60 * 60 * 1000),
            status: { state: 'post', detail: 'Final' }
        });
        const schedule = [makeDay(TODAY, [recentFinal])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'recent_final');
    });

    it('returns today SCHEDULED game over future SCHEDULED game', () => {
        const tomorrow = new Date(NOW_MS + 24 * 60 * 60 * 1000);
        const tomorrowStr = formatDate(tomorrow);
        const todayGame = makeGame({
            gamePk: 'sched_today',
            startTime: new Date(NOW_MS + 3 * 60 * 60 * 1000),
            status: { state: 'pre', detail: '' }
        });
        const tomorrowGame = makeGame({
            gamePk: 'sched_tomorrow',
            startTime: tomorrow,
            status: { state: 'pre', detail: '' }
        });
        const schedule = [
            makeDay(tomorrowStr, [tomorrowGame]),
            makeDay(TODAY, [todayGame])
        ];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'sched_today');
    });

    it('returns future SCHEDULED game when no today games', () => {
        const tomorrow = new Date(NOW_MS + 24 * 60 * 60 * 1000);
        const tomorrowStr = formatDate(tomorrow);
        const futureGame = makeGame({
            gamePk: 'future1',
            startTime: tomorrow,
            status: { state: 'pre', detail: '' }
        });
        const schedule = [makeDay(tomorrowStr, [futureGame])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'future1');
    });

    it('skips POSTPONED games', () => {
        const postponed = makeGame({
            gamePk: 'postponed1',
            startTime: new Date(NOW_MS + 60 * 60 * 1000),
            status: { state: 'postponed', detail: 'Postponed' }
        });
        const schedule = [makeDay(TODAY, [postponed])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertNull(result);
    });

    it('skips CANCELLED games', () => {
        const cancelled = makeGame({
            gamePk: 'cancelled1',
            startTime: new Date(NOW_MS + 60 * 60 * 1000),
            status: { state: 'cancelled', detail: 'Cancelled' }
        });
        const schedule = [makeDay(TODAY, [cancelled])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertNull(result);
    });

    it('finds LIVE game on a different day in schedule', () => {
        const tomorrow = new Date(NOW_MS + 24 * 60 * 60 * 1000);
        const tomorrowStr = formatDate(tomorrow);
        const liveGame = makeGame({
            gamePk: 'live_other_day',
            startTime: new Date(NOW_MS - 30 * 60 * 1000),
            status: { state: 'in', detail: 'Bottom 3rd' }
        });
        // LIVE games are found regardless of day.date
        const schedule = [makeDay(tomorrowStr, [liveGame])];
        const result = findRelevantGame(schedule, parseGameState, TODAY, NOW_MS);
        assertEqual(result.gamePk, 'live_other_day');
    });

    it('uses local date for today comparison (timezone fix)', () => {
        // Simulate 10pm ET on Feb 7 — UTC would be Feb 8, but local is still Feb 7
        const late = new Date(2026, 1, 7, 22, 0, 0);
        const lateMs = late.getTime();
        const lateToday = formatDate(late); // Should be 2026-02-07 in local

        const game = makeGame({
            gamePk: 'evening_game',
            startTime: new Date(2026, 1, 7, 19, 0, 0),
            status: { state: 'post', detail: 'Final' }
        });
        const schedule = [makeDay(lateToday, [game])];
        const result = findRelevantGame(schedule, parseGameState, lateToday, lateMs);
        assertNotNull(result, 'Evening FINAL game should be found with local dates. ');
        assertEqual(result.gamePk, 'evening_game');
    });

    it('handles game at 11pm local (UTC next day) correctly', () => {
        // Game at 11pm local on Feb 7 — in UTC this is Feb 8
        const lateGame = makeGame({
            gamePk: 'late_game',
            startTime: new Date(2026, 1, 7, 23, 0, 0),
            status: { state: 'pre', detail: '' }
        });
        const localToday = formatDate(new Date(2026, 1, 7, 20, 0, 0));
        const schedule = [makeDay(localToday, [lateGame])];
        const result = findRelevantGame(schedule, parseGameState, localToday, new Date(2026, 1, 7, 20, 0, 0).getTime());
        assertNotNull(result, 'Late game should be found using local dates. ');
        assertEqual(result.gamePk, 'late_game');
    });
});
