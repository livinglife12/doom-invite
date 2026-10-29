# Doom Invites You

A cinematic, portrait-first 3D RSVP for a Doomsday watch party. Built with Next.js, React Three Fiber, Drei, GSAP and postprocessing.
All art and sound are generated procedurally, so there are no asset files to load.

```
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

Inside a OneDrive folder, the dev server may not notice file edits. If changes don't show up, start it with polling. In PowerShell: `$env:WATCHPACK_POLLING='true'; npm run dev`.

## The sequence
1. **The television**: an old set in a moonlit parlour. Turn the dial (or tap "TURN THE DIAL") and the tube warms up: a white dot, then a line, then a Latverian test card. Doom's broadcast then shows the three summons lines in black and white, and the camera dives into the screen and cuts to the dark throne room.
2. **Flashlight**: a real `SpotLight` (with shadows on high quality) follows the mouse or a finger drag. Discoveries respond when lit: the shield glints, the cloak twitches, newspapers lift, the broken hologram flickers, statue eyes glow, and Doom's eyes flare.
3. **Switch**: hold the beam on it for 1.2 s (ray/cone test with a charge ring). Moving away drains the charge. Tapping the switch, or the prompt that appears after 22 s, are the accessibility fallbacks. Activation runs: sparks → latch → flip → cable surge → wall lights → doors → "BEHOLD WHAT REMAINS OF YOUR HEROES."
4. **Hall of Conquest**: nine heroes. Each shrine starts as just its button on a lectern. Press it (tap, click, or Enter/Space) and the shrine rises out of the floor around it: platform, wall, columns, arch, projector, relic, figurine, braziers and clippings (tap a clipping to read it). Its hologram replays the hero's last stand, the relic performs, then Doom's lightning burns everything back down to the button, which rises away as a trophy.
   - Doctor Strange (`levitate`): rune shields shatter. The Cloak of Levitation flies a loop over the shrine.
   - Loki (`glorious purpose`): illusion copies struck down one by one. The horned helm splits into golden illusions.
   - Thor (`worthy`): calls the storm through Mjolnir; it turns green and strikes him. Mjolnir lifts, spins and slams down in lightning.
   - Iron Man (`i am iron man`): repulsor flight, a failing unibeam, the armour powers down. The helmet opens, its eyes ignite and it hovers.
   - Captain America (`assemble`): his shield is shot until it splits. The shield ricochets around the shrine.
   - Hulk (`rip it apart`): chained and shrunk to a man. The shackle strains and snaps open.
   - Black Panther (`wakanda forever`): absorbs the blows, releases a kinetic blast, struck mid-leap. The mask rises as energy rings pulse.
   - Spider-Man (`thwip`): swings until his web is cut. The pinned mask shoots webs to the shrine's corners.
   - Fantastic Four (`flame on`): the grand memorial. Reed, Sue, Johnny and Ben fall in turn, then all four relics act together.
   The Thor, Iron Man, Black Panther, Spider-Man and Fantastic Four buttons were designed for this invite in the family of the four supplied ones.
5. **Collapse**: rifts open, life-size holograms of every hero flicker back and are torn apart, debris and papers float, and the hall is pulled into a vortex.
6. **Mask**: hundreds of white-hot fragments fly in and cool to steel, the eyes ignite, then "RSVP." / "SIGN YOUR NAME… IF YOU DARE." The faceplate opens.
7. **Decree**: name, attend or decline, an optional message and a hand-drawn signature, then the wax seal and an acknowledgement.
8. **Erasure**: the signed page burns from the edges in, with the signature going last. "ALL THINGS END IN DOOM." Then "WITNESS AGAIN".

SKIP (top right) jumps past the current sequence; SOUND toggles audio. Quality is auto-detected; force it with `?q=low|mid|high`.

## Customise
- **Party details**: `src/config/event.js`
- **Heroes, headlines, button labels and colours**: `src/config/shrines.js`. Character silhouettes (costume pieces, props) are in `src/lib/heroes.js`; to use real models you own, load a GLB per hero there and return the same shape. Everything IP-specific lives here, so it can be re-skinned with original characters.
- **Button faces** (drawn to match your four clips; originals in `public/buttons/`): `buttonCanvas` in `src/lib/textures.js`
- **Story timing / camera**: `src/director.js`
- **RSVPs** are POSTed to `/api/rsvp` and appended to `data/rsvps.json` when self-hosted with `npm start`.
  To list them, set `RSVP_ADMIN_KEY` and open `/api/rsvp?key=…`.
  On serverless hosts (e.g. Vercel) the file isn't persistent, so set `NEXT_PUBLIC_RSVP_ENDPOINT` to a form service or your own endpoint.
