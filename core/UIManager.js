const { St, Gio, GLib } = imports.gi;
const PopupMenu = imports.ui.popupMenu;

const APPLET_UUID = 'sports-schedule-applet@steel';

// Add sports path for BaseSport/GameState import
const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
const sportsDir = GLib.build_filenamev([appletDir, 'sports']);
if (imports.searchPath.indexOf(sportsDir) === -1) {
    imports.searchPath.unshift(sportsDir);
}

const Utils = imports.Utils.EXPORTS;
const GameState = imports.BaseSport.EXPORTS.GameState;

class UIManager {
    constructor(applet, appState, apiClient) {
        this._applet = applet;
        this._appState = appState;
        this._apiClient = apiClient;
        this._container = null;
        this._sportCards = [];  // [{sportKey, elements: {box, teamIcon, ...}, flashTimer, lastScore}]
    }

    createPanelElements() {
        this._container = new St.BoxLayout({
            style_class: 'sports-applet-container',
            reactive: true,
            can_focus: true
        });
        this._applet.actor.add_child(this._container);
    }

    rebuildCards(sportConfigs) {
        // sportConfigs: [{sportKey, sport, teamId}]
        this._destroyCards();

        for (let i = 0; i < sportConfigs.length; i++) {
            if (i > 0) {
                const separator = new St.Widget({
                    style_class: 'sports-separator'
                });
                this._container.add_child(separator);
            }

            const config = sportConfigs[i];
            const card = this._createCard(config.sportKey);
            this._sportCards.push(card);
        }

        this.applySizes();
    }

    _createCard(sportKey) {
        const iconSize = this._applet._iconSize || 42;
        const fullColor = St.IconType.FULLCOLOR;

        const box = new St.BoxLayout({
            style_class: 'sports-applet-box',
            reactive: true,
            can_focus: true
        });

        const teamIcon = new St.Icon({
            style_class: 'sports-logo-icon',
            icon_size: iconSize,
            icon_type: fullColor
        });

        const middleContainer = new St.BoxLayout({ vertical: true });

        const dateLabel = new St.Label({
            text: '',
            style_class: 'sports-date-label'
        });

        const topRow = new St.BoxLayout({ vertical: false });

        const topLabel = new St.Label({
            text: 'Loading\u2026',
            style_class: 'sports-label'
        });

        topRow.add_child(topLabel);

        const bottomLabel = new St.Label({
            text: '',
            style_class: 'sports-label sports-label-secondary'
        });

        middleContainer.add(dateLabel, { x_fill: false, x_align: St.Align.MIDDLE });
        middleContainer.add(topRow, { x_fill: false, x_align: St.Align.MIDDLE });
        middleContainer.add(bottomLabel, { x_fill: false, x_align: St.Align.MIDDLE });

        const oppIcon = new St.Icon({
            style_class: 'sports-logo-icon',
            icon_size: iconSize,
            icon_type: fullColor
        });

        box.add(teamIcon, { y_align: St.Align.MIDDLE });
        box.add(middleContainer, { x_fill: true, x_expand: true, y_align: St.Align.MIDDLE });
        box.add(oppIcon, { y_align: St.Align.MIDDLE });

        this._container.add_child(box);

        const elements = { box, teamIcon, middleContainer, dateLabel, topRow, topLabel, bottomLabel, oppIcon };

        return { sportKey, elements, flashTimer: null, lastScore: null };
    }

    _destroyCards() {
        for (const card of this._sportCards) {
            if (card.flashTimer) {
                GLib.source_remove(card.flashTimer);
                card.flashTimer = null;
            }
        }
        this._sportCards = [];

        if (this._container) {
            this._container.destroy_all_children();
        }
    }

    applySizes() {
        const iconSize = this._applet._iconSize || 42;
        const textSize = this._applet._textSize || 10;

        for (const card of this._sportCards) {
            const { box, teamIcon, oppIcon } = card.elements;
            box.set_style(`font-size: ${textSize}pt;`);
            teamIcon.set_icon_size(iconSize);
            teamIcon.set_style(`min-width: ${iconSize}px; min-height: ${iconSize}px;`);
            oppIcon.set_icon_size(iconSize);
            oppIcon.set_style(`min-width: ${iconSize}px; min-height: ${iconSize}px;`);
        }
    }

    async updateDisplay(sportResults) {
        // sportResults: [{sportKey, sport, teamId, game, error, isOffseason, nextSeasonDate}]
        if (!this._container) return;

        // Clear all state classes from applet actor (no longer per-actor)
        this._applet.actor.remove_style_class_name('live-game');
        this._applet.actor.remove_style_class_name('pre-game');
        this._applet.actor.remove_style_class_name('final-game');

        for (const result of sportResults) {
            const card = this._sportCards.find(c => c.sportKey === result.sportKey);
            if (!card) continue;

            await this._updateCardDisplay(card, result);
        }
    }

