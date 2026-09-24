# Frontline

A browser first-person shooter in the style of Call of Duty team deathmatch, built with three.js. The USA and Russia, eight a side, fight across three large maps. Bots fill every slot that no human takes.

**Play:** https://testyee-09.github.io/Opus5.5Cod/

## What's in it

- Three 160 m maps. Each has a hand-built town in the middle, generated outskirts around it (houses, walled compounds, ruins, groves, wrecks, fences, cover) and a base with flags, tents and AA guns for each side. Past the fence the land keeps going, so the air war has hills, villages, forest and mountains below it:
  - **Crossroads**: a desert town at a road junction in the afternoon.
  - **Harbor**: container docks at sunset under a gantry crane, with warehouses, container stacks, water and cargo ships.
  - **Outpost**: a snowed-in mountain base in a pine forest, with a bunker, Quonset barracks, cabins and a watchtower.
- **USA vs Russia**: US soldiers wear OCP camouflage and drive the M1 Abrams and fly the F-16; Russian soldiers wear EMR green and drive the T-80 and fly the Su-27.
- **Destruction**: explosives blow holes in plaster, brick, plank and sheet-metal walls and knock down sandbags. Bullets break crates and fences. Red fuel barrels explode and set each other off. Cars burn out into wrecks. Tanks drive straight through crates, fences, barrels, sandbags and thin walls.
- Nine classes: AR-4 rifle, VX-9 SMG, HMG-7 machine gun, RSK-50 bolt-action sniper, M-87 pump shotgun, BR-3 three-round-burst rifle, SVX-10 marksman rifle with a 4x scope, and two launcher classes. **Anti-Tank** carries an RPG-7 and **Anti-Air** a Stinger that locks on to aircraft when you hold them in the sight. Every class carries frag grenades and a knife. Most carry a P-12 pistol; Recon carries an R-44 Magnum revolver instead.
- Vehicles you drive yourself, each on its own cooldown:
  - **FPV drone** (7): a quadcopter with a warhead strapped under it. It flies on real thrust and gravity: the mouse pitches and yaws, A and D roll, W and S set the throttle, Space is full power and Shift holds a hover. It explodes on impact or when you click. The camera tilts up like a real FPV camera, the battery runs down, and the video breaks up as you fly out of radio range. Your soldier stands still and exposed while you fly.
  - **Tank** (8): WASD drive and the turret follows the mouse. Left click fires the main gun, Space the coaxial machine gun, and right click opens the gunner's sight. It runs over enemies, flattens light cover, shrugs off bullets, and takes about three RPGs to destroy.
  - **Jet** (9): the mouse pitches and rolls, A and D work the rudder, W and S set the throttle and Shift is the afterburner. Left click fires the cannon, right click drops a bomb on the impact marker, and Space releases flares against Stingers.
- **Anti-air**: each team has two AA guns at its base. Unmanned they fire at jets and choppers slowly and loosely and ignore drones; walk up and press F to man one. Jets are tough (about three Stingers) and carry five flares. Bullets barely scratch a tank; rockets, grenades and bombs do real damage.
- **Chopper Gunner** (7-kill streak): you man the helicopter's chin cannon through a thermal camera while it circles the map.
- Lean around corners with Q and E, and go prone with Ctrl or Z. Prone halves your spread and recoil and shrinks you to a low target.
- Sights: open reflex and holographic sights with clear glass and thin frames, glowing dots on the iron sights, and full-screen scope reticles for the sniper and marksman rifles.
- Graphics: procedural textures with normal maps, a physically based lighting model lit from an image of the sky, soft sun shadows, bloom, filmic tone mapping and a colour grade. Ultra adds ambient occlusion. Low, Medium, High and Ultra presets are in the menu.
- Effects: detailed vehicles, trees and props; per-surface bullet impacts (sparks on metal, splinters on wood, dust on stone); layered explosions; ejected brass; blood; snow and dust in the air.
- Aim down sights, recoil that partly pulls back down, spread that grows while you move or fire, damage falloff over distance, and separate headshot and leg damage. Reloads are fully animated and slower on an empty mag, where you also rack the charging handle, bolt or slide. The shotgun loads one shell at a time, the revolver swings its cylinder out for a speedloader, and the sniper has scope sway you can steady with Shift.
- Sprint, crouch, slide (sprint then C), slide-jump, stairs and a roof you can reach.
- Bots spot enemies inside a view cone with line of sight, react after a delay, and aim more accurately the longer they track you. They hear gunfire, share sightings with their team, path around the map, strafe, throw grenades and run from yours. Three skill levels.
- Killstreaks: UAV at 3 kills, an airstrike you aim yourself at 5, the Chopper Gunner at 7. Bots use them too, call in their own drones, tanks and jets, and some carry RPGs and Stingers.
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
| Ctrl or Z | Prone (Z if your browser grabs Ctrl shortcuts) |
| Q / E | Lean left / right |
| Space | Jump |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| R | Reload |
| 1, 2, 3 or mouse wheel | Switch weapon (3 is the launcher) |
| G (hold) | Cook a grenade, release to throw |
| V | Knife |
| F | Enter or leave a tank or AA gun; leave a jet or the chopper gun; abort a drone |
| 4, 5, 6 | UAV, airstrike, Chopper Gunner |
| 7, 8, 9 | FPV drone, tank, jet |
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
| `src/vehicles.js` | Tank, jet, FPV drone, AA gun and attack chopper: models, handling, AI, HUDs; rockets, shells, bombs and flak; network copies |
| `src/streaks.js` | Helicopter model and the airstrike flyover |
| `src/effects.js` | Particles, tracers, impacts, explosions and decals |
| `src/game.js` | Match rules, combat, scoring, and host and client roles |
| `src/net.js` | PeerJS rooms, lobby, snapshots and networked soldiers |
| `src/audio.js` | Sample playback, loudness matching, the mix, distance falloff, panning and reverb |
| `src/hud.js` | HUD, minimap and scoreboards |
| `src/main.js` | Renderer, menus, input and the frame loop |
