# Mystical Ride

A full-screen Three.js boat ride through a jungle waterway in moonlight, dawn, rain, or a storm with a tornado on the horizon.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Use **W / ↑** to move forward, **S / ↓** to reverse, and **A / D** or **← / →** to steer. Touch controls appear on narrow screens. The weather button cycles through moonlit, dawn, and rainy scenes. The sound button enables quiet water and jungle ambience, with rain sounds in rainy weather.

## Scene

The moon texture, sky, moving water, boat reflection, wasen-style wooden boat and its boatman, torii gate, stone and paper lanterns, lotus, reeds, pagoda silhouette, fading boat wake, rain impact ripples, and subtle ambience are generated at runtime. Nine tree forms are bundled as Blender-made models in `public/models`: broadleaf, willow, banyan, kapok, and palm from `scripts/build_trees.py`, and the swamp set (buttressed cypress with hanging moss, stilt-root mangrove, dead snag) from `scripts/build_swamp_trees.py`. The forest is instanced in stretches along the winding channel and stretches lost in the haze are skipped. The visit count uses the existing homelab view-counter service with the `mystical-ride` project key.
