const { GLib } = imports.gi;

const APPLET_UUID = 'sports-schedule-applet@steel';

// Add applet path to search path for cross-directory imports
const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
if (imports.searchPath.indexOf(appletDir) === -1) {
    imports.searchPath.unshift(GLib.build_filenamev([appletDir, 'sports']));
}

const GameState = imports.BaseSport.EXPORTS.GameState;

class UpdateScheduler {
    constructor(updateCallback) {
        this._updateCallback = updateCallback;
        this._timeoutId = null;
        this._midnightTimeoutId = null;
        this._scheduleMidnightUpdate();
    }

    _scheduleMidnightUpdate() {
        // Cancel any existing midnight update
        if (this._midnightTimeoutId) {
            GLib.Source.remove(this._midnightTimeoutId);
            this._midnightTimeoutId = null;
        }

        // Calculate time until midnight
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = midnight.getTime() - now.getTime();

        // Schedule update at midnight to refresh for new day
        this._midnightTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, msUntilMidnight, () => {
            global.log(`[Sports-Applet/UpdateScheduler] Midnight reached, forcing update`);
            if (this._updateCallback) {
                this._updateCallback();
            }
            // Schedule next midnight update
            this._scheduleMidnightUpdate();
            return GLib.SOURCE_REMOVE;
        });
    }

    scheduleUpdate(delayMs) {
        this.cancel();

        const delaySec = Math.max(1, Math.floor(delayMs / 1000));

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delaySec, () => {
            this._timeoutId = null;
            if (this._updateCallback) {
                this._updateCallback();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    scheduleNextUpdate(sportResults, liveRefreshMs) {
        if (!sportResults || sportResults.length === 0) {
            this.scheduleUpdate(this._getTimeUntilMidnight());
            return;
        }

        let minDelay = Infinity;

        for (const result of sportResults) {
            const { sport, game, hasError } = result;

            if (hasError) {
                minDelay = Math.min(minDelay, 5 * 60 * 1000);
                continue;
            }

            if (!game) {
                minDelay = Math.min(minDelay, this._getTimeUntilMidnight());
                continue;
            }

            const state = sport.parseGameState(game);
            const delay = sport.calculateRefreshDelay(state, game, liveRefreshMs);
            minDelay = Math.min(minDelay, delay);
        }

        if (minDelay === Infinity) {
            minDelay = this._getTimeUntilMidnight();
        }

        this.scheduleUpdate(minDelay);
    }

    cancel() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    cancelAll() {
        this.cancel();
        if (this._midnightTimeoutId) {
            GLib.Source.remove(this._midnightTimeoutId);
            this._midnightTimeoutId = null;
        }
    }

    _getTimeUntilMidnight() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return Math.max(60 * 1000, midnight.getTime() - now.getTime());
    }

    cleanup() {
        this.cancelAll();
        this._updateCallback = null;
    }
}

var EXPORTS = { UpdateScheduler };
