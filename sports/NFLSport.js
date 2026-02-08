const { GLib } = imports.gi;
const APPLET_UUID = 'sports-schedule-applet@steel';

// Add applet path to search path for cross-directory imports
const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
if (imports.searchPath.indexOf(appletDir) === -1) {
    imports.searchPath.unshift(appletDir);
    imports.searchPath.unshift(GLib.build_filenamev([appletDir, 'sports']));
}

const BaseSport = imports.BaseSport.EXPORTS.BaseSport;

class NFLSport extends BaseSport {
    constructor() {
        super('nfl-teams.json');
    }

    getSportName() {
        return 'NFL';
    }

    _getApiPath() {
        return 'football/nfl';
    }

    getTeamLogoUrl(teamId) {
        return `https://a.espncdn.com/i/teamlogos/nfl/500/${this._getCodeById(teamId)}.png`;
    }

    _parseLiveState(comp, status) {
        const statusType = status.type || {};
        if (statusType.state !== 'in') return null;
        return {
            quarter: status.period || 1,
            clock: status.displayClock || '',
            isHalftime: (statusType.detail || '').includes('Halftime')
        };
    }

    _formatLiveDetail(game) {
        if (!game.live) return '';
        if (game.live.isHalftime) return 'Halftime';

        const qtrNames = ['1st', '2nd', '3rd', '4th', 'OT'];
        const qtrStr = game.live.quarter <= 4 ? qtrNames[game.live.quarter - 1] : 'OT';
        return `${qtrStr} ${game.live.clock}`;
    }

    _getLivePauseDelay(game) {
        const ONE_MINUTE = 60 * 1000;
        return game.live?.isHalftime ? 5 * ONE_MINUTE : ONE_MINUTE;
    }
}

var EXPORTS = { NFLSport };
