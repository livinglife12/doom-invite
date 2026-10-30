# Throne room

The room follows a classic-comic direction, with stylized sculpture rather than film likenesses. Doom is seated at the throne's center, wearing silver armor and a green hood, cape and belted tunic. His hips meet the seat, palms meet both armrests, and armored boots rest on the dais. His face uses the same shaped mask and real eye apertures as the final assembly.

The previous offset cone-shaped Doom, broken throne armrest, generic floor helmet, headless cloak mannequin and glowing statue eye bars are removed. The room now has an intact Strange sculpture, a fitted Iron Man helmet, and recognizable Cap/Thor monuments. Cap's shield has a curved front, raised star and rear straps. Thor carries a chamfered Mjolnir with a proper grip and a longer carved cape. Both statues face the incoming visitor rather than presenting their profiles.

The visual references are [official Doom studio imagery](https://movies.disney.com/avengers-doomsday), [Marvel's Thor outfit reference](https://www.marvel.com/amp/articles/games/marvels-avengers-character-outfit-spotlight-thor), and [Marvel's shield history](https://www.marvel.com/items/adamantium). These are design references, not downloaded assets; the project's model credits remain separate.

Lighting preserves the dark discovery phase, then adds a soft frontal fill and throne key as the switch brings the room to life. A short throne camera reveal precedes the hall entrance. Flashlight discovery tests use beam coverage within its range rather than duplicating physical distance attenuation, so distant figures can react.

`npm run verify:room` checks actual geometry contacts, finite vertices/normals, grounded statues, shield-facing direction, hammer attachment, geometry reuse and flashlight range. It does not establish movie-level facial fidelity or a measured device frame rate.

Internal viewpoints, without extra controls: `/?debug&scene=throne`, `/?debug&scene=room`, `/?debug&scene=cap-statue`, `/?debug&scene=thor-statue`, `/?debug&scene=strange-statue`.
