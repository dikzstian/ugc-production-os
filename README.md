# UGC Production OS

A self-hosted pipeline that turns a product brief into a finished short-form video. No cloud account, no per-seat subscription — the whole thing runs on localhost and drives a browser you already pay for.

Built to solve one specific problem: **AI video generators cap you at 8–15 seconds per clip, and they run out of quota mid-project.** This tool stitches those clips into 30–180 second videos and rotates across a pool of accounts so a quota wall never stops a render.

---

## What it actually does

**1. Compile a script into scene prompts.**
You paste a raw script. The compiler splits it into scenes, assigns each one a beat (hook / reveal / proof / CTA), a shot type, and a persona — then emits a motion-locked prompt for each scene. Prompts are assembled from modular blocks (master lock, character, product, scene intent, lighting, camera, performance, micro-actions, realism rules) so output stays consistent across a multi-scene video.

**2. Keep the product honest.**
Each product entry carries `verifiedSpecs` and `bannedClaims`. The compiler injects the real specs into the prompt and blocks the banned ones, which is what stops the model from inventing "paling murah se-Indonesia" or "anti rusak seumur hidup" on its own.

**3. Rotate accounts instead of waiting.**
Google Flow gives roughly 1000 credits per account, 20 credits per clip. The account pool tracks credits per account and switches automatically when one runs dry — Chrome profiles are isolated per account, so you log in once and never log out again.

**4. Stitch to a real video.**
Segments are concatenated with ffmpeg, loudness-normalized, and given a subtle sensor-grain pass so the output does not read as synthetic. Frame-chaining mode extracts the last frame of each clip and feeds it as the first frame of the next, so a render that jumps between accounts still looks continuous.

**5. Clone motion from a reference.**
Upload a reference video (TikTok/Reels) and your own character image. Three modes: swap the character only, swap character and the held product, or keep the movement and move it to a new location. Long references are auto-sliced into clean H.264 segments under the model's clip limit.

---

## How the pieces fit

```
src/engine/flowCompiler.ts      script → scenes → scene prompts
src/engine/motionCompiler.ts    reference video + assets → motion-transfer prompt
src/engine/rawStudioEngine.ts   realism/character-lock prompt builder
src/engine/presets.ts           hooks, story arcs, personas, tones, shot types, locations
server/videoEngine.ts           ffmpeg: concat, normalise, grain, frame extraction
server/index.ts                 local API (projects, accounts, media, stitching)
chrome-extension-flow/          in-page dock for the generation UI
```

## Running it

```bash
npm install
npm run dev
```

Backend on `127.0.0.1:5180`, UI opens in the browser. Requires Node 18+ and ffmpeg (bundled through `@ffmpeg-installer/ffmpeg`).

---

## Status

Working daily on real production, but it is a tool built for one team's workflow, not a polished product. The account-pool and browser-extension layer is coupled to one specific generator UI and will break when that UI changes. Everything else is plain TypeScript and ffmpeg.

## License

MIT — see [LICENSE](LICENSE).
