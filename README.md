# Sports Schedule Applet

A Cinnamon desktop panel applet that displays live scores, upcoming games, and final results for your favorite MLB, NFL, and NHL teams. Sits in your panel with team logos, color-coded game states, and adaptive refresh — no API key required.

## Screenshots

![Panel view](preview1.png)
![Menu view](preview2.png)

## Features

- **Live scores** with configurable refresh interval (default 5 seconds)
- **Multi-sport** — track MLB, NFL, and NHL simultaneously
- **Smart game priority** — always shows the most relevant game (LIVE > FINAL > SCHEDULED)
- **Color-coded states** — green (live), yellow (upcoming), gray (final) at a glance
- **Hover tooltip** — current game state and scores for each enabled sport
- **Click menu** — upcoming scheduled games across all enabled sports
- **Adaptive polling** — fast refresh during live games, backs off to hourly when idle
- **Offseason-aware** — countdown to next game during the off-season
- **No API key needed** — uses ESPN's public API

## Requirements

- **Cinnamon desktop 5.4+**

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/SteelSmol/cinnamon-sports-schedule-applet.git
   ```

2. Copy to your Cinnamon applets directory:
   ```bash
   cp -r cinnamon-sports-schedule-applet ~/.local/share/cinnamon/applets/sports-schedule-applet@steel
   ```

3. Add the applet to your panel:
   - Right-click the Cinnamon panel → **Applets**
   - Search for **Sports Schedule Applet**
   - Click the **+** button to add it

4. Configure your teams:
   - Right-click the applet → **Configure**
   - Enable the sports you want and select your favorite teams

## Usage

| Action | What happens |
|--------|-------------|
| **Glance** | Panel shows team logos, opponents, scores/times, and game states |
| **Hover** | Tooltip shows current game state for each enabled sport |
| **Click** | Popup menu shows upcoming scheduled games |
| **Right-click → Configure** | Change sports, teams, and display settings |

### Game States

| State | Panel Color | Description |
|-------|------------|-------------|
| Live | Green | Game in progress |
| Scheduled | Yellow | Upcoming game — shows start time |
| Final | Gray | Completed game — shows final score |
| Day Off | — | No games today |
| Offseason | — | Next game is 30+ days away |

## Configuration

| Setting | Description |
|---------|-------------|
| Enable MLB / NFL / NHL | Toggle each sport on or off |
| Team | Your favorite team per sport |
| Game time zone | Override for game times (defaults to system timezone) |
| Live game refresh interval | How often to refresh during live games (5–120 seconds) |
| Icon size | Team logo size in the panel (16–48 px) |
| Text size | Panel text size (7–18 pt) |

## How It Works

The applet fetches schedule and live game data from ESPN's public API (`site.api.espn.com`). Team logos are downloaded once and cached locally. Refresh intervals adapt to game state — polling frequently during live games and backing off to hourly when idle.

## Running Tests

The test suite covers game selection, ESPN response parsing, refresh intervals, and cache logic:

```bash
node tests/runner.js
```

## Troubleshooting

**Applet shows "Loading..." forever**
ESPN's API may be temporarily unavailable. Check logs with `journalctl --user -f | grep sports-applet`.

**Icons not loading**
Delete the `assets/` directory and reload Cinnamon (Alt+F2 → `r` → Enter) to re-download logos.

**Wrong game showing**
The applet prioritizes: LIVE > FINAL (today) > SCHEDULED (today) > SCHEDULED (future). Final games clear after 5 hours or at midnight.

**Reload the applet**
Press Alt+F2, type `r`, press Enter. This restarts Cinnamon and reloads all applets.
