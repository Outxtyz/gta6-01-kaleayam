// Porto Verde hands itself in. This program runs on Node 22 with only the
// standard library: it copies the playable game (game/) and the screenshots
// (screenshots/) from beside this file into the output directory, then writes
// dossier.json there with the vendored make.fun library so the judge can read
// the entry. Nothing is built or fetched — the game is plain static files.
//
// The game itself is Porto Verde, a 2D top-down open-world crime game: a
// sun-soaked city to explore on foot and by car, traffic and pedestrians,
// cars to steal, a wanted level with police who respond, five story missions
// for the fixer Vera, combat, a HUD with a minimap, a start screen and a
// save, and synthesized WebAudio sound. All of it is original work.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the game itself with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps, copied from the kit's gate: only text_max_bytes
// shapes the dossier's bytes; the rest refuse an entry the scorer would
// refuse (more than 4 screenshots or one over 256 KiB; more than 993 files
// in game/ or 48 MiB of game files in all; a path under game/ over 1000
// bytes). game/ is counted beside /output's own 1000-entry cap, together
// with its screenshots/ and dossier.json.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
