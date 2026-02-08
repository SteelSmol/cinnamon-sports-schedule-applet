const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;

const APPLET_UUID = 'sports-schedule-applet@steel';

// Get applet directory and add subdirectories to search path
const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
imports.searchPath.unshift(GLib.build_filenamev([appletDir, 'core']));
imports.searchPath.unshift(GLib.build_filenamev([appletDir, 'sports']));

const AppState = imports.AppState.EXPORTS.AppState;
const ApiClient = imports.ApiClient.EXPORTS.ApiClient;
const UpdateScheduler = imports.UpdateScheduler.EXPORTS.UpdateScheduler;
const UIManager = imports.UIManager.EXPORTS.UIManager;
const MLBSport = imports.MLBSport.EXPORTS.MLBSport;
const NFLSport = imports.NFLSport.EXPORTS.NFLSport;
const NHLSport = imports.NHLSport.EXPORTS.NHLSport;
const GameState = imports.BaseSport.EXPORTS.GameState;
const Utils = imports.Utils.EXPORTS;

class SportsScheduleApplet extends Applet.Applet {
    _init(metadata, orientation, panelHeight, instanceId) {
        super._init(orientation, panelHeight, instanceId);

        this._metadata = metadata;
        this._orientation = orientation;

        this._appState = new AppState();
        this._apiClient = new ApiClient();
        this._scheduler = new UpdateScheduler(() => this._performUpdate());
        this._uiManager = new UIManager(this, this._appState, this._apiClient);

        // Map<sportKey, {sport, teamId}>
        this._sports = new Map();

        this.actor.add_style_class_name('Sports-Schedule-Applet');
        this._uiManager.createPanelElements();

        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, this._orientation);
        this.menuManager.addMenu(this.menu);

        this.actor.connect('button-press-event', () => this._onAppletClicked());
        this.actor.connect('enter-event', () => this._onHoverEnter());
        this.actor.connect('leave-event', () => this._onHoverLeave());

        this._settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this._bindSettings();

