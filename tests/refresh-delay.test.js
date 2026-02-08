const { describe, it, assertEqual, assertTrue, assertGreaterThan, assertLessThanOrEqual } = require('./runner');
const { GameState, calculateRefreshDelay, makeGame } = require('./helpers');

const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * ONE_MINUTE;
const THIRTY_MINUTES = 30 * ONE_MINUTE;
const ONE_HOUR = 60 * ONE_MINUTE;

describe('calculateRefreshDelay', () => {
    it('returns 1 minute for LIVE game (default, no pause)', () => {
        const game = makeGame({ status: { state: 'in' } });
        const delay = calculateRefreshDelay(GameState.LIVE, game, null);
        assertEqual(delay, ONE_MINUTE);
    });

    it('returns custom pause delay for LIVE NHL game during intermission', () => {
        const game = makeGame({
            status: { state: 'in' },
            live: { period: 1, periodTime: '0:00', isIntermission: true }
        });
        const nhlPauseDelay = (g) => g.live?.isIntermission ? 2 * ONE_MINUTE : ONE_MINUTE;
        const delay = calculateRefreshDelay(GameState.LIVE, game, nhlPauseDelay);
        assertEqual(delay, 2 * ONE_MINUTE);
    });

    it('returns custom pause delay for LIVE NFL game during halftime', () => {
        const game = makeGame({
            status: { state: 'in' },
            live: { quarter: 2, clock: '0:00', isHalftime: true }
        });
        const nflPauseDelay = (g) => g.live?.isHalftime ? 5 * ONE_MINUTE : ONE_MINUTE;
        const delay = calculateRefreshDelay(GameState.LIVE, game, nflPauseDelay);
        assertEqual(delay, 5 * ONE_MINUTE);
    });

    it('returns 1 minute for LIVE MLB game (no pause concept)', () => {
        const game = makeGame({
            status: { state: 'in' },
            live: { inning: 5, inningState: 'Top 5th' }
        });
        const mlbPauseDelay = () => ONE_MINUTE;
        const delay = calculateRefreshDelay(GameState.LIVE, game, mlbPauseDelay);
        assertEqual(delay, ONE_MINUTE);
    });

    it('returns at most 30 minutes for FINAL game', () => {
        const game = makeGame({ status: { state: 'post' } });
        const delay = calculateRefreshDelay(GameState.FINAL, game);
        assertLessThanOrEqual(delay, THIRTY_MINUTES);
        assertGreaterThan(delay, 0, 'Delay should be positive. ');
    });

    it('returns 1 minute for SCHEDULED game starting in <5 minutes', () => {
        const game = makeGame({
            startTime: new Date(Date.now() + 3 * ONE_MINUTE),
            status: { state: 'pre' }
        });
        const delay = calculateRefreshDelay(GameState.SCHEDULED, game);
        assertEqual(delay, ONE_MINUTE);
    });

    it('returns 5 minutes for SCHEDULED game starting in <1 hour', () => {
        const game = makeGame({
            startTime: new Date(Date.now() + 30 * ONE_MINUTE),
            status: { state: 'pre' }
        });
        const delay = calculateRefreshDelay(GameState.SCHEDULED, game);
        assertEqual(delay, FIVE_MINUTES);
    });

    it('returns 1 hour for SCHEDULED game starting in >1 hour', () => {
        const game = makeGame({
            startTime: new Date(Date.now() + 3 * ONE_HOUR),
            status: { state: 'pre' }
        });
        const delay = calculateRefreshDelay(GameState.SCHEDULED, game);
        assertEqual(delay, ONE_HOUR);
    });

    it('returns 1 hour for unknown game state', () => {
        const game = makeGame({ status: { state: 'mystery' } });
        const delay = calculateRefreshDelay('unknown', game);
        assertEqual(delay, ONE_HOUR);
    });

    it('returns 1 hour for SCHEDULED game with no startTime', () => {
        const game = makeGame({ status: { state: 'pre' } });
        delete game.startTime;
        const delay = calculateRefreshDelay(GameState.SCHEDULED, game);
        assertEqual(delay, ONE_HOUR);
    });
});
