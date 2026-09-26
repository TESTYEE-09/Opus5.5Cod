# Frontline

A browser first-person shooter in the style of Call of Duty, built with three.js. The USA and Russia fight across three huge Ground War maps and the tiny, rain-soaked Shipment, and you can play a co-op Undercover mission against a whole garrison. Bots fill every slot that no human takes.

**Play:** https://testyee-09.github.io/Opus5.5Cod/

## Game modes

- **Ground War** (Crossroads, Harbor, Outpost): 12 v 12 on a 600 m map with five capture points, A to E. Stand in a flag's circle to take it; the more of you, the faster. Every flag your team holds scores a point every 4 seconds, kills score too, and the first team to 400 wins. When you die, press 1-6 to choose where to respawn (your base or any flag your team holds), or let the game put you on the front line. Tanks, jets, drones and AA guns fight over the open ground between the villages.
- **Undercover** (co-op, same maps): you and your friends are US operators in Russian uniforms, and the whole garrison is the enemy. Nobody shoots at you until they make you. Work through the mission chain:
  1. Infiltrate the town.
  2. Download the intel at the command post (hold F).
  3. Eliminate Colonel Volkov.
  4. Plant charges on the two SAM launchers.
  5. Hold the exfil LZ until the helicopter arrives.

  Every guard who can see you builds suspicion, shown by the meter at the top of the screen and a "?" over his head. It builds faster when you sprint, crouch, go prone, aim, lean, stand close to him, or walk into a guarded place. At 100 he turns on you and radios it in: drop him (and anyone he shouted to) within 7 seconds or the alarm goes up. Unsuppressed gunfire, explosions, wounding a guard and leaving bodies where they'll be found all do the same. Under the alarm, a siren wails, the garrison hunts you and reinforcements arrive. It dies down after a minute with nobody seeing you, but the guards stay on high alert. The **Operator** class carries a suppressed VX-9 SD and P-12 SD, and the knife is silent.
- **Team Deathmatch** (Shipment): 6 v 6, first to 75 kills.

## What's in it

