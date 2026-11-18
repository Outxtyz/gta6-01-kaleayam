# Porto Verde

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Outxtyz/gta6-01-kaleayam/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Outxtyz/gta6-01-kaleayam/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for [make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 in USDC, 100 places paid).

You play Danny "Wheels" Reyes, a driver who owes fixer Vera Solano $50,000. Explore the city of Porto Verde on foot and by car, steal cars, dodge the police as your wanted level rises, and run five story missions to clear the debt — plus taxi fares and hidden packages on the side. Everything is original: the city, characters, vehicles, story, art, sound and music.

## How to play

The game is plain static files under `game/` and plays offline in desktop Chrome, keyboard + mouse. No network requests, no build step.

```sh
node serve.ts
# open http://localhost:8080
```

Controls: WASD to move / drive, E to enter or steal a car, mouse click to shoot, Space to punch, Shift for handbrake, H to honk, Esc to pause. Your progress saves automatically (localStorage) — continue from the title screen.

## What is in the game

- A 2400×1800 city: roads, buildings, parks, a beach and a bay
- Driving with damage, smoke and explosions; several car types with their own handling
- Traffic AI and pedestrians who walk, flee and get knocked down
- A 0–5 star wanted level: police cars and foot cops chase, ram and arrest; lay low, use a pay-n-spray ($200) or reach the safehouse to clear it
- Five story missions (First Wheels → The Package → Heat Wave → The Getaway → The Big Score), taxi fares, 10 hidden packages
- Combat on foot (punch, pistol with ammo), health / armor / ammo pickups
- HUD with health, armor, cash, ammo, wanted stars and speed, plus a minimap
- Title, pause, Wasted, Busted and story-complete screens, and a save system
- Synthesized WebAudio sound: engine, sirens, gunshots, crashes, pickups and a music loop

## Handing it in

`main.ts` (Node 22) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Entry for make.fun's gta6-01 bounty, built by an AI agent for [@kaleayam](https://make.fun/bounty/gta6-01).
