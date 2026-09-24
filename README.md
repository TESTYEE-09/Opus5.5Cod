# Frontline

A browser first-person shooter in the style of Call of Duty team deathmatch, built with three.js. Two teams of six fight on one town map. Bots fill every slot that no human takes.

**Play:** https://testyee-09.github.io/Opus5.5Cod/

## What's in it

- Five classes: AR-4 rifle, VX-9 SMG, HMG-7 machine gun, RSK-50 bolt-action sniper and M-87 pump shotgun. Every class also carries a P-12 pistol, frag grenades and a knife.
- Aim down sights, recoil that partly pulls back down, spread that grows while you move or fire, damage falloff over distance, and separate headshot and leg damage. Reloads are slower on an empty mag. The shotgun loads one shell at a time and the sniper has scope sway you can steady with Shift.
- Sprint, crouch, slide (sprint then C), slide-jump, stairs and a roof you can reach.
- Bots spot enemies inside a view cone with line of sight, react after a delay, and aim more accurately the longer they track you. They hear gunfire, share sightings with their team, path around the map, strafe, throw grenades and run from yours. Three skill levels.
- Killstreaks: UAV at 3 kills, an airstrike you aim yourself at 5, an attack helicopter at 7. Bots use them too.
- Minimap, kill feed, hit markers, damage direction arrows, grenade warnings, medals, scoreboard (Tab) and an end-of-match summary.
- Recorded sound for every gun, reload, explosion, footstep and vehicle. See [sound credits](public/sfx/CREDITS.md).

## Multiplayer

Type a callsign, press **Host**, and send the 5-letter room code to your friends. They open the same page, type the code and press **Join**. The host picks Versus (humans split across both teams) or Co-op (every human on one team against bots) and starts the match. Up to 12 players; people can join a match that's already running.

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
| `src/world.js` | Map layout, the collision grid, ray casting and bot pathfinding |
| `src/player.js` | Local player movement and camera |
| `src/weapons.js` | Weapon stats, gun models and the player's weapon handling |
| `src/bots.js` | Soldier models and bot AI |
| `src/streaks.js` | Attack helicopter and airstrike jet |
| `src/game.js` | Match rules, combat, scoring, and host and client roles |
| `src/net.js` | PeerJS rooms, lobby, snapshots and networked soldiers |
| `src/audio.js` | Sample playback with distance falloff and panning |
| `src/hud.js` | HUD, minimap and scoreboards |
| `src/main.js` | Renderer, menus, input and the frame loop |
