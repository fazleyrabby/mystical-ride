# Mystical Ride

A full-screen Three.js boat ride through a jungle waterway in moonlight, dawn, or rain.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Use **W / ↑** to move forward, **S / ↓** to reverse, and **A / D** or **← / →** to steer. Touch controls appear on narrow screens. The weather button cycles through moonlit, dawn, and rainy scenes. The sound button enables quiet water and jungle ambience, with rain sounds in rainy weather.

## Scene

The moon texture, sky, moving water, boat reflection, wooden boat, fading boat wake, rain impact ripples, and subtle ambience are generated at runtime. Six detailed tree forms, including broadleaf, willow, banyan, kapok, and palm silhouettes, are bundled as Blender-made models in `public/models`; their editable generator is `scripts/build_trees.py`. The visit count uses the existing homelab view-counter service with the `mystical-ride` project key.