        this._initializeSports();
        this._scheduler.scheduleUpdate(0);
    }

    _bindSettings() {
        this._settings.bind('enable-mlb', '_enableMlb', () => this._onSportOrTeamChanged());
        this._settings.bind('enable-nfl', '_enableNfl', () => this._onSportOrTeamChanged());
        this._settings.bind('enable-nhl', '_enableNhl', () => this._onSportOrTeamChanged());
        this._settings.bind('mlb-team', '_mlbTeamCode', () => this._onSportOrTeamChanged());
        this._settings.bind('nfl-team', '_nflTeamCode', () => this._onSportOrTeamChanged());
        this._settings.bind('nhl-team', '_nhlTeamCode', () => this._onSportOrTeamChanged());
        this._settings.bind('time-zone', '_timeZone', () => this._onSettingsChanged());
        this._settings.bind('live-refresh', '_liveRefresh', () => this._onSettingsChanged());
        this._settings.bind('icon-size', '_iconSize', () => this._onAppearanceChanged());
        this._settings.bind('text-size', '_textSize', () => this._onAppearanceChanged());
        this._settings.bind('hide-offseason', '_hideOffseason');
        this._settings.bind('debug-mode', '_debugMode', () => this._onSettingsChanged());

        // Defaults
        if (this._enableMlb === undefined) this._enableMlb = true;
        if (this._enableNfl === undefined) this._enableNfl = true;
        if (this._enableNhl === undefined) this._enableNhl = true;
        this._mlbTeamCode = this._mlbTeamCode || 'pit';
        this._nflTeamCode = this._nflTeamCode || 'pit';
        this._nhlTeamCode = this._nhlTeamCode || 'pit';
        this._timeZone = this._timeZone || '';
        this._liveRefresh = this._liveRefresh || 5;
        this._iconSize = this._iconSize || 42;
        this._textSize = this._textSize || 10;
    }

    _onSportOrTeamChanged() {
        this._initializeSports();
        this._appState.reset();
        this._scheduler.scheduleUpdate(0);
    }

    _onSettingsChanged() {
        this._scheduler.scheduleUpdate(0);
    }

    _onAppearanceChanged() {
        this._uiManager.applySizes();
    }

    _initializeSports() {
        global.log(`[Sports-Applet] Initializing sports...`);
        this._sports.clear();

        const sportDefs = [
            { key: 'mlb', enabled: this._enableMlb, SportClass: MLBSport, teamCode: this._mlbTeamCode },
            { key: 'nfl', enabled: this._enableNfl, SportClass: NFLSport, teamCode: this._nflTeamCode },
            { key: 'nhl', enabled: this._enableNhl, SportClass: NHLSport, teamCode: this._nhlTeamCode }
        ];

        const sportConfigs = [];

        for (const def of sportDefs) {
            if (!def.enabled) continue;

            const sport = new def.SportClass();
            const teamId = this._getTeamIdByCode(sport, def.teamCode);
            global.log(`[Sports-Applet] ${def.key.toUpperCase()} - Team code: ${def.teamCode}, Team ID: ${teamId}`);

            this._sports.set(def.key, { sport, teamId });
            sportConfigs.push({ sportKey: def.key, sport, teamId });
        }

        this._uiManager.rebuildCards(sportConfigs);

        // Hide applet if no sports enabled
        this.actor.visible = sportConfigs.length > 0;
    }

    _getTeamIdByCode(sport, code) {
        if (!sport || !code) return null;
        const team = sport.getTeams().find(t => t.code === code.toLowerCase());
        return team ? team.id : null;
    }

    _performUpdate() {
        if (this._appState.isUpdating()) {
            this._scheduler.scheduleUpdate(30 * 1000);
            return;
        }

        this._appState.setUpdating(true);
        this._appState.setLastUpdateTime(Date.now());

        this._updateAllSports()
            .catch(async (err) => {
                global.logError(`[Sports-Applet] Update error: ${err}`);
                this._scheduler.scheduleUpdate(5 * 60 * 1000);
            })
            .finally(() => {
                this._appState.setUpdating(false);
            });
    }

    async _updateAllSports() {
        const sportEntries = Array.from(this._sports.entries());

        if (sportEntries.length === 0) {
            return;
        }

        let results;

        if (this._debugMode) {
            // Debug mode: generate mock data instead of fetching
            results = this._generateDebugResults(sportEntries);
        } else {
            // Normal mode: fetch all sports in parallel
            const resultPromises = sportEntries.map(([sportKey, { sport, teamId }]) =>
                this._updateSportInfo(sportKey, sport, teamId)
            );
            results = await Promise.all(resultPromises);
        }

        // Update display with all results
        await this._uiManager.updateDisplay(results);

        // Update tooltip from current games
        this._uiManager.updateTooltipFromGames(results, this._timeZone);

        // Schedule next update using minimum delay
        const schedulerResults = results.map(r => ({
            sport: r.sport,
            game: r.game,
            hasError: !!r.error
        }));
        this._scheduler.scheduleNextUpdate(schedulerResults, this._liveRefresh * 1000);
    }

    _generateDebugResults(sportEntries) {
        const mode = this._debugMode;
        // Mixed mode assigns different states per sport index
        const mixedStates = ['live', 'pre', 'final'];

        return sportEntries.map(([sportKey, { sport, teamId }], index) => {
            const state = (mode === 'mixed') ? mixedStates[index % 3] : mode;
            return this._createMockResult(sportKey, sport, teamId, state);
        });
    }

    _createMockResult(sportKey, sport, teamId, state) {
        const result = {
            sportKey,
            sport,
            teamId,
            game: null,
            error: false,
            isOffseason: false,
            nextSeasonDate: null,
            timezone: this._timeZone
        };

        if (state === 'offseason') {
            result.isOffseason = true;
            const future = new Date();
            future.setDate(future.getDate() + 47);
            result.nextSeasonDate = future;
            return result;
        }

        // Pick an opponent (first team in the list that isn't the preferred team)
        const teams = sport.getTeams();
        const teamData = sport.getTeamById(teamId);
        const opponent = teams.find(t => t.id !== teamId) || teams[0];

        const now = new Date();

        if (state === 'live') {
            result.game = {
                gamePk: `debug-${sportKey}`,
                startTime: new Date(now.getTime() - 90 * 60 * 1000), // started 90min ago
                preferredTeamId: teamId,
                home: {
                    id: teamId,
                    abbrev: teamData?.abbrev || 'HOME',
                    score: 4
                },
                away: {
                    id: opponent.id,
                    abbrev: opponent.abbrev,
                    score: 2
                },
                status: { state: 'in', detail: 'In Progress' },
                venue: 'Debug Arena',
                live: this._getMockLiveState(sportKey)
            };
        } else if (state === 'final') {
            result.game = {
                gamePk: `debug-${sportKey}`,
                startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3hrs ago
                preferredTeamId: teamId,
                home: {
                    id: teamId,
                    abbrev: teamData?.abbrev || 'HOME',
                    score: 6
                },
                away: {
                    id: opponent.id,
                    abbrev: opponent.abbrev,
                    score: 3
                },
                status: { state: 'post', detail: 'Final' },
                venue: 'Debug Arena',
                live: null
            };
        } else if (state === 'pre') {
            const gameTime = new Date(now);
            gameTime.setHours(19, 10, 0, 0);
            if (gameTime < now) gameTime.setDate(gameTime.getDate() + 1);

            result.game = {
                gamePk: `debug-${sportKey}`,
                startTime: gameTime,
                preferredTeamId: teamId,
                home: {
                    id: opponent.id,
                    abbrev: opponent.abbrev,
                    score: 0
                },
                away: {
                    id: teamId,
                    abbrev: teamData?.abbrev || 'AWAY',
                    score: 0
                },
                status: { state: 'pre', detail: 'Scheduled' },
                venue: 'Debug Arena',
                live: null
            };
        }

        return result;
    }

    _getMockLiveState(sportKey) {
        switch (sportKey) {
            case 'mlb':
                return { inning: 5, inningState: 'Top 5th' };
            case 'nfl':
                return { quarter: 3, clock: '7:42', isHalftime: false };
            case 'nhl':
                return { period: 2, periodTime: '12:33', isIntermission: false };
            default:
                return null;
        }
    }

    async _updateSportInfo(sportKey, sport, teamId) {
        const result = {
            sportKey,
            sport,
            teamId,
            game: null,
            error: false,
            isOffseason: false,
            nextSeasonDate: null,
            timezone: this._timeZone
        };

        if (!sport || !teamId) {
            return result;
        }

        try {
            const game = await this._fetchCurrentGame(sportKey, sport, teamId);
            result.game = game;
            this._appState.setCurrentGame(sportKey, game);

            // Detect offseason
            if (!game) {
                const schedule = this._appState.getScheduleCache(sportKey);
                result.isOffseason = !schedule || !schedule.some(day => day.games && day.games.length > 0);
                if (result.isOffseason) {
                    result.nextSeasonDate = sport._nextSeasonDate || null;
                }
            }
        } catch (err) {
            global.logError(`[Sports-Applet] ${sportKey} update error: ${err}`);
            result.error = true;
        }

        return result;
    }

    async _fetchCurrentGame(sportKey, sport, teamId) {
        const cachedGame = this._appState.getCurrentGame(sportKey);

        if (cachedGame && this._isCacheValid(sport, cachedGame)) {
            const liveData = await sport.fetchLiveData(this._apiClient, cachedGame);
            return liveData || cachedGame;
        }

        if (cachedGame && !this._isCacheValid(sport, cachedGame)) {
            this._appState.setCurrentGame(sportKey, null);
        }

        const schedule = await this._fetchSchedule(sportKey, sport, teamId);
        this._appState.setScheduleCache(sportKey, schedule);

        const game = this._findRelevantGame(sport, schedule);
        if (!game) return null;

        const liveData = await sport.fetchLiveData(this._apiClient, game);
        return liveData || game;
    }

    async _fetchSchedule(sportKey, sport, teamId) {
        const CACHE_VALIDITY = 30 * 60 * 1000;

        if (this._appState.isScheduleCacheValid(sportKey, CACHE_VALIDITY)) {
            return this._appState.getScheduleCache(sportKey);
        }

        const today = new Date();
        const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

        const schedule = await sport.fetchSchedule(this._apiClient, teamId, today, endDate);
        return schedule;
    }

    _findRelevantGame(sport, schedule) {
        if (!schedule || schedule.length === 0) return null;

        const today = Utils.formatDate(new Date());
        const now = Date.now();
        const FIVE_HOURS = 5 * 60 * 60 * 1000;

        // First pass: Look for LIVE games
        for (const day of schedule) {
            if (!day.games || day.games.length === 0) continue;

            for (const game of day.games) {
                const state = sport.parseGameState(game);

                if (state === GameState.LIVE) {
                    return game;
                }
            }
        }

        // Second pass: Look for FINAL games from today only (within 5 hours)
        for (const day of schedule) {
            if (!day.games || day.games.length === 0) continue;
            if (day.date !== today) continue;

            for (const game of day.games) {
                const state = sport.parseGameState(game);

                if (state === GameState.FINAL) {
                    const gameDate = Utils.formatDate(new Date(game.startTime));
                    if (gameDate !== today) continue;

                    const timeSinceStart = now - game.startTime.getTime();
                    if (timeSinceStart > 0 && timeSinceStart < FIVE_HOURS) {
                        return game;
                    }
                }
            }
        }

        // Third pass: Look for SCHEDULED games, prioritizing today's games first
        for (const day of schedule) {
            if (!day.games || day.games.length === 0) continue;

            if (day.date === today) {
                for (const game of day.games) {
                    const state = sport.parseGameState(game);
                    if (state === GameState.SCHEDULED) {
                        return game;
                    }
                }
            }
        }

        // Fourth pass: Look for any other SCHEDULED games (future games)
        for (const day of schedule) {
            if (!day.games || day.games.length === 0) continue;
            if (day.date === today) continue;

            for (const game of day.games) {
                const state = sport.parseGameState(game);
                if (state === GameState.SCHEDULED) {
                    return game;
                }
            }
        }

        return null;
    }

    _isCacheValid(sport, game) {
        if (!game || !game.startTime) return false;

        const state = sport.parseGameState(game);
        const age = Date.now() - this._appState.getLastUpdateTime();

        const today = Utils.formatDate(new Date());
        const gameDate = Utils.formatDate(new Date(game.startTime));
        if (gameDate !== today) return false;

        if (state === GameState.FINAL) {
            return age < 60 * 60 * 1000;
        }

        if (state === GameState.LIVE) {
            return age < 5 * 60 * 1000;
        }

        return age < 5 * 60 * 1000;
    }

    _onHoverEnter() {
        this._updateHoverTooltip().catch(err => {
            global.logError(`[Sports-Applet] Hover tooltip error: ${err}`);
        });
    }

    _onHoverLeave() {
        // Restore normal tooltip from current games
        const results = [];
        for (const [sportKey, { sport, teamId }] of this._sports) {
            const game = this._appState.getCurrentGame(sportKey);
            results.push({ sportKey, sport, teamId, game });
        }
        this._uiManager.updateTooltipFromGames(results, this._timeZone);
    }

    async _updateHoverTooltip() {
        const results = [];
        for (const [sportKey, { sport, teamId }] of this._sports) {
            const schedule = this._appState.getScheduleCache(sportKey);
            results.push({ sportKey, sport, teamId, schedule });
        }

        if (results.length === 0) {
            this.set_applet_tooltip('No sports enabled');
            return;
        }

        this._uiManager.updateTooltipWithSchedule(results, this._timeZone);
    }

    async _onAppletClicked() {
        if (!this.menu) return;

        try {
            const results = [];
            for (const [sportKey, { sport, teamId }] of this._sports) {
                let schedule = this._appState.getScheduleCache(sportKey);
                if (!schedule) {
                    schedule = await this._fetchSchedule(sportKey, sport, teamId);
                }
                results.push({ sportKey, sport, teamId, schedule });
            }
            this._uiManager.populateUpcomingGamesMenu(this.menu, results, this._timeZone);
        } catch (err) {
            global.logError(`[Sports-Applet] Menu populate error: ${err}`);
            this.menu.removeAll();
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Unable to load schedule'));
        }
        this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        this._cleanup();
    }

    _cleanup() {
        this._scheduler.cleanup();
        this._apiClient.cleanup();
        this._appState.cleanup();
        this._uiManager.cleanup();

        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new SportsScheduleApplet(metadata, orientation, panelHeight, instanceId);
}
