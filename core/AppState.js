const APPLET_UUID = 'sports-schedule-applet@steel';

class AppState {
    constructor() {
        this._currentGames = new Map();      // sportKey -> game
        this._scheduleCaches = new Map();     // sportKey -> schedule
        this._scheduleCacheTimes = new Map(); // sportKey -> timestamp
        this._iconCache = new Map();
        this._lastUpdateTime = 0;
        this._isUpdating = false;
        this._listeners = new Map();
    }

    getCurrentGame(sportKey) {
        return this._currentGames.get(sportKey) || null;
    }

    setCurrentGame(sportKey, game) {
        this._currentGames.set(sportKey, game);
        this._notifyListeners('game-changed', { sportKey, game });
    }

    getScheduleCache(sportKey) {
        return this._scheduleCaches.get(sportKey) || null;
    }

    setScheduleCache(sportKey, schedule) {
        this._scheduleCaches.set(sportKey, schedule);
        this._scheduleCacheTimes.set(sportKey, Date.now());
    }

    isScheduleCacheValid(sportKey, maxAgeMs) {
        const schedule = this._scheduleCaches.get(sportKey);
        const cacheTime = this._scheduleCacheTimes.get(sportKey);
        if (!schedule || !cacheTime) {
            return false;
        }
        return (Date.now() - cacheTime) < maxAgeMs;
    }

    invalidateScheduleCache(sportKey) {
        if (sportKey) {
            this._scheduleCaches.delete(sportKey);
            this._scheduleCacheTimes.delete(sportKey);
        } else {
            this._scheduleCaches.clear();
            this._scheduleCacheTimes.clear();
        }
    }

    getTeamIcon(teamId) {
        return this._iconCache.get(teamId);
    }

    setTeamIcon(teamId, iconPath) {
        this._iconCache.set(teamId, iconPath);

        const MAX_CACHE_SIZE = 50;
        if (this._iconCache.size > MAX_CACHE_SIZE) {
            const firstKey = this._iconCache.keys().next().value;
            this._iconCache.delete(firstKey);
        }
    }

    clearIconCache() {
        this._iconCache.clear();
    }

    getLastUpdateTime() {
        return this._lastUpdateTime;
    }

    setLastUpdateTime(time) {
        this._lastUpdateTime = time;
    }

    isUpdating() {
        return this._isUpdating;
    }

    setUpdating(updating) {
        this._isUpdating = updating;
    }

    addEventListener(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
    }

    removeEventListener(event, callback) {
        if (!this._listeners.has(event)) return;

        const listeners = this._listeners.get(event);
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    _notifyListeners(event, data) {
        if (!this._listeners.has(event)) return;

        for (const callback of this._listeners.get(event)) {
            try {
                callback(data);
            } catch (e) {
                global.logError(`[Sports-Applet/AppState] Event listener error: ${e}`);
            }
        }
    }

    resetSport(sportKey) {
        this._currentGames.delete(sportKey);
        this._scheduleCaches.delete(sportKey);
        this._scheduleCacheTimes.delete(sportKey);
    }

    reset() {
        this._currentGames.clear();
        this._scheduleCaches.clear();
        this._scheduleCacheTimes.clear();
        this._lastUpdateTime = 0;
        this._isUpdating = false;
        this._notifyListeners('state-reset', null);
    }

    cleanup() {
        this.reset();
        this._iconCache.clear();
        this._listeners.clear();
    }
}

var EXPORTS = { AppState };