- Three 600 m Ground War maps, each 14 times the area of the old 160 m maps. Each has its hand-built town in the middle, walled villages around the outer flags, open country with farms, groves, wrecks and cover between them, dirt tracks, a base with flags, tents and AA guns for each side, and the Undercover mission sites (a command post, the colonel's compound, two SAM launchers and a helipad). Past the fence the land keeps going, so the air war has hills, villages, forest and mountains below it:
  - **Crossroads**: desert, a town at a road junction, in the afternoon.
  - **Harbor**: a port at sunset: container yards, warehouses, gantry cranes, water and cargo ships.
  - **Outpost**: a snowbound valley with the mountain base, cabins and pine forest.
- **Shipment**: a 48 m cargo-ship deck of container lanes, in a storm at sea at dusk. It has rain, lightning and thunder, a wet steel deck that reflects the containers and the floodlights, and light beams from the masts and the ship's superstructure. There's also a walk-through container in the middle.
- **USA vs Russia**: US soldiers wear OCP camouflage and drive the M1 Abrams and fly the F-16; Russian soldiers wear EMR green and drive the T-80 and fly the Su-27.
- **Destruction**: explosives blow holes in plaster, brick, plank and sheet-metal walls and knock down sandbags. Bullets break crates and fences. Red fuel barrels explode and set each other off. Cars burn out into wrecks. Tanks drive straight through crates, fences, barrels, sandbags and thin walls.
- Ten classes: AR-4 rifle, VX-9 SMG, HMG-7 machine gun, RSK-50 bolt-action sniper, M-87 pump shotgun, BR-3 three-round-burst rifle, SVX-10 marksman rifle with a 4x scope, the suppressed Operator kit, and two launcher classes. **Anti-Tank** carries an RPG-7 and **Anti-Air** a Stinger that locks on to aircraft when you hold them in the sight. Every class carries frag grenades and a knife. Most carry a P-12 pistol; Recon carries an R-44 Magnum revolver instead.
- Vehicles you drive yourself, each on its own cooldown:
  - **FPV drone** (7): a quadcopter with a warhead strapped under it. It flies on real thrust and gravity: the mouse pitches and yaws, A and D roll, W and S set the throttle, Space is full power and Shift holds a hover. It explodes on impact or when you click. The camera tilts up like a real FPV camera, the battery runs down, and the video breaks up as you fly out of radio range. Your soldier stands still and exposed while you fly.
  - **Tank** (8): WASD drive and the turret follows the mouse. Left click fires the main gun, Space the coaxial machine gun, and right click opens the gunner's sight. It runs over enemies, flattens light cover, shrugs off bullets, and takes about three RPGs to destroy.
  - **Jet** (9): the mouse pitches and rolls, A and D work the rudder, W and S set the throttle and Shift is the afterburner. Left click fires the cannon, right click drops a bomb on the impact marker, and Space releases flares against Stingers.
- **Anti-air**: each team has two AA guns at its base. Unmanned they fire at jets and choppers slowly and loosely and ignore drones; walk up and press F to man one. Jets are tough (about three Stingers) and carry five flares. Bullets barely scratch a tank; rockets, grenades and bombs do real damage.
- **Chopper Gunner** (7-kill streak): you man the chin cannon of an AH-64 Apache (USA) or Mi-24 Hind (Russia) through a thermal camera while it circles the map. It fires as soon as you take the gun, and works for multiplayer clients too.
- Lean around corners with Q and E, and go prone with Ctrl or Z. Prone halves your spread and recoil and shrinks you to a low target.
- Mantle: jump at a ledge up to about 2 m high and you climb onto it. Double-tap Shift for a tactical sprint.
- Press M for the full map: flags, the mission objective, your team and vehicles.
- Rank: every match's score, plus a bonus for a win or a finished mission, earns XP toward 55 ranks, from Private to Commander. Score comes from kills, assists, captures and completed objectives, so all of those feed your rank. Your rank shows in the menu and after each match.
- **Custom loadouts**: five of your own kits sit alongside the ten fixed classes (the fixed ones stay, because Undercover and Ground War need the Operator and launcher kits). Press **Edit loadouts** on the menu to pick a primary, a secondary and an optional launcher, bolt on four attachments and choose three perks. Everything above your rank is locked, and a locked pick falls back to the slot's default when you deploy rather than refusing to spawn. Your loadouts are kept in this browser.
  - Attachments are stat changes, not decoration: a **reflex** raises the gun faster, a **4x scope** swaps in a full-screen reticle and real magnification for a slower aim, a **suppressor** makes you quiet and invisible to minimaps but cuts your effective range, a **long barrel** holds damage further out, an **extended mag** carries half again as many rounds for a slower reload, a **fast mag** reloads quicker, a **foregrip** cuts recoil, and a **laser** tightens hip fire.
  - Perks, one per slot: **Lightweight** (10% faster on foot) or **Quiet Boots** (much harder to hear); **Quickdraw** (quarter-faster reload, 20% faster aim) or **Bandolier** (an extra grenade and half again as much reserve ammo); **Steady** (15% less recoil) or **Ghost** (enemy UAVs and minimaps never show you).
- Sights: open reflex and holographic sights with clear glass and thin frames, glowing dots on the iron sights, and full-screen scope reticles for the sniper and marksman rifles.
- Graphics: procedural textures with normal maps, a physically based lighting model lit from an image of the sky, soft sun shadows, bloom, filmic tone mapping, sharpening and a colour grade. High and Ultra add sun shafts through buildings and cranes, and Ultra adds ambient occlusion. Wet floors carry planar reflections, rippled by the rain and fading with the puddles. Floodlights get fake volumetric beams and real spot lights. Shipping containers have frames, door hardware and weathered company logos. The big maps are drawn in 64 m chunks that are culled by the camera, by the sun's shadow camera and by the fog, with small props and far soldiers hidden at distance. Low, Medium, High and Ultra presets are in the menu.
- Effects: detailed vehicles, trees and props; per-surface bullet impacts (sparks on metal, splinters on wood, dust on stone); layered explosions; ejected brass; blood; snow, dust and rain (with splashes) in the air.
- Aim down sights, recoil that partly pulls back down, spread that grows while you move or fire, damage falloff over distance, and separate headshot and leg damage. Reloads are fully animated and slower on an empty mag, where you also rack the charging handle, bolt or slide. The shotgun loads one shell at a time, the revolver swings its cylinder out for a speedloader, and the sniper has scope sway you can steady with Shift.
- Sprint, crouch, slide (sprint then C), slide-jump, stairs and a roof you can reach.
- Bots spot enemies inside a view cone with line of sight, react after a delay, and aim more accurately the longer they track you. They hear gunfire, share sightings with their team, path around the map, strafe, throw grenades and run from yours. Three skill levels.
- Killstreaks: UAV at 3 kills, an airstrike you aim yourself at 5, the Chopper Gunner at 7. Bots use them too, call in their own drones, tanks and jets, and some carry RPGs and Stingers.
- **Killcam and spectate**: when you die the camera drops with your body, then cuts over your killer's shoulder and follows their fight live until you respawn. If they die first it moves to whoever is left on your side, and you can click or press Space to cycle through your team yourself (right click goes back). The match's final kill plays the same way before the summary screen.
- Minimap, kill feed, hit markers, damage direction arrows, grenade warnings, medals, scoreboard (Tab) and an end-of-match summary.
- Recorded sound for every gun, reload, explosion, footstep and vehicle, loudness-matched and mixed in one table. Gunfire echoes differently on each map. You can hear enemy footsteps, sounds behind you are muffled, low health dulls your hearing, and a close blast leaves your ears ringing. See [sound credits](public/sfx/CREDITS.md).

## Multiplayer

Type a callsign, press **Host**, and send the 5-letter room code to your friends. They open the same page, type the code and press **Join**. The host picks the map, the game mode, and Versus (humans split across both teams) or Co-op (every human on one team against bots), then starts the match. Undercover is always co-op. Up to 12 players; people can join a match that's already running.

The host's browser runs the match: bots, damage, score and killstreaks. Other players connect to the host directly over WebRTC through [PeerJS](https://peerjs.com), which uses its public server only to introduce the browsers to each other.

- Other players are drawn about 100 ms in the past, interpolated between the two snapshots that bracket that moment rather than chasing the newest one. Samples are stamped with the host's clock, which each client estimates from arrival times, so a stall that delivers three snapshots at once plays them back in order instead of snapping. If the buffer runs dry the soldier carries on at their last known speed for up to 200 ms, and no soldier is ever moved further in one frame than a sprint could carry them.
- Hits are still claimed by the shooter's browser, but the host now checks each claim instead of taking it. It keeps 600 ms of every soldier's position, rewinds to the moment the claiming client was drawing — the snapshot that client acknowledged, minus the interpolation delay — and drops the claim if the damage is more than that weapon could do at that range, if there was no line of sight to the target's chest or head, if the shooter had not fired, or if the target was already dead. A claim against a target with no history yet is allowed through rather than eating a real hit. This stops damage through walls, from impossible range, and inflated damage numbers; it cannot tell a good aim from an aimbot, so it is a check, not anti-cheat.
- The host should keep the game tab in front. Browsers slow down background tabs, and a slowed host slows the match for everyone.
- If the host leaves, the match ends for everyone.
- Some strict school or office networks block WebRTC. PeerJS relays through its own TURN servers when a direct connection fails, but not every network allows that.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Shift | Sprint (hold breath when scoped); double-tap for a tactical sprint |
| C | Crouch; slide while sprinting |
| Ctrl or Z | Prone (Z if your browser grabs Ctrl shortcuts) |
| Q / E | Lean left / right |
| Space | Jump; at a ledge, mantle onto it |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| R | Reload |
| 1, 2, 3 or mouse wheel | Switch weapon (3 is the launcher) |
| G (hold) | Cook a grenade, release to throw |
| V | Knife |
| F | Enter or leave a tank or AA gun; leave a jet or the chopper gun; abort a drone. Hold F for mission actions |
| 4, 5, 6 | UAV, airstrike, Chopper Gunner |
| 7, 8, 9 | FPV drone, tank, jet |
| Click / Space (while dead) | Watch the next player; right click for the previous |
| Tab | Scoreboard |
| M | Full map |
| 1-6 (while dead, Ground War) | Choose your spawn |
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
| `src/maps.js` | Map layouts (Shipment and the Ground War generator), lighting, acoustics and game modes |
| `src/modes.js` | Team Deathmatch, Ground War (flags, spawns, scoring) and Undercover (suspicion, alarms, the mission chain) |
| `src/reflect.js` | Planar reflections for rain-wet floors |
| `src/rank.js` | XP and career rank |
| `src/loadout.js` | Custom loadouts: weapon choices, attachment stat deltas, perks and level unlocks |
| `src/props.js` | Vehicles, trees, lamps and other detailed props, merged into a few meshes |
| `src/textures.js` | Procedural colour and normal-map textures |
| `src/atmosphere.js` | Sky, sun, fog, image-based lighting, rain, snow, dust and lightning |
| `src/graphics.js` | Renderer, post-processing and quality presets |
| `src/player.js` | Local player movement and camera |
| `src/weapons.js` | Weapon stats, gun models, reload animations and the player's weapon handling |
| `src/bots.js` | Soldier models and bot AI |
| `src/vehicles.js` | Tank, jet, FPV drone, AA gun and attack chopper: models, handling, AI, HUDs; rockets, shells, bombs and flak; network copies |
| `src/streaks.js` | Helicopter model and the airstrike flyover |
| `src/spectate.js` | The death camera, the killcam and free spectate |
| `src/effects.js` | Particles, tracers, impacts, explosions and decals |
| `src/game.js` | Match rules, combat, scoring, and host and client roles |
| `src/net.js` | PeerJS rooms, lobby, snapshots, snapshot interpolation and networked soldiers |
| `src/rewind.js` | The host's position history and the checks it runs on a client's hit claim |
| `src/audio.js` | Sample playback, loudness matching, the mix, distance falloff, panning and reverb |
| `src/hud.js` | HUD, minimap and scoreboards |
| `src/main.js` | Renderer, menus, input and the frame loop |