    async _updateCardDisplay(card, result) {
        const { sport, teamId, game, error, isOffseason, nextSeasonDate, timezone } = result;
        const els = card.elements;

        // Reset layout for this card
        this._setCardOffseasonLayout(card, false);
        this._setCardStateClass(card, null);

        if (error) {
            els.dateLabel.set_text('');
            els.topLabel.set_text(`${sport.getSportName()} ?`);
            els.bottomLabel.set_text('API Error');
            els.teamIcon.visible = false;
            els.oppIcon.visible = false;
            return;
        }

        // Detect offseason: no game at all, or next game >30 days away
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const showOffseason = (isOffseason && !game) ||
            (game && game.startTime.getTime() - Date.now() > THIRTY_DAYS);

        if (showOffseason) {
            const teamData = sport.getTeamById(teamId);
            this._setCardOffseasonLayout(card, true);
            const countdownDate = nextSeasonDate || (game ? game.startTime : null);
            els.bottomLabel.set_text(this._formatCountdown(countdownDate));
            els.teamIcon.visible = !!teamData;
            if (teamId) {
                await this._loadCardTeamIcon(card, sport, teamId);
            }
            return;
        }

        if (!game) {
            const teamData = sport.getTeamById(teamId);
            els.dateLabel.set_text('Today');
            els.topLabel.set_text(`${teamData?.abbrev || sport.getSportName()}: \u2014`);
            els.bottomLabel.set_text('Day Off');
            els.teamIcon.visible = !!teamData;
            els.oppIcon.visible = false;
            if (teamId) {
                await this._loadCardTeamIcon(card, sport, teamId);
            }
            return;
        }

        const display = sport.formatGameDisplay(game, teamId, timezone);

        // Set date label — hide for live games (it's obvious)
        if (display.stateClass === 'live') {
            els.dateLabel.set_text('');
            els.dateLabel.visible = false;
        } else {
            els.dateLabel.visible = true;
            const gameDate = new Date(game.startTime);
            const today = new Date();
            const isToday = gameDate.toDateString() === today.toDateString();

            if (isToday) {
                els.dateLabel.set_text('Today');
            } else {
                const dateStr = gameDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric'
                });
                els.dateLabel.set_text(dateStr);
            }
        }

        els.topLabel.set_text(display.topLabel);
        els.bottomLabel.set_text(display.bottomLabel);

        const opponent = sport.getOpponent(game, teamId);

        this._setCardStateClass(card, display.stateClass);

        // Dim icons for final games
        const iconOpacity = display.stateClass === 'final' ? 180 : 255;
        els.teamIcon.set_opacity(iconOpacity);
        els.oppIcon.set_opacity(iconOpacity);

        // Flash the card red briefly when live score changes
        if (display.stateClass === 'live' && game) {
            const isHome = sport.isHome(game, teamId);
            const currentScore = `${game.home.score}-${game.away.score}`;
            if (card.lastScore !== null && card.lastScore !== currentScore) {
                this._flashCard(card);
            }
            card.lastScore = currentScore;
        } else {
            card.lastScore = null;
        }

        els.teamIcon.visible = true;
        els.oppIcon.visible = !!opponent;

        await this._loadCardIcons(card, sport, game, teamId);
    }

    _formatCountdown(nextDate) {
        if (!nextDate) return 'Offseason';

        const diff = nextDate.getTime() - Date.now();
        if (diff <= 0) return 'Offseason';

        const days = Math.ceil(diff / (24 * 60 * 60 * 1000));

        if (days <= 14) {
            const dateStr = nextDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric'
            });
            return `Opens: ${dateStr}`;
        }

        return `Opens: ${days}d`;
    }

    _flashCard(card) {
        // Cancel any existing flash
        if (card.flashTimer) {
            GLib.source_remove(card.flashTimer);
            card.flashTimer = null;
        }

        const box = card.elements?.box;
        if (!box) return;

        // Apply red flash highlight
        box.add_style_class_name('sports-update-flash');

        // Remove after 1.5 seconds to let CSS transition fade it
        card.flashTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            if (card.elements?.box) {
                card.elements.box.remove_style_class_name('sports-update-flash');
            }
            card.flashTimer = null;
            return false;
        });
    }

    async _loadCardTeamIcon(card, sport, teamId) {
        try {
            const iconSize = this._applet._iconSize || 42;
            const icon = await this._getIcon(sport, teamId);
            if (card.elements.teamIcon && icon) {
                card.elements.teamIcon.set_gicon(icon);
                card.elements.teamIcon.set_icon_size(iconSize);
            }
        } catch (e) {
            global.logError(`[Sports-Applet/UI] Error loading team icon: ${e}`);
        }
    }

    async _loadCardIcons(card, sport, game, teamId) {
        await this._loadCardTeamIcon(card, sport, teamId);

        try {
            const iconSize = this._applet._iconSize || 42;
            const opponent = sport.getOpponent(game, teamId);
            if (opponent) {
                const oppIcon = await this._getIcon(sport, opponent.id);
                if (card.elements.oppIcon && oppIcon) {
                    card.elements.oppIcon.set_gicon(oppIcon);
                    card.elements.oppIcon.set_icon_size(iconSize);
                }
            }
        } catch (e) {
            global.logError(`[Sports-Applet/UI] Error loading opponent icon: ${e}`);
        }
    }

    async _getIcon(sport, teamId) {
        const sportName = sport.getSportName();
        const cacheKey = `${sportName}:${teamId}`;
        const cached = this._appState.getTeamIcon(cacheKey);
        if (cached) {
            const iconFile = Gio.File.new_for_path(cached);
            if (iconFile.query_exists(null)) {
                return new Gio.FileIcon({ file: iconFile });
            }
        }

        try {
            const teamData = sport.getTeamById(teamId);
            const teamAbbrev = teamData?.abbrev || teamId;

            const cacheDir = this._getCacheDir(sportName);
            const dir = Gio.File.new_for_path(cacheDir);
            if (!dir.query_exists(null)) {
                try {
                    dir.make_directory_with_parents(null);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                        throw e;
                    }
                }
            }

            const url = sport.getTeamLogoUrl(teamId);

            let ext = '.png';
            if (url.endsWith('.svg')) {
                ext = '.svg';
            } else if (url.endsWith('.png')) {
                ext = '.png';
            }

            const destPath = `${cacheDir}/${teamAbbrev}${ext}`;

            await this._apiClient.downloadFile(url, destPath);

            const iconFile = Gio.File.new_for_path(destPath);
            if (iconFile.query_exists(null)) {
                this._appState.setTeamIcon(cacheKey, destPath);
                return new Gio.FileIcon({ file: iconFile });
            }
        } catch (e) {
            global.logError(`[Sports-Applet/UI] Icon download failed: ${e}`);
        }

        return null;
    }

    _getCacheDir(sportName = null) {
        const appletDir = imports.ui.appletManager.appletMeta[APPLET_UUID].path;
        if (sportName) {
            return GLib.build_filenamev([appletDir, 'assets', sportName.toLowerCase()]);
        }
        return GLib.build_filenamev([appletDir, 'assets']);
    }

    updateTooltipWithSchedule(sportResults, timezone) {
        // sportResults: [{sportKey, sport, teamId, schedule}]
        const lines = [];

        for (const result of sportResults) {
            const { sport, teamId, schedule } = result;
            if (!sport || !schedule || schedule.length === 0) continue;

            const teamData = sport.getTeamById(teamId);
            const sportLabel = (teamData?.name || sport.getSportName()).split(' ').pop();
            lines.push(`--- ${sportLabel} ---`);

            const today = new Date().toISOString().split('T')[0];
            let gamesAdded = 0;
            const MAX_GAMES = 5;

            for (const day of schedule) {
                if (!day.games || day.games.length === 0) continue;
                if (day.date < today) continue;
                if (gamesAdded >= MAX_GAMES) break;

                for (const game of day.games) {
                    if (gamesAdded >= MAX_GAMES) break;

                    const state = sport.parseGameState(game);
                    const opponent = sport.getOpponent(game, teamId);
                    const isHome = sport.isHome(game, teamId);

                    const gameDate = new Date(game.startTime);
                    const isToday = day.date === today;
                    let dateStr;
                    if (isToday) {
                        dateStr = 'Today';
                    } else {
                        dateStr = gameDate.toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                        });
                    }

                    let gameInfo = '';
                    if (state === GameState.LIVE) {
                        const prefScore = isHome ? game.home.score : game.away.score;
                        const oppScore = isHome ? game.away.score : game.home.score;
                        gameInfo = `${isHome ? 'vs' : '@'} ${opponent.abbrev} - ${prefScore}-${oppScore} (LIVE)`;
                    } else if (state === GameState.FINAL) {
                        const prefScore = isHome ? game.home.score : game.away.score;
                        const oppScore = isHome ? game.away.score : game.home.score;
                        gameInfo = `${isHome ? 'vs' : '@'} ${opponent.abbrev} - ${prefScore}-${oppScore} (F)`;
                    } else {
                        const timeStr = Utils.formatGameTime(game.startTime, timezone);
                        gameInfo = `${isHome ? 'vs' : '@'} ${opponent.abbrev} - ${timeStr}`;
                    }

                    lines.push(`${dateStr}: ${gameInfo}`);
                    gamesAdded++;
                }
            }
        }

        if (lines.length === 0) {
            this._applet.set_applet_tooltip('No upcoming games');
        } else {
            this._applet.set_applet_tooltip(lines.join('\n'));
        }
    }

    updateTooltipFromGames(sportResults, timezone) {
        // Build tooltip from current game state for all sports
        const lines = [];

        for (const result of sportResults) {
            const { sport, teamId, game } = result;
            if (!sport) continue;

            const teamData = sport.getTeamById(teamId);
            const sportLabel = teamData?.abbrev || sport.getSportName();

            if (!game) {
                lines.push(`${sportLabel}: No game today`);
                continue;
            }

            const state = sport.parseGameState(game);
            const isHome = sport.isHome(game, teamId);
            const home = game.home;
            const away = game.away;

            let tooltip = `${sportLabel}: ${away.abbrev} @ ${home.abbrev}`;

            if (state === GameState.LIVE || state === GameState.FINAL) {
                tooltip += ` - ${away.score} : ${home.score}`;
            }

            if (state === GameState.SCHEDULED && game.startTime) {
                const dateStr = game.startTime.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
                tooltip += ` - ${dateStr}`;
            }

            lines.push(tooltip);
        }

        if (lines.length === 0) {
            this._applet.set_applet_tooltip('No games today');
        } else {
            this._applet.set_applet_tooltip(lines.join('\n'));
        }
    }

    populateUpcomingGamesMenu(menu, sportResults, timezone) {
        // sportResults: [{sportKey, sport, teamId, schedule}]
        menu.removeAll();

        let totalGames = 0;

        for (const result of sportResults) {
            const { sport, teamId, schedule } = result;
            if (!sport || !schedule || schedule.length === 0) continue;

            const teamData = sport.getTeamById(teamId);
            const sportLabel = teamData?.abbrev || sport.getSportName();

            // Add sport header
            const header = new PopupMenu.PopupMenuItem(sportLabel, { reactive: false });
            header.actor.add_style_class_name('popup-subtitle-menu-item');
            menu.addMenuItem(header);

            let gamesAdded = 0;
            const MAX_GAMES = 5;

            for (const day of schedule) {
                if (!day.games || day.games.length === 0) continue;

                for (const game of day.games) {
                    const state = sport.parseGameState(game);

                    if (state === GameState.FINAL || state === GameState.LIVE) {
                        continue;
                    }

                    const opponent = sport.getOpponent(game, teamId);
                    const isHome = sport.isHome(game, teamId);
                    const dateStr = game.startTime.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                    });
                    const timeStr = Utils.formatGameTime(game.startTime, timezone);

                    const menuText = `  ${dateStr}: ${isHome ? 'vs' : '@'} ${opponent.abbrev} - ${timeStr}`;
                    menu.addMenuItem(new PopupMenu.PopupMenuItem(menuText));

                    gamesAdded++;
                    totalGames++;
                    if (gamesAdded >= MAX_GAMES) break;
                }
                if (gamesAdded >= MAX_GAMES) break;
            }

            if (gamesAdded === 0) {
                menu.addMenuItem(new PopupMenu.PopupMenuItem('  No upcoming games'));
            }
        }

        if (totalGames === 0 && sportResults.length === 0) {
            menu.addMenuItem(new PopupMenu.PopupMenuItem('No upcoming games found.'));
        }
    }

    _setCardOffseasonLayout(card, enabled) {
        const { box, dateLabel, topRow, oppIcon, teamIcon } = card.elements;

        if (enabled) {
            box.set_vertical(true);
            box.add_style_class_name('sports-offseason-box');
            dateLabel.visible = false;
            topRow.visible = false;
            oppIcon.visible = false;
            teamIcon.set_opacity(255);
        } else {
            box.set_vertical(false);
            box.remove_style_class_name('sports-offseason-box');
            dateLabel.visible = true;
            topRow.visible = true;
            teamIcon.set_opacity(255);
        }
    }

    _setCardStateClass(card, stateClass) {
        const box = card.elements.box;
        box.remove_style_class_name('live-game');
        box.remove_style_class_name('pre-game');
        box.remove_style_class_name('final-game');

        if (stateClass === 'live') {
            box.add_style_class_name('live-game');
        } else if (stateClass === 'pre') {
            box.add_style_class_name('pre-game');
        } else if (stateClass === 'final') {
            box.add_style_class_name('final-game');
        }
    }

    cleanup() {
        this._destroyCards();
        this._container = null;
    }
}

var EXPORTS = { UIManager };
