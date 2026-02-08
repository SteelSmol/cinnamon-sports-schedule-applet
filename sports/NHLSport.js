const { GLib } = imports.gi;
const APPLET_UUID = 'sports-schedule-applet@steel';

// Add applet path to search path for cross-directory imports
const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
if (imports.searchPath.indexOf(appletDir) === -1) {
    imports.searchPath.unshift(appletDir);
    imports.searchPath.unshift(GLib.build_filenamev([appletDir, 'sports']));
}

const BaseSport = imports.BaseSport.EXPORTS.BaseSport;

class NHLSport extends BaseSport {
    constructor() {
        super('nhl-teams.json');
    }

    getSportName() {
        return 'NHL';
    }

    _getApiPath() {
        return 'hockey/nhl';
    }

    getTeamLogoUrl(teamId) {
        return `https://a.espncdn.com/i/teamlogos/nhl/500/${this._getCodeById(teamId)}.png`;
    }

    _parseLiveState(comp, status) {
        const statusType = status.type || {};
        if (statusType.state !== 'in') return null;
        const detail = statusType.detail || '';
        return {
            period: status.period || 1,
            periodTime: status.displayClock || '',
            isIntermission: detail.includes('Intermission') || detail.includes('intermission')
        };
    }

    _formatLiveDetail(game) {
        if (!game.live) return '';
        if (game.live.isIntermission) return 'Intermission';

        const periodNames = ['1st', '2nd', '3rd'];
        const periodStr = game.live.period <= 3 ? periodNames[game.live.period - 1] : `OT${game.live.period - 3}`;
        return game.live.periodTime ? `${periodStr} ${game.live.periodTime}` : periodStr;
    }

    _getLivePauseDelay(game) {
        const ONE_MINUTE = 60 * 1000;
        return game.live?.isIntermission ? 2 * ONE_MINUTE : ONE_MINUTE;
    }
}

var EXPORTS = { NHLSport };
