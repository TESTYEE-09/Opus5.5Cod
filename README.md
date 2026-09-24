# Frontline

A browser first-person shooter in the style of Call of Duty team deathmatch, built with three.js. Two teams of six fight across three maps. Bots fill every slot that no human takes.

**Play:** https://testyee-09.github.io/Opus5.5Cod/

## What's in it

- Three maps:
  - **Crossroads**: a desert town at a road junction in the afternoon.
  - **Harbor**: container docks at sunset under a gantry crane, with water and a cargo ship.
  - **Outpost**: a snowed-in mountain base with a bunker, Quonset barracks and a watchtower.
- Seven classes: AR-4 rifle, VX-9 SMG, HMG-7 machine gun, RSK-50 bolt-action sniper, M-87 pump shotgun, BR-3 three-round-burst rifle, and SVX-10 marksman rifle with a 4x scope. Every class carries frag grenades and a knife. Most carry a P-12 pistol; Recon carries an R-44 Magnum revolver instead.
- Graphics: procedural textures with normal maps, a physically based lighting model lit from an image of the sky, soft sun shadows, bloom, filmic tone mapping and a colour grade. Ultra adds ambient occlusion. Low, Medium, High and Ultra presets are in the menu.
- Effects: detailed vehicles, trees and props; per-surface bullet impacts (sparks on metal, splinters on wood, dust on stone); layered explosions; ejected brass; blood; snow and dust in the air.
- Aim down sights, recoil that partly pulls back down, spread that grows while you move or fire, damage falloff over distance, and separate headshot and leg damage. Reloads are fully animated and slower on an empty mag, where you also rack the charging handle, bolt or slide. The shotgun loads one shell at a time, the revolver swings its cylinder out for a speedloader, and the sniper has scope sway you can steady with Shift.
- Sprint, crouch, slide (sprint then C), slide-jump, stairs and a roof you can reach.
- Bots spot enemies inside a view cone with line of sight, react after a delay, and aim more accurately the longer they track you. They hear gunfire, share sightings with their team, path around the map, strafe, throw grenades and run from yours. Three skill levels.
- Killstreaks: UAV at 3 kills, an airstrike you aim yourself at 5, an attack helicopter at 7. Bots use them too.
- Minimap, kill feed, hit markers, damage direction arrows, grenade warnings, medals, scoreboard (Tab) and an end-of-match summary.
- Recorded sound for every gun, reload, explosion, footstep and vehicle, loudness-matched and mixed in one table. Gunfire echoes differently on each map. You can hear enemy footsteps, sounds behind you are muffled, low health dulls your hearing, and a close blast leaves your ears ringing. See [sound credits](public/sfx/CREDITS.md).

## Multiplayer

Type a callsign, press **Host**, and send the 5-letter room code to your friends. They open the same page, type the code and press **Join**. The host picks the map and Versus (humans split across both teams) or Co-op (every human on one team against bots), then starts the match. Up to 12 players; people can join a match that's already running.

The host's browser runs the match: bots, damage, score and killstreaks. Other players connect to the host directly over WebRTC through [PeerJS](https://peerjs.com), which uses its public server only to introduce the browsers to each other.

- The host should keep the game tab in front. Browsers slow down background tabs, and a slowed host slows the match for everyone.
- If the host leaves, the match ends for everyone.
- Hits are decided by the shooter's browser and trusted by the host. That suits a game among friends; it would not stop a cheater.
- Some strict school or office networks block WebRTC. PeerJS relays through its own TURN servers when a direct connection fails, but not every network allows that.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Shift | Sprint (hold breath when scoped) |
| C | Crouch; slide while sprinting |
| Space | Jump |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| R | Reload |
| 1, 2 or mouse wheel | Switch weapon |
| G (hold) | Cook a grenade, release to throw |
| V | Knife |
| 3, 4, 5 | UAV, airstrike, attack helicopter |
| Tab | Scoreboard |
| Esc | Pause |

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:5178. `npm run build` writes a static site to `dist/`. Pushing to `main` builds and publishes it to GitHub Pages through `.github/workflows/pages.yml`.

## Code layout

| File | What it holds |
|---|---|
| `src/world.js` | The collision grid, ray casting, bot pathfinding, and building a map's meshes |
| `src/maps.js` | Map layouts, lighting and acoustics |
| `src/props.js` | Vehicles, trees, lamps and other detailed props, merged into a few meshes |
| `src/textures.js` | Procedural colour and normal-map textures |
| `src/atmosphere.js` | Sky, sun, fog, reflections and weather |
| `src/graphics.js` | Renderer, post-processing and quality presets |
| `src/player.js` | Local player movement and camera |
| `src/weapons.js` | Weapon stats, gun models, reload animations and the player's weapon handling |
| `src/bots.js` | Soldier models and bot AI |
| `src/streaks.js` | Attack helicopter and airstrike jet |
| `src/effects.js` | Particles, tracers, impacts, explosions and decals |
| `src/game.js` | Match rules, combat, scoring, and host and client roles |
| `src/net.js` | PeerJS rooms, lobby, snapshots and networked soldiers |
| `src/audio.js` | Sample playback, loudness matching, the mix, distance falloff, panning and reverb |
| `src/hud.js` | HUD, minimap and scoreboards |
| `src/main.js` | Renderer, menus, input and the frame loop |
