# Solmar Bay — Open-World Crime Game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/2060TZH/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/2060TZH/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** is a sun-soaked open-world crime game in the spirit of GTA 6 — built
from scratch as an original game: its own city, characters, vehicles, story, art,
sound and music. Nothing is taken from any commercial game.

Mara Voss came back to Solmar Bay with $500 and a grudge. Steal cars, outrun the
Solmar Bay PD, run six jobs for the crew — and own the city that owes her everything.

## What's in the game

- **An open city to explore on foot and by car** — an 8×8-block coastal city with a
  beach, marina, docks, plaza, parks and a neon downtown; day/night cycle, fog and
  a living skyline.
- **Traffic and pedestrians** — cars follow the road grid, pedestrians walk the
  sidewalks and flee when trouble starts.
- **Cars to steal and drive** — parked cars and traffic cars (yank the driver out),
  arcade driving with handbrake, collisions and wrecked cars.
- **A wanted level and police** — 0–5 stars; pursuit cars and foot cops chase, ram
  and try to bust you; break line of sight to cool off.
- **Missions and a story** — six story jobs (Hotwire, Sunset Run, The Pickup,
  Collection Day, Dock Deal, Grand Escape) with objectives, a target beacon, timers
  and payouts, plus taxi fares and 20 hidden gold packages to collect.
- **Combat** — fists and a pistol with ammo, reload and hitscan tracers; armed
  enemies shoot back at the docks.
- **A HUD with a minimap** — live top-down map with the player arrow, mission
  target, police dots, traffic and packages; health, money, wanted stars, ammo,
  speed and the in-game clock.
- **A start and a save** — title screen with New Game / Continue, pause menu, and
  localStorage saves (auto-save after every mission).
- **Polish** — third-person camera with pointer-lock mouse look, WebAudio
  synthesized engine, sirens, gunshots and a synthwave music loop (mutable),
  banners, toasts, busted/wasted screens and respawns.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network
request: `game/` is plain static files (Three.js is vendored under
`game/vendor/three.module.min.js`).

**Controls:** WASD move / drive · mouse look (click to lock) · Shift run ·
E enter/exit car · F punch · click shoot · R reload · Space handbrake ·
Esc pause.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game's own code
(`?shot=chase|plaza|mission|night&seed=1`), taken with `shoot-solmar.py`:
a 3-star police chase, the plaza on foot, the dock shootout at dusk, and a
night drive through neon downtown.

## Layout

- `game/index.html` — page, HUD and screens
- `game/src/game.js` — the game: player, cars, camera, day cycle, screens
- `game/src/city.js` — procedural Solmar Bay (buildings, beach, neon, palms)
- `game/src/traffic.js` — traffic cars, pedestrians, car/person meshes
- `game/src/police.js` — wanted level, pursuit cars, foot cops, busted
- `game/src/missions.js` — six story missions, taxi fares, hidden packages
- `game/src/combat.js` — pistol/punch and armed enemies
- `game/src/hud.js` — HUD and minimap
- `game/src/audio.js` — synthesized WebAudio sound and music
- `game/src/shots.js` — the four screenshot scenes
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output`
  and writes `dossier.json`

---

<sub>Entered on [make.fun](https://make.fun/?ref=zfzt2mbb&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
