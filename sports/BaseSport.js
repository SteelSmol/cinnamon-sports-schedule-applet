const { Gio, GLib } = imports.gi;

const APPLET_UUID = 'sports-schedule-applet@steel';

// Add core path for Utils import
const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
const coreDir = GLib.build_filenamev([appletDir, 'core']);
if (imports.searchPath.indexOf(coreDir) === -1) {
    imports.searchPath.unshift(coreDir);
}

const Utils = imports.Utils.EXPORTS;

const GameState = {
    SCHEDULED: 'scheduled',
    LIVE: 'live',
    FINAL: 'final',
    POSTPONED: 'postponed',
    CANCELLED: 'cancelled'
};

class BaseSport {
    constructor(teamsFilename) {
        if (new.target === BaseSport) {
            throw new Error('BaseSport is abstract and cannot be instantiated');
        }
        this._teams = this._loadTeams(teamsFilename);
    }

    // --- Abstract (subclasses MUST implement) ---

    getSportName() {
        throw new Error('getSportName() must be implemented');
    }

    getTeamLogoUrl(teamId) {
        throw new Error('getTeamLogoUrl() must be implemented');
    }

    _getApiPath() {
        throw new Error('_getApiPath() must be implemented');
    }

    // --- Optional overrides ---

    /**
     * Parse sport-specific live game state from ESPN competition data.
     * Returns null if game is not live, or a sport-specific object
     * (e.g., {inning, inningState} for MLB, {quarter, clock, isHalftime} for NFL).
     */
    _parseLiveState(comp, status) {
        return null;
    }

    /**
     * Format the live game detail string (e.g., "T5" for top of 5th, "2nd 7:42" for NFL).
     */
    _formatLiveDetail(game) {
        return '';
    }

    /**
     * Return refresh delay for live games during pauses (halftime, intermission).
     * Default: 1 minute (no pause concept).
     */
    _getLivePauseDelay(game) {
        return 60 * 1000;
    }

    // --- Shared implementations ---

    _loadTeams(filename) {
        const teamsFile = Gio.File.new_for_path(
            imports.ui.appletManager.appletMeta[APPLET_UUID].path + '/sports/data/' + filename
        );
        const [success, contents] = teamsFile.load_contents(null);
        if (success) {
            const text = imports.byteArray.toString(contents);
            return JSON.parse(text);
        }
        return [];
    }

    getTeams() {
        return this._teams;
    }

    getTeamById(teamId) {
        return this._teams.find(t => t.id === teamId);
    }

    _getCodeById(teamId) {
        const team = this._teams.find(t => t.id === teamId);
        return team?.code || '';
    }

    _getAbbrevById(teamId) {
        const team = this._teams.find(t => t.id === teamId);
        return team?.abbrev || '';
    }

    isHome(game, preferredTeamId) {
        return game.home?.id === preferredTeamId;
    }

    getOpponent(game, preferredTeamId) {
        return this.isHome(game, preferredTeamId) ? game.away : game.home;
    }

    // --- ESPN API ---

    async fetchSchedule(apiClient, teamId, startDate, endDate) {
        const path = this._getApiPath();
        const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/schedule`;

        try {
            const data = await apiClient.fetchJson(url);
            return this._parseSchedule(data, teamId, startDate, endDate);
        } catch (e) {
            global.logError(`[Sports-Applet/${this.getSportName()}] Schedule fetch failed: ${e}`);
            return [];
        }
    }

    async fetchLiveData(apiClient, game) {
        const path = this._getApiPath();
        const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${game.gamePk}`;

        try {
            const data = await apiClient.fetchJson(url);
            return this._parseLiveData(data, game.preferredTeamId);
        } catch (e) {
            global.logError(`[Sports-Applet/${this.getSportName()}] Live data fetch failed: ${e}`);
            return null;
        }
    }

    // --- Game state ---

    parseGameState(game) {
        const state = game.status?.state;

        if (!state) return GameState.SCHEDULED;

        if (state === 'in' || state === 'live') {
            return GameState.LIVE;
        }
        if (state === 'post') {
            return GameState.FINAL;
        }
        if (state === 'postponed') {
            return GameState.POSTPONED;
        }
        if (state === 'cancelled') {
            return GameState.CANCELLED;
        }

        return GameState.SCHEDULED;
    }

    _getStateClass(state) {
        switch (state) {
            case GameState.LIVE: return 'live';
            case GameState.FINAL: return 'final';
            case GameState.SCHEDULED: return 'pre';
            default: return null;
        }
    }

    // --- Display formatting ---

    formatGameDisplay(game, preferredTeamId, timezone) {
        const opponent = this.getOpponent(game, preferredTeamId);
        const isHome = this.isHome(game, preferredTeamId);
        const state = this.parseGameState(game);

        let topLabel = '';
        let bottomLabel = '';

        switch (state) {
            case GameState.LIVE: {
                const prefScore = isHome ? game.home.score : game.away.score;
                const oppScore = isHome ? game.away.score : game.home.score;
                topLabel = `${prefScore} - ${oppScore}`;
                bottomLabel = this._formatLiveDetail(game);
                break;
            }
            case GameState.FINAL: {
                const prefScore = isHome ? game.home.score : game.away.score;
                const oppScore = isHome ? game.away.score : game.home.score;
                topLabel = `${prefScore} - ${oppScore}`;
                bottomLabel = 'Final';
                break;
            }
            case GameState.SCHEDULED: {
                topLabel = isHome ? 'vs' : '@';
                bottomLabel = Utils.formatGameTime(game.startTime, timezone);
                break;
            }
            default: {
                topLabel = state;
                bottomLabel = opponent.abbrev;
            }
        }

        return { topLabel, bottomLabel, stateClass: this._getStateClass(state) };
    }

