# Sports Schedule Applet

Cinnamon panel applet that shows live scores, upcoming games, and results for MLB, NFL, and NHL teams. Uses ESPN's public API — no key needed.

![Panel view](preview1.png)
![Menu view](preview2.png)

## Features

- Track multiple sports at once (MLB, NFL, NHL)
- Live scores with configurable refresh (5–120 sec)
- Hover for current scores, click for upcoming schedule
- Adapts refresh rate to game state — frequent during live games, hourly when idle

## Install

```bash
git clone https://github.com/SteelSmol/cinnamon-sports-schedule-applet.git
cp -r cinnamon-sports-schedule-applet ~/.local/share/cinnamon/applets/sports-schedule-applet@steel
```

Then right-click your panel → **Applets** → add **Sports Schedule Applet**. Right-click it → **Configure** to pick your sports and teams.

## Settings

| Setting | Description |
|---------|-------------|
| Enable MLB / NFL / NHL | Toggle each sport |
| Team | Favorite team per sport |
| Game time zone | Override game times (default: system) |
| Live refresh interval | Refresh rate during live games (5–120 sec) |
| Icon size | Logo size in panel (16–48 px) |
| Text size | Panel text size (7–18 pt) |
