const { GLib } = imports.gi;
const APPLET_UUID = 'sports-schedule-applet@steel';

// Add applet path to search path for cross-directory imports
const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
if (imports.searchPath.indexOf(appletDir) === -1) {
    imports.searchPath.unshift(appletDir);
    imports.searchPath.unshift(GLib.build_filenamev([appletDir, 'sports']));
}

const BaseSport = imports.BaseSport.EXPORTS.BaseSport;

class MLBSport extends BaseSport {
    constructor() {
        super('mlb-teams.json');
    }

    getSportName() {
        return 'MLB';
    }

    _getApiPath() {
        return 'baseball/mlb';
    }

    getTeamLogoUrl(teamId) {
        return `https://a.espncdn.com/i/teamlogos/mlb/500/${this._getCodeById(teamId)}.png`;
    }

    _parseLiveState(comp, status) {
        const statusType = status.type || {};
        if (statusType.state !== 'in') return null;
        const detail = statusType.detail || '';
        const outsMatch = detail.match(/(\d)\s*Out/);
        return {
            inning: status.period || 1,
            inningState: detail,
            outs: outsMatch ? parseInt(outsMatch[1]) : 0
        };
    }

    _formatLiveDetail(game) {
        if (!game.live) return '';
        const half = game.live.inningState?.includes('Top') ? 'Top' : 'Bot';
        const outs = Math.min(game.live.outs || 0, 3);
        const dots = '\u25CF'.repeat(outs) + '\u25CB'.repeat(3 - outs);
        return `${half} ${game.live.inning}\n${dots}`;
    }
}

var EXPORTS = { MLBSport };