    // --- Refresh delay ---

    calculateRefreshDelay(gameState, game, liveRefreshMs) {
        const ONE_MINUTE = 60 * 1000;
        const FIVE_MINUTES = 5 * ONE_MINUTE;
        const THIRTY_MINUTES = 30 * ONE_MINUTE;
        const ONE_HOUR = 60 * ONE_MINUTE;

        switch (gameState) {
            case GameState.LIVE: {
                return liveRefreshMs || this._getLivePauseDelay(game);
            }
            case GameState.FINAL: {
                const now = Date.now();
                const midnight = new Date();
                midnight.setHours(24, 0, 0, 0);
                const timeUntilMidnight = midnight.getTime() - now;
                return Math.min(THIRTY_MINUTES, timeUntilMidnight);
            }
            case GameState.SCHEDULED: {
                if (game.startTime) {
                    const timeUntilStart = game.startTime - Date.now();
                    if (timeUntilStart < FIVE_MINUTES) return ONE_MINUTE;
                    if (timeUntilStart < ONE_HOUR) return FIVE_MINUTES;
                }
                return ONE_HOUR;
            }
            default: {
                return ONE_HOUR;
            }
        }
    }

    // --- ESPN response parsing (shared) ---

    _getScore(competitor) {
        if (!competitor.score) return 0;
        if (typeof competitor.score === 'object') {
            return parseInt(competitor.score.value || competitor.score.displayValue || 0);
        }
        return parseInt(competitor.score) || 0;
    }

    _parseEvent(event, preferredTeamId) {
        const comp = event.competitions?.[0];
        if (!comp || !comp.competitors) return null;

        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        if (!home || !away) return null;

        const status = comp.status || {};
        const statusType = status.type || {};
        const state = statusType.state || 'pre';
        const detail = statusType.detail || '';

        const game = {
            gamePk: event.id,
            link: event.id,
            startTime: new Date(event.date),
            preferredTeamId: preferredTeamId,
            home: {
                id: parseInt(home.team.id),
                abbrev: home.team.abbreviation,
                score: this._getScore(home)
            },
            away: {
                id: parseInt(away.team.id),
                abbrev: away.team.abbreviation,
                score: this._getScore(away)
            },
            status: {
                state: state,
                detail: detail
            },
            venue: comp.venue?.fullName || '',
            live: this._parseLiveState(comp, status)
        };

        if (!this._validateParsedGame(game)) return null;
        return game;
    }

    _parseLiveData(data, preferredTeamId) {
        const header = data.header;
        if (!header) return null;

        const comp = header.competitions?.[0];
        if (!comp || !comp.competitors) return null;

        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        if (!home || !away) return null;

        const status = comp.status || {};
        const statusType = status.type || {};
        const state = statusType.state || 'pre';
        const detail = statusType.detail || '';

        const game = {
            gamePk: header.id,
            link: header.id,
            startTime: new Date(header.gameInfo?.startTime || comp.date),
            preferredTeamId: preferredTeamId,
            home: {
                id: parseInt(home.team.id),
                abbrev: home.team.abbreviation,
                score: this._getScore(home)
            },
            away: {
                id: parseInt(away.team.id),
                abbrev: away.team.abbreviation,
                score: this._getScore(away)
            },
            status: {
                state: state,
                detail: detail
            },
            venue: comp.venue?.fullName || '',
            live: this._parseLiveState(comp, status)
        };

        if (!this._validateParsedGame(game)) return null;
        return game;
    }

    _parseSchedule(data, preferredTeamId, startDate, endDate) {
        const dayMap = new Map();

        const events = data.events || [];
        const startMs = startDate.getTime();
        const endMs = endDate.getTime();
        const nowMs = Date.now();

        // Track first future game for offseason countdown
        this._nextSeasonDate = null;

        for (const event of events) {
            const game = this._parseEvent(event, preferredTeamId);
            if (!game) continue;

            const gameMs = game.startTime.getTime();

            // Track earliest future game even if outside the fetch window
            if (gameMs > nowMs) {
                if (!this._nextSeasonDate || gameMs < this._nextSeasonDate.getTime()) {
                    this._nextSeasonDate = new Date(game.startTime);
                }
            }

            if (gameMs < startMs || gameMs > endMs) continue;

            const dateStr = Utils.formatDate(game.startTime);
            if (!dayMap.has(dateStr)) {
                dayMap.set(dateStr, []);
            }
            dayMap.get(dateStr).push(game);
        }

        const days = [];
        for (const [date, games] of dayMap.entries()) {
            days.push({ date, games });
        }

        days.sort((a, b) => a.date.localeCompare(b.date));
        return days;
    }

    // --- Validation (Issue 3A) ---

    _validateParsedGame(game) {
        if (!game) return false;
        if (!game.startTime || isNaN(game.startTime.getTime())) {
            global.log(`[Sports-Applet/${this.getSportName()}] Invalid startTime for game ${game.gamePk}`);
            return false;
        }
        if (!game.home?.id || !game.away?.id) {
            global.log(`[Sports-Applet/${this.getSportName()}] Missing team IDs for game ${game.gamePk}`);
            return false;
        }
        if (!game.home?.abbrev || !game.away?.abbrev) {
            global.log(`[Sports-Applet/${this.getSportName()}] Missing team abbreviations for game ${game.gamePk}`);
            return false;
        }
        return true;
    }
}

var EXPORTS = {
    BaseSport,
    GameState
};
