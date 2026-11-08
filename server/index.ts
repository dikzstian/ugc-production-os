import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { compileFlowScenePrompt } from '../src/engine/flowCompiler';
import { compileMotionClonePrompt } from '../src/engine/motionCompiler';
import {
  CharacterAsset,
  DownloadsFileItem,
  FlowAccount,
  MotionCloneJob,
  ProductAsset,
  StudioProject,
} from '../src/types/studio';
import {
  abortActiveCdpAutoRun,
  findAliveCdpPortAcrossAccounts,
  getCdpPortForAccount,
  isCdpAutoRunBusy,
  isCdpPortAlive,
  runProjectViaCdp,
} from './cdpFlowRunner';
import { createInitialDatabase, StudioDatabase } from './seedData';
import { extractLastFrame, probeVideo, sliceReferenceVideo, stitchVideoClips } from './videoEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const UPLOADS_DIR = path.join(MEDIA_DIR, 'uploads');
const CLIPS_DIR = path.join(MEDIA_DIR, 'clips');
const FRAMES_DIR = path.join(MEDIA_DIR, 'frames');
const EXPORTS_DIR = path.join(MEDIA_DIR, 'exports');
const TEMP_DIR = path.join(DATA_DIR, 'temp');
const PROFILES_DIR = path.join(DATA_DIR, 'chrome_profiles');
const EXTENSION_DIR = path.join(ROOT_DIR, 'chrome-extension-flow');
const HASIL_UGC_DIR = 'D:\\Dika\\HASIL UGC';
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');

for (const dir of [
  DATA_DIR,
  MEDIA_DIR,
  UPLOADS_DIR,
  CLIPS_DIR,
  FRAMES_DIR,
  EXPORTS_DIR,
  TEMP_DIR,
  PROFILES_DIR,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadDb(): StudioDatabase {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StudioDatabase;
      if (!parsed.motionJobs) parsed.motionJobs = [];
      return parsed;
    }
  } catch (err) {
    console.error('Failed reading db.json, re-initializing:', err);
  }
  const initial = createInitialDatabase();
  saveDb(initial);
  return initial;
}

function saveDb(db: StudioDatabase): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

let db: StudioDatabase = loadDb();

function findChromeBinary(): string | null {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function launchChromeForAccount(
  account: FlowAccount,
  openExtensionsTab = false
): { ok: boolean; cdpPort?: number; error?: string } {
  const chromeBin = findChromeBinary();
  if (!chromeBin) {
    return { ok: false, error: 'Google Chrome tidak ditemukan di lokasi standar Windows.' };
  }

  const profilePath = path.join(PROFILES_DIR, account.profileDirName);
  fs.mkdirSync(profilePath, { recursive: true });

  const cdpPort = getCdpPortForAccount(account.id, db.accounts);
  const rawUrl = account.flowUrl?.trim() || '';
  const targetUrl =
    !rawUrl || rawUrl === 'https://labs.google/fx/tools/flow'
      ? 'https://flow.google.com/'
      : rawUrl;

  const args = [
    `--user-data-dir=${profilePath}`,
    `--remote-debugging-port=${cdpPort}`,
    '--remote-allow-origins=*',
    '--disable-popup-blocking',
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    targetUrl,
  ];

  if (openExtensionsTab) {
    args.push(`http://127.0.0.1:${PORT}/api/extension-setup-guide?acc=${encodeURIComponent(account.name)}`);
  }

  const child = spawn(chromeBin, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return { ok: true, cdpPort };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    const base = sanitizeFilename(path.basename(file.originalname, ext));
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 350 * 1024 * 1024 },
});

const app = express();
const PORT = Number(process.env.PORT) || 3010;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '90mb' }));
app.use('/media', express.static(MEDIA_DIR));

let lastExtensionPingMs = 0;

// ─── Bootstrap ───────────────────────────────────────────────────────────────

app.get('/api/bootstrap', (_req, res) => {
  res.json({
    ok: true,
    ...db,
    paths: {
      extensionDir: EXTENSION_DIR,
      hasilUgcDir: HASIL_UGC_DIR,
      downloadsDir: DOWNLOADS_DIR,
      profilesDir: PROFILES_DIR,
    },
  });
});

// ─── Generic File Upload ─────────────────────────────────────────────────────

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: 'Tidak ada file yang diupload.' });
    return;
  }
  const url = `/media/uploads/${req.file.filename}`;
  res.json({
    ok: true,
    url,
    filePath: req.file.path,
    originalName: req.file.originalname,
  });
});

// ─── Base64 Image Helper (For 1-Click Copy Image to Clipboard) ───────────────

app.get('/api/media-base64', async (req, res) => {
  try {
    const mediaUrl = String(req.query.mediaUrl || '');
    const rawFilePath = String(req.query.filePath || '');

    let resolved = '';
    if (mediaUrl.startsWith('/media/')) {
      const rel = mediaUrl.replace(/^\/media\//, '');
      resolved = path.resolve(MEDIA_DIR, rel);
      if (!resolved.startsWith(MEDIA_DIR)) {
        res.status(403).json({ ok: false, error: 'Akses path ditolak.' });
        return;
      }
    } else if (rawFilePath && fs.existsSync(rawFilePath) && path.resolve(rawFilePath).startsWith(DATA_DIR)) {
      resolved = path.resolve(rawFilePath);
    }

    if (!resolved || !fs.existsSync(resolved)) {
      res.status(404).json({ ok: false, error: 'File gambar tidak ditemukan.' });
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
        ? 'image/gif'
        : 'image/jpeg';

    const buf = await fs.promises.readFile(resolved);
    res.json({
      ok: true,
      mimeType: mime,
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Accounts Pool & Zero-Logout Multi-Profile Chrome ────────────────────────

app.post('/api/accounts', (req, res) => {
  const idx = db.accounts.length + 1;
  const id = `acc_${Date.now()}`;
  const planTier = req.body.planTier || 'AI Pro';
  const creditsMax = Number(req.body.creditsMax) || (planTier === 'AI Ultra' ? 2500 : 1000);
  const newAcc: FlowAccount = {
    id,
    name: req.body.name?.trim() || `Akun Flow #${idx}`,
    emailHint: req.body.emailHint?.trim() || '',
    planTier,
    creditsRemaining: Number(req.body.creditsRemaining ?? creditsMax),
    creditsMax,
    costPerClip: Number(req.body.costPerClip) || 20,
    status: 'ready',
    flowUrl: req.body.flowUrl?.trim() || 'https://flow.google.com/',
    profileDirName: `flow_profile_${Date.now()}`,
    notes: req.body.notes?.trim() || '',
  };

  db.accounts.push(newAcc);
  saveDb(db);
  res.json({ ok: true, account: newAcc, accounts: db.accounts });
});

app.patch('/api/accounts/:id', (req, res) => {
  const acc = db.accounts.find((a) => a.id === req.params.id);
  if (!acc) {
    res.status(404).json({ ok: false, error: 'Akun tidak ditemukan.' });
    return;
  }

  Object.assign(acc, {
    ...(req.body.name !== undefined ? { name: req.body.name } : {}),
    ...(req.body.emailHint !== undefined ? { emailHint: req.body.emailHint } : {}),
    ...(req.body.planTier !== undefined ? { planTier: req.body.planTier } : {}),
    ...(req.body.creditsRemaining !== undefined ? { creditsRemaining: Math.max(0, Number(req.body.creditsRemaining)) } : {}),
    ...(req.body.creditsMax !== undefined ? { creditsMax: Math.max(1, Number(req.body.creditsMax)) } : {}),
    ...(req.body.costPerClip !== undefined ? { costPerClip: Math.max(0, Number(req.body.costPerClip)) } : {}),
    ...(req.body.status !== undefined ? { status: req.body.status } : {}),
    ...(req.body.flowUrl !== undefined ? { flowUrl: req.body.flowUrl } : {}),
    ...(req.body.notes !== undefined ? { notes: req.body.notes } : {}),
  });

  if (acc.creditsRemaining === 0 && req.body.status === undefined) {
    acc.status = 'exhausted';
  }

  saveDb(db);
  res.json({ ok: true, account: acc, accounts: db.accounts });
});

app.delete('/api/accounts/:id', (req, res) => {
  db.accounts = db.accounts.filter((a) => a.id !== req.params.id);
  if (db.bridge.activeAccountId === req.params.id) {
    db.bridge.activeAccountId = db.accounts[0]?.id;
  }
  saveDb(db);
  res.json({ ok: true, accounts: db.accounts, bridge: db.bridge });
});

app.post('/api/accounts/:id/launch', (req, res) => {
  const acc = db.accounts.find((a) => a.id === req.params.id);
  if (!acc) {
    res.status(404).json({ ok: false, error: 'Akun tidak ditemukan.' });
    return;
  }

  db.accounts.forEach((a) => {
    if (a.id !== acc.id && a.status === 'active') {
      a.status = a.creditsRemaining > 0 ? 'ready' : 'exhausted';
    }
  });
  acc.status = 'active';
  acc.lastUsedAt = new Date().toISOString();
  db.bridge.activeAccountId = acc.id;
  saveDb(db);

  const openExt = Boolean(req.body?.openExtensionsTab);
  const launched = launchChromeForAccount(acc, openExt);
  if (!launched.ok) {
    res.status(500).json({ ok: false, error: launched.error });
    return;
  }

  res.json({
    ok: true,
    account: acc,
    accounts: db.accounts,
    bridge: db.bridge,
  });
});

app.post('/api/accounts/rotate', (req, res) => {
  const currentId = req.body?.currentAccountId || db.bridge.activeAccountId;
  const currentAcc = db.accounts.find((a) => a.id === currentId);

  if (currentAcc) {
    currentAcc.status = 'exhausted';
    currentAcc.creditsRemaining = 0;
  }

  const nextAcc = db.accounts.find(
    (a) => a.id !== currentId && a.status !== 'exhausted' && a.creditsRemaining > 0
  );

  if (!nextAcc) {
    saveDb(db);
    res.status(409).json({
      ok: false,
      allExhausted: true,
      accounts: db.accounts,
      error:
        'Semua akun di Pool saat ini sudah habis tokennya! Tambahkan akun baru atau klik Refill Kuota pada akun yang sudah terisi ulang.',
    });
    return;
  }

  nextAcc.status = 'active';
  nextAcc.lastUsedAt = new Date().toISOString();
  db.bridge.activeAccountId = nextAcc.id;
  saveDb(db);

  const launchChrome = req.body?.launchChrome !== false;
  if (launchChrome) {
    launchChromeForAccount(nextAcc, false);
  }

  res.json({
    ok: true,
    exhaustedAccount: currentAcc,
    rotatedTo: nextAcc,
    accounts: db.accounts,
    bridge: db.bridge,
  });
});

app.post('/api/accounts/refill-all', (_req, res) => {
  db.accounts.forEach((a, idx) => {
    a.creditsRemaining = a.creditsMax;
    a.status = idx === 0 ? 'active' : 'ready';
  });
  if (db.accounts[0]) {
    db.bridge.activeAccountId = db.accounts[0].id;
  }
  saveDb(db);
  res.json({ ok: true, accounts: db.accounts, bridge: db.bridge });
});

// ─── Characters & Products Library ───────────────────────────────────────────

app.post('/api/characters', (req, res) => {
  const item: CharacterAsset = {
    id: `char_${Date.now()}`,
    name: req.body.name || 'Karakter Baru',
    demographic: req.body.demographic || 'young Indonesian adult, mid 20s',
    appearance: req.body.appearance || '',
    defaultOutfit: req.body.defaultOutfit || 'casual everyday t-shirt',
    speakingStyle: req.body.speakingStyle || 'natural santai sehari-hari',
    imageUrl: req.body.imageUrl,
    filePath: req.body.filePath,
    createdAt: new Date().toISOString(),
  };
  db.characters.push(item);
  saveDb(db);
  res.json({ ok: true, character: item, characters: db.characters });
});

app.patch('/api/characters/:id', (req, res) => {
  const item = db.characters.find((c) => c.id === req.params.id);
  if (!item) {
    res.status(404).json({ ok: false, error: 'Karakter tidak ditemukan.' });
    return;
  }
  Object.assign(item, req.body);
  saveDb(db);
  res.json({ ok: true, character: item, characters: db.characters });
});

app.delete('/api/characters/:id', (req, res) => {
  db.characters = db.characters.filter((c) => c.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true, characters: db.characters });
});

app.post('/api/products', (req, res) => {
  const item: ProductAsset = {
    id: `prod_${Date.now()}`,
    name: req.body.name || 'Produk Baru',
    category: req.body.category || 'Umum',
    verifiedSpecs: req.body.verifiedSpecs || '',
    bannedClaims: req.body.bannedClaims || '',
    visualDetails: req.body.visualDetails || '',
    imageUrl: req.body.imageUrl,
    filePath: req.body.filePath,
    createdAt: new Date().toISOString(),
  };
  db.products.push(item);
  saveDb(db);
  res.json({ ok: true, product: item, products: db.products });
});

app.patch('/api/products/:id', (req, res) => {
  const item = db.products.find((p) => p.id === req.params.id);
  if (!item) {
    res.status(404).json({ ok: false, error: 'Produk tidak ditemukan.' });
    return;
  }
  Object.assign(item, req.body);
  saveDb(db);
  res.json({ ok: true, product: item, products: db.products });
});

app.delete('/api/products/:id', (req, res) => {
  db.products = db.products.filter((p) => p.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true, products: db.products });
});

// ─── Projects CRUD ───────────────────────────────────────────────────────────

app.post('/api/projects', (req, res) => {
  const now = new Date().toISOString();
  const mode = req.body.contentMode === 'storytelling' ? 'storytelling' : 'ugc';
  const newProj: StudioProject = {
    id: `proj_${Date.now()}`,
    title: req.body.title || (mode === 'ugc' ? 'Project UGC Baru' : 'Project Storytelling Baru'),
    contentMode: mode,
    flowModel: req.body.flowModel || 'omni_flash_15',
    maxClipDurationSec: Number(req.body.maxClipDurationSec) || 15,
    aspectRatio: req.body.aspectRatio || '9:16',
    targetDurationSec: Number(req.body.targetDurationSec) || 30,
    characterId: req.body.characterId || db.characters[0]?.id,
    productId: mode === 'ugc' ? req.body.productId || db.products[0]?.id : undefined,
    useOutfitIngredient: true,
    useLocationIngredient: false,
    scenePresetId: mode === 'ugc' ? 'cozy_room_day' : 'cozy_night',
    customLocation: '',
    lightingPresetId: 'auto_scene',
    cameraPresetId: mode === 'ugc' ? 'tripod_casual' : 'selfie_handheld',
    personaId: mode === 'ugc' ? 'teman_jujur' : 'storyteller',
    customPersona: '',
    toneId: 'casual_gue_lu',
    hookId: mode === 'ugc' ? 'pain_point' : 'story_opening',
    storyArcId: 'twist_relatable',
    painPointOrPremise: '',
    ctaText: '',
    rawScript: '',
    scenes: [],
    stitchSettings: {
      trimStartDefault: 0.05,
      trimEndDefault: 0.12,
      applyRealismGrain: true,
      normalizeAudio: true,
      copyToHasilUgc: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  db.projects.unshift(newProj);
  db.bridge.activeProjectId = newProj.id;
  db.bridge.activeSceneId = undefined;
  saveDb(db);
  res.json({ ok: true, project: newProj, projects: db.projects, bridge: db.bridge });
});

app.put('/api/projects/:id', (req, res) => {
  const idx = db.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ ok: false, error: 'Project tidak ditemukan.' });
    return;
  }
  const updated: StudioProject = {
    ...db.projects[idx],
    ...req.body,
    id: req.params.id,
    updatedAt: new Date().toISOString(),
  };
  db.projects[idx] = updated;
  saveDb(db);
  res.json({ ok: true, project: updated });
});

app.delete('/api/projects/:id', (req, res) => {
  db.projects = db.projects.filter((p) => p.id !== req.params.id);
  if (db.bridge.activeProjectId === req.params.id) {
    db.bridge.activeProjectId = db.projects[0]?.id;
    db.bridge.activeSceneId = db.projects[0]?.scenes[0]?.id;
  }
  saveDb(db);
  res.json({ ok: true, projects: db.projects, bridge: db.bridge });
});

// ─── Bridge State (Used by Chrome Extension inside Google Flow!) ─────────────

app.post('/api/bridge', (req, res) => {
  db.bridge = {
    ...db.bridge,
    ...(req.body.bridgeMode !== undefined ? { bridgeMode: req.body.bridgeMode } : {}),
    ...(req.body.activeAccountId !== undefined ? { activeAccountId: req.body.activeAccountId } : {}),
    ...(req.body.activeProjectId !== undefined ? { activeProjectId: req.body.activeProjectId } : {}),
    ...(req.body.activeSceneId !== undefined ? { activeSceneId: req.body.activeSceneId } : {}),
    ...(req.body.activeMotionJobId !== undefined ? { activeMotionJobId: req.body.activeMotionJobId } : {}),
    ...(req.body.activeMotionSegmentId !== undefined ? { activeMotionSegmentId: req.body.activeMotionSegmentId } : {}),
  };
  saveDb(db);
  res.json({ ok: true, bridge: db.bridge });
});

function listRecentDownloadsMp4(limit = 6): DownloadsFileItem[] {
  try {
    if (!fs.existsSync(DOWNLOADS_DIR)) return [];
    const entries = fs.readdirSync(DOWNLOADS_DIR);
    const mp4s: { filename: string; fullPath: string; sizeMb: number; mtimeMs: number; modifiedAt: string }[] = [];

    for (const name of entries) {
      if (!name.toLowerCase().endsWith('.mp4')) continue;
      const full = path.join(DOWNLOADS_DIR, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && st.size > 10 * 1024) {
          mp4s.push({
            filename: name,
            fullPath: full,
            sizeMb: Math.round((st.size / (1024 * 1024)) * 100) / 100,
            mtimeMs: st.mtimeMs,
            modifiedAt: st.mtime.toISOString(),
          });
        }
      } catch {
        // Ignore locked/transient files
      }
    }

    mp4s.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return mp4s.slice(0, limit).map(({ mtimeMs: _m, ...rest }) => rest);
  } catch {
    return [];
  }
}

app.get('/api/downloads/recent', (_req, res) => {
  res.json({ ok: true, files: listRecentDownloadsMp4(8), downloadsDir: DOWNLOADS_DIR });
});

app.get('/api/bridge/state', async (req, res) => {
  if (req.query.source === 'ext') {
    lastExtensionPingMs = Date.now();
    db.bridge.lastExtensionPingAt = new Date().toISOString();
  }
  const extPingOnline = lastExtensionPingMs > 0 && Date.now() - lastExtensionPingMs < 14000;

  let activeAccount =
    db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
    db.accounts.find((a) => a.status === 'active') ||
    db.accounts[0];

  const aliveCdp = await findAliveCdpPortAcrossAccounts(activeAccount, db.accounts, true);
  if (aliveCdp?.account && aliveCdp.account.id !== activeAccount?.id) {
    activeAccount = aliveCdp.account;
    db.bridge.activeAccountId = activeAccount.id;
  }
  const cdpOnline = Boolean(aliveCdp);
  const extensionOnline = extPingOnline || cdpOnline;

  // If Motion Clone mode is active in Bridge:
  if (db.bridge.bridgeMode === 'motion') {
    const jobs = db.motionJobs || [];
    const job = jobs.find((j) => j.id === db.bridge.activeMotionJobId) || jobs[0];
    if (job && job.segments.length > 0) {
      const segIdx = Math.max(
        0,
        job.segments.findIndex((s) => s.id === db.bridge.activeMotionSegmentId)
      );
      const seg = job.segments[segIdx] || job.segments[0];
      const character = db.characters.find((c) => c.id === job.characterId);
      const product = db.products.find((p) => p.id === job.productId);
      const compiled = compileMotionClonePrompt(job, seg, character, product);

      res.json({
        ok: true,
        bridgeMode: 'motion',
        activeAccount,
        accounts: db.accounts,
        activeProject: {
          id: job.id,
          title: `🕺 ${job.title}`,
          contentMode: 'motion_clone',
          aspectRatio: job.aspectRatio,
          totalScenes: job.segments.length,
          completedScenes: job.segments.filter((s) => Boolean(s.outputVideoUrl)).length,
          scenesBrief: job.segments.map((s) => ({
            id: s.id,
            sceneNumber: s.segmentNumber,
            beatLabel: `Ref Segmen ${s.segmentNumber}`,
            hasVideo: Boolean(s.outputVideoUrl),
          })),
        },
        activeScene: {
          id: seg.id,
          sceneNumber: seg.segmentNumber,
          beatLabel: `Motion Segmen ${seg.segmentNumber}`,
          durationSec: seg.durationSec,
        },
        compiled,
        recentDownloads: listRecentDownloadsMp4(4),
      });
      return;
    }
  }

  const activeProject =
    db.projects.find((p) => p.id === db.bridge.activeProjectId) || db.projects[0];

  if (!activeProject) {
    res.json({
      ok: true,
      bridgeMode: 'project',
      activeAccount,
      accounts: db.accounts,
      activeProject: null,
      activeScene: null,
      recentDownloads: listRecentDownloadsMp4(4),
    });
    return;
  }

  const sceneIdx = Math.max(
    0,
    activeProject.scenes.findIndex((s) => s.id === db.bridge.activeSceneId)
  );
  const activeScene = activeProject.scenes[sceneIdx] || activeProject.scenes[0] || null;
  const prevScene = sceneIdx > 0 ? activeProject.scenes[sceneIdx - 1] : undefined;

  const character = db.characters.find((c) => c.id === activeProject.characterId);
  const product = db.products.find((p) => p.id === activeProject.productId);

  const compiled = activeScene
    ? compileFlowScenePrompt(activeProject, activeScene, prevScene, character, product)
    : null;

  const queueScenes = activeProject.scenes.map((sc, i) => {
    const prev = i > 0 ? activeProject.scenes[i - 1] : undefined;
    const comp = compileFlowScenePrompt(activeProject, sc, prev, character, product);
    return {
      id: sc.id,
      sceneNumber: sc.sceneNumber,
      beatLabel: sc.beatLabel,
      durationSec: sc.durationSec,
      continuityMode: sc.continuityMode,
      hasVideo: Boolean(sc.videoUrl),
      prompt: comp.prompt,
      requiredAttachments: comp.requiredAttachments,
    };
  });

  res.json({
    ok: true,
    bridgeMode: 'project',
    extensionOnline,
    autoRunJob: db.bridge.autoRunJob || null,
    activeAccount,
    accounts: db.accounts,
    activeProject: {
      id: activeProject.id,
      title: activeProject.title,
      contentMode: activeProject.contentMode,
      aspectRatio: activeProject.aspectRatio,
      finalVideoUrl: activeProject.finalVideoUrl,
      finalDurationSec: activeProject.finalDurationSec,
      totalScenes: activeProject.scenes.length,
      completedScenes: activeProject.scenes.filter((s) => Boolean(s.videoUrl)).length,
      scenesBrief: activeProject.scenes.map((s) => ({
        id: s.id,
        sceneNumber: s.sceneNumber,
        beatLabel: s.beatLabel,
        hasVideo: Boolean(s.videoUrl),
      })),
    },
    activeScene,
    compiled,
    queueScenes,
    recentDownloads: listRecentDownloadsMp4(6),
  });
});

// ─── 1-Click Auto-Run Trigger & Live Progress Bridge (Zero-Extension CDP + Ext Fallback) ─

app.post('/api/projects/:projectId/start-autorun', async (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.projectId);
  if (!project || project.scenes.length === 0) {
    res.status(400).json({ ok: false, error: 'Project atau daftar scene belum tersedia.' });
    return;
  }

  const mode = (req.body?.mode as 'all' | 'pilot_s1' | 'rest') || 'all';
  const firstPending = project.scenes.find((s) => !s.videoUrl) || project.scenes[0];

  let activeAcc =
    db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
    db.accounts.find((a) => a.status === 'active') ||
    db.accounts[0];

  const extPingOnline = lastExtensionPingMs > 0 && Date.now() - lastExtensionPingMs < 14000;
  let aliveCdp = await findAliveCdpPortAcrossAccounts(activeAcc, db.accounts, false);
  let cdpPort = aliveCdp
    ? aliveCdp.port
    : activeAcc
    ? getCdpPortForAccount(activeAcc.id, db.accounts)
    : 9321;
  let cdpReady = Boolean(aliveCdp);
  if (aliveCdp?.account && aliveCdp.account.id !== activeAcc?.id) {
    activeAcc = aliveCdp.account;
    db.bridge.activeAccountId = activeAcc.id;
  }
  let launchedChrome = false;

  if (!cdpReady && !extPingOnline && activeAcc) {
    activeAcc.status = 'active';
    activeAcc.lastUsedAt = new Date().toISOString();
    db.bridge.activeAccountId = activeAcc.id;
    launchChromeForAccount(activeAcc, false);
    launchedChrome = true;

    // Wait up to 6s for newly launched Chrome to expose its CDP debugging port
    for (let i = 0; i < 11; i++) {
      await new Promise((r) => setTimeout(r, 550));
      cdpReady = await isCdpPortAlive(cdpPort, false);
      if (cdpReady) break;
    }
  }

  const jobId = `ar_${Date.now()}`;
  db.bridge.bridgeMode = 'project';
  db.bridge.activeProjectId = project.id;
  db.bridge.activeSceneId = firstPending.id;

  // Case 1: Native Zero-Extension CDP is ready! Launch full autonomous server-side runner!
  if (cdpReady) {
    db.bridge.autoRunJob = {
      id: jobId,
      projectId: project.id,
      mode,
      runner: 'cdp',
      state: 'running',
      stepText: launchedChrome
        ? '🚀 Chrome Otomatis terbuka! Masuk ke + New project & memulai Scene 1...'
        : '⚡ Terhubung ke Chrome Otomatis! Memulai antrean scene...',
      currentSceneNumber: firstPending.sceneNumber,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);

    void runProjectViaCdp({
      jobId,
      cdpPort,
      mode,
      projectId: project.id,
      mediaDir: MEDIA_DIR,
      clipsDir: CLIPS_DIR,
      framesDir: FRAMES_DIR,
      exportsDir: EXPORTS_DIR,
      tempDir: TEMP_DIR,
      hasilUgcDir: HASIL_UGC_DIR,
      getProjectAndAssets: () => {
        const liveProj = db.projects.find((p) => p.id === project.id);
        const liveChar = db.characters.find((c) => c.id === liveProj?.characterId);
        const liveProd = db.products.find((p) => p.id === liveProj?.productId);
        const liveAcc =
          db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
          db.accounts.find((a) => a.status === 'active') ||
          db.accounts[0];
        return {
          project: liveProj,
          character: liveChar,
          product: liveProd,
          activeAccount: liveAcc,
        };
      },
      onReportProgress: (state, stepText, currentSceneNumber) => {
        if (!db.bridge.autoRunJob || db.bridge.autoRunJob.id !== jobId) return;
        db.bridge.autoRunJob = {
          ...db.bridge.autoRunJob,
          state,
          stepText,
          ...(currentSceneNumber !== undefined ? { currentSceneNumber } : {}),
          updatedAt: new Date().toISOString(),
        };
        saveDb(db);
      },
      onSaveDb: () => saveDb(db),
      sanitizeFilename,
    });

    res.json({
      ok: true,
      launchedChrome,
      extensionOnline: true,
      cdpOnline: true,
      autoRunJob: db.bridge.autoRunJob,
      bridge: db.bridge,
    });
    return;
  }

  // Case 2: User is running Chrome Extension in their personal browser
  if (extPingOnline) {
    db.bridge.autoRunJob = {
      id: jobId,
      projectId: project.id,
      mode,
      runner: 'ext',
      state: 'queued',
      stepText: 'Menghubungkan ke Google Flow Companion Extension & memulai Auto-Run...',
      currentSceneNumber: firstPending.sceneNumber,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);

    res.json({
      ok: true,
      launchedChrome: false,
      extensionOnline: true,
      cdpOnline: false,
      autoRunJob: db.bridge.autoRunJob,
      bridge: db.bridge,
    });
    return;
  }

  // Case 3: Old Chrome window for this account (opened before Zero-Extension mode) is still locking the profile!
  const accName = activeAcc?.name || 'Akun Flow';
  db.bridge.autoRunJob = {
    id: jobId,
    projectId: project.id,
    mode,
    runner: 'cdp',
    state: 'paused',
    stepText: `⚠️ Tutup (klik X) dulu semua jendela Chrome "${accName}" yang lama, lalu klik tombol Gas Run ini sekali lagi supaya jalan 100% Otomatis Tanpa Ekstensi!`,
    currentSceneNumber: firstPending.sceneNumber,
    updatedAt: new Date().toISOString(),
  };
  saveDb(db);

  res.json({
    ok: true,
    launchedChrome: false,
    extensionOnline: false,
    cdpOnline: false,
    needsCloseOldWindow: true,
    autoRunJob: db.bridge.autoRunJob,
    bridge: db.bridge,
  });
});

app.post('/api/bridge/autorun-progress', async (req, res) => {
  if (req.body?.clear) {
    abortActiveCdpAutoRun();
    db.bridge.autoRunJob = undefined;
    saveDb(db);
    res.json({ ok: true, autoRunJob: null });
    return;
  }

  if (isCdpAutoRunBusy()) {
    res.json({ ok: true, autoRunJob: db.bridge.autoRunJob || null });
    return;
  }

  // If an older Dock tab triggers local runAutoQueue ("Menyiapkan ruang kerja Google Flow..."),
  // automatically upgrade it to the native CDP runner when a CDP port is alive!
  if (
    req.body?.state === 'running' &&
    /Menyiapkan ruang kerja Google Flow/i.test(String(req.body?.stepText || ''))
  ) {
    const activeProject =
      db.projects.find((p) => p.id === db.bridge.activeProjectId) || db.projects[0];
    let activeAcc =
      db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
      db.accounts.find((a) => a.status === 'active') ||
      db.accounts[0];
    const aliveCdp = await findAliveCdpPortAcrossAccounts(activeAcc, db.accounts, false);
    if (aliveCdp && activeProject && activeProject.scenes.length > 0) {
      if (aliveCdp.account) {
        activeAcc = aliveCdp.account;
        db.bridge.activeAccountId = activeAcc.id;
      }
      const jobId = `ar_${Date.now()}`;
      const firstPending =
        activeProject.scenes.find((s) => !s.videoUrl) || activeProject.scenes[0];
      db.bridge.autoRunJob = {
        id: jobId,
        projectId: activeProject.id,
        mode: 'all',
        runner: 'cdp',
        state: 'running',
        stepText: '⚡ Terhubung ke Chrome Otomatis! Memulai antrean scene...',
        currentSceneNumber: firstPending.sceneNumber,
        updatedAt: new Date().toISOString(),
      };
      saveDb(db);

      void runProjectViaCdp({
        jobId,
        cdpPort: aliveCdp.port,
        mode: 'all',
        projectId: activeProject.id,
        mediaDir: MEDIA_DIR,
        clipsDir: CLIPS_DIR,
        framesDir: FRAMES_DIR,
        exportsDir: EXPORTS_DIR,
        tempDir: TEMP_DIR,
        hasilUgcDir: HASIL_UGC_DIR,
        getProjectAndAssets: () => {
          const liveProj = db.projects.find((p) => p.id === activeProject.id);
          const liveChar = db.characters.find((c) => c.id === liveProj?.characterId);
          const liveProd = db.products.find((p) => p.id === liveProj?.productId);
          const liveAcc =
            db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
            db.accounts.find((a) => a.status === 'active') ||
            db.accounts[0];
          return {
            project: liveProj,
            character: liveChar,
            product: liveProd,
            activeAccount: liveAcc,
          };
        },
        onReportProgress: (state, stepText, currentSceneNumber) => {
          if (!db.bridge.autoRunJob || db.bridge.autoRunJob.id !== jobId) return;
          db.bridge.autoRunJob = {
            ...db.bridge.autoRunJob,
            state,
            stepText,
            ...(currentSceneNumber !== undefined ? { currentSceneNumber } : {}),
            updatedAt: new Date().toISOString(),
          };
          saveDb(db);
        },
        onSaveDb: () => saveDb(db),
        sanitizeFilename,
      });

      res.json({ ok: true, autoRunJob: db.bridge.autoRunJob });
      return;
    }
  }

  if (db.bridge.autoRunJob) {
    db.bridge.autoRunJob = {
      ...db.bridge.autoRunJob,
      ...(req.body.state ? { state: req.body.state } : {}),
      ...(req.body.stepText ? { stepText: req.body.stepText } : {}),
      ...(req.body.currentSceneNumber !== undefined
        ? { currentSceneNumber: req.body.currentSceneNumber }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
  }
  res.json({ ok: true, autoRunJob: db.bridge.autoRunJob || null });
});

// ─── Motion Clone Studio Endpoints (Reference Video + Image -> Exact Motion) ─

app.post('/api/motion-jobs', (req, res) => {
  if (!db.motionJobs) db.motionJobs = [];
  const now = new Date().toISOString();
  const job: MotionCloneJob = {
    id: `mjob_${Date.now()}`,
    title: req.body?.title || `Motion Clone #${db.motionJobs.length + 1}`,
    cloneMode: req.body?.cloneMode || 'character_swap',
    maxSegmentSec: Number(req.body?.maxSegmentSec) || 15,
    aspectRatio: req.body?.aspectRatio || '9:16',
    characterId: req.body?.characterId || db.characters[0]?.id,
    productId: req.body?.productId || db.products[0]?.id,
    newLocationPrompt: '',
    preserveOriginalExpression: true,
    applyRealismGrain: true,
    copyToHasilUgc: true,
    segments: [],
    createdAt: now,
    updatedAt: now,
  };
  db.motionJobs.unshift(job);
  db.bridge.bridgeMode = 'motion';
  db.bridge.activeMotionJobId = job.id;
  saveDb(db);
  res.json({ ok: true, job, motionJobs: db.motionJobs, bridge: db.bridge });
});

app.put('/api/motion-jobs/:id', (req, res) => {
  if (!db.motionJobs) db.motionJobs = [];
  const idx = db.motionJobs.findIndex((j) => j.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ ok: false, error: 'Motion Clone job tidak ditemukan.' });
    return;
  }
  const updated: MotionCloneJob = {
    ...db.motionJobs[idx],
    ...req.body,
    id: req.params.id,
    updatedAt: new Date().toISOString(),
  };
  db.motionJobs[idx] = updated;
  saveDb(db);
  res.json({ ok: true, job: updated, motionJobs: db.motionJobs });
});

app.delete('/api/motion-jobs/:id', (req, res) => {
  if (!db.motionJobs) db.motionJobs = [];
  db.motionJobs = db.motionJobs.filter((j) => j.id !== req.params.id);
  if (db.bridge.activeMotionJobId === req.params.id) {
    db.bridge.activeMotionJobId = db.motionJobs[0]?.id;
    db.bridge.activeMotionSegmentId = db.motionJobs[0]?.segments[0]?.id;
  }
  saveDb(db);
  res.json({ ok: true, motionJobs: db.motionJobs, bridge: db.bridge });
});

app.post(
  '/api/motion-jobs/:id/upload-reference',
  upload.single('video'),
  async (req, res) => {
    try {
      if (!db.motionJobs) db.motionJobs = [];
      const job = db.motionJobs.find((j) => j.id === req.params.id);
      if (!job) {
        res.status(404).json({ ok: false, error: 'Job tidak ditemukan.' });
        return;
      }

      let srcPath = '';
      let srcUrl = '';

      if (req.file) {
        srcPath = req.file.path;
        srcUrl = `/media/uploads/${req.file.filename}`;
      } else if (req.body?.grabLatestFromDownloads) {
        const recent = listRecentDownloadsMp4(1);
        if (!recent.length) {
          res.status(404).json({ ok: false, error: 'Tidak ada file .mp4 terbaru di folder Downloads.' });
          return;
        }
        const destName = `refsrc_${job.id}_${Date.now()}.mp4`;
        srcPath = path.join(UPLOADS_DIR, destName);
        await fs.promises.copyFile(recent[0].fullPath, srcPath);
        srcUrl = `/media/uploads/${destName}`;
      } else {
        res.status(400).json({ ok: false, error: 'Upload file video referensi terlebih dahulu.' });
        return;
      }

      const maxSeg = Number(req.body?.maxSegmentSec) || job.maxSegmentSec || 15;
      const sliced = await sliceReferenceVideo(srcPath, maxSeg, job.id, CLIPS_DIR, FRAMES_DIR);

      job.sourceVideoUrl = srcUrl;
      job.sourceVideoPath = srcPath;
      job.sourceDurationSec = sliced.sourceDurationSec;
      job.aspectRatio = sliced.detectedRatio;
      job.maxSegmentSec = maxSeg;
      job.segments = sliced.segments;
      job.updatedAt = new Date().toISOString();

      db.bridge.bridgeMode = 'motion';
      db.bridge.activeMotionJobId = job.id;
      db.bridge.activeMotionSegmentId = sliced.segments[0]?.id;
      saveDb(db);

      res.json({ ok: true, job, motionJobs: db.motionJobs, bridge: db.bridge });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Gagal memproses video referensi.' });
    }
  }
);

app.post('/api/motion-jobs/:id/reslice', async (req, res) => {
  try {
    const job = (db.motionJobs || []).find((j) => j.id === req.params.id);
    if (!job || !job.sourceVideoPath || !fs.existsSync(job.sourceVideoPath)) {
      res.status(404).json({ ok: false, error: 'Video referensi sumber belum diupload.' });
      return;
    }
    const maxSeg = Math.max(4, Math.min(15, Number(req.body?.maxSegmentSec) || 15));
    const sliced = await sliceReferenceVideo(
      job.sourceVideoPath,
      maxSeg,
      job.id,
      CLIPS_DIR,
      FRAMES_DIR
    );
    job.maxSegmentSec = maxSeg;
    job.segments = sliced.segments;
    job.updatedAt = new Date().toISOString();
    db.bridge.bridgeMode = 'motion';
    db.bridge.activeMotionJobId = job.id;
    db.bridge.activeMotionSegmentId = sliced.segments[0]?.id;
    saveDb(db);
    res.json({ ok: true, job, motionJobs: db.motionJobs, bridge: db.bridge });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post(
  '/api/motion-jobs/:jobId/segments/:segId/attach-output',
  upload.single('video'),
  async (req, res) => {
    try {
      const job = (db.motionJobs || []).find((j) => j.id === req.params.jobId);
      const segIdx = job?.segments.findIndex((s) => s.id === req.params.segId) ?? -1;
      if (!job || segIdx === -1) {
        res.status(404).json({ ok: false, error: 'Segmen Motion Clone tidak ditemukan.' });
        return;
      }
      const seg = job.segments[segIdx];

      let sourceVideoPath = '';
      if (req.file) {
        sourceVideoPath = req.file.path;
      } else if (req.body?.grabLatestFromDownloads) {
        const recent = listRecentDownloadsMp4(1);
        if (!recent.length) {
          res.status(404).json({ ok: false, error: 'Tidak ditemukan MP4 terbaru di folder Downloads.' });
          return;
        }
        sourceVideoPath = recent[0].fullPath;
      } else if (req.body?.sourceFilePath) {
        const candidate = path.resolve(String(req.body.sourceFilePath));
        if (!candidate.startsWith(path.resolve(DOWNLOADS_DIR)) && !candidate.startsWith(DATA_DIR)) {
          res.status(403).json({ ok: false, error: 'Path sumber di luar Downloads.' });
          return;
        }
        sourceVideoPath = candidate;
      } else {
        res.status(400).json({ ok: false, error: 'Pilih file MP4 hasil generate.' });
        return;
      }

      const outName = `mclone_out_${job.id}_s${seg.segmentNumber}_${Date.now()}.mp4`;
      const destPath = path.join(CLIPS_DIR, outName);
      if (sourceVideoPath !== destPath) {
        await fs.promises.copyFile(sourceVideoPath, destPath);
      }
      const info = await probeVideo(destPath);

      const activeAcc =
        db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
        db.accounts.find((a) => a.status === 'active');
      if (activeAcc) {
        activeAcc.creditsRemaining = Math.max(
          0,
          activeAcc.creditsRemaining - (activeAcc.costPerClip || 20)
        );
        if (activeAcc.creditsRemaining === 0) activeAcc.status = 'exhausted';
      }

      seg.outputVideoUrl = `/media/clips/${outName}`;
      seg.outputVideoPath = destPath;
      seg.outputDurationSec = info.durationSec;
      job.updatedAt = new Date().toISOString();

      const nextSeg =
        job.segments.slice(segIdx + 1).find((s) => !s.outputVideoUrl) ||
        job.segments[segIdx + 1] ||
        seg;
      db.bridge.bridgeMode = 'motion';
      db.bridge.activeMotionJobId = job.id;
      db.bridge.activeMotionSegmentId = nextSeg.id;
      saveDb(db);

      res.json({
        ok: true,
        job,
        motionJobs: db.motionJobs,
        accounts: db.accounts,
        bridge: db.bridge,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

app.post('/api/motion-jobs/:jobId/stitch', async (req, res) => {
  try {
    const job = (db.motionJobs || []).find((j) => j.id === req.params.jobId);
    if (!job) {
      res.status(404).json({ ok: false, error: 'Motion Clone job tidak ditemukan.' });
      return;
    }

    const readySegs = job.segments.filter((s) => s.outputVideoPath && fs.existsSync(s.outputVideoPath));
    if (!readySegs.length) {
      res.status(400).json({ ok: false, error: 'Belum ada hasil segmen MP4 yang siap digabung.' });
      return;
    }

    const cleanSlug = sanitizeFilename(job.title || 'MotionClone');
    const outFilename = `${cleanSlug}_${Date.now()}.mp4`;
    const outPath = path.join(EXPORTS_DIR, outFilename);

    const { finalDurationSec } = await stitchVideoClips(
      readySegs.map((s) => ({
        videoPath: s.outputVideoPath!,
        trimStartSec: 0,
        trimEndSec: 0.04,
      })),
      job.aspectRatio,
      {
        trimStartDefault: 0,
        trimEndDefault: 0.04,
        applyRealismGrain: job.applyRealismGrain,
        normalizeAudio: true,
        copyToHasilUgc: job.copyToHasilUgc,
      },
      outPath,
      TEMP_DIR
    );

    if (job.copyToHasilUgc && fs.existsSync(HASIL_UGC_DIR)) {
      const hasilCopy = path.join(HASIL_UGC_DIR, `${cleanSlug}_MotionClone.mp4`);
      await fs.promises.copyFile(outPath, hasilCopy).catch(() => {});
    }

    job.finalVideoUrl = `/media/exports/${outFilename}`;
    job.finalVideoPath = outPath;
    job.finalDurationSec = finalDurationSec;
    job.updatedAt = new Date().toISOString();
    saveDb(db);

    res.json({ ok: true, job, motionJobs: db.motionJobs });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Scene Video Attachment + Auto Last-Frame Extraction ─────────────────────

app.post(
  '/api/projects/:projectId/scenes/:sceneId/attach-video',
  upload.single('video'),
  async (req, res) => {
    try {
      const project = db.projects.find((p) => p.id === req.params.projectId);
      if (!project) {
        res.status(404).json({ ok: false, error: 'Project tidak ditemukan.' });
        return;
      }

      const sceneIdx = project.scenes.findIndex((s) => s.id === req.params.sceneId);
      if (sceneIdx === -1) {
        res.status(404).json({ ok: false, error: 'Scene tidak ditemukan.' });
        return;
      }
      const scene = project.scenes[sceneIdx];

      let sourceVideoPath = '';
      if (req.file) {
        sourceVideoPath = req.file.path;
      } else if (req.body?.grabLatestFromDownloads) {
        const recent = listRecentDownloadsMp4(1);
        if (!recent.length) {
          res.status(404).json({
            ok: false,
            error: `Tidak ditemukan file .mp4 di folder Downloads (${DOWNLOADS_DIR}). Download klip dari Google Flow terlebih dahulu.`,
          });
          return;
        }
        sourceVideoPath = recent[0].fullPath;
      } else if (req.body?.sourceFilePath) {
        const candidate = path.resolve(String(req.body.sourceFilePath));
        if (!candidate.startsWith(path.resolve(DOWNLOADS_DIR)) && !candidate.startsWith(DATA_DIR)) {
          res.status(403).json({ ok: false, error: 'Lokasi sumber file di luar folder Downloads/Data.' });
          return;
        }
        if (!fs.existsSync(candidate)) {
          res.status(404).json({ ok: false, error: 'File MP4 sumber tidak ditemukan.' });
          return;
        }
        sourceVideoPath = candidate;
      } else {
        res.status(400).json({ ok: false, error: 'Pilih file video atau gunakan Tarik dari Downloads.' });
        return;
      }

      const clipFilename = `clip_${project.id}_s${scene.sceneNumber}_${Date.now()}.mp4`;
      const destClipPath = path.join(CLIPS_DIR, clipFilename);

      if (sourceVideoPath !== destClipPath) {
        await fs.promises.copyFile(sourceVideoPath, destClipPath);
      }

      // Extract Last Frame PNG automatically for >10s Cross-Account Seamless Chaining!
      const frameFilename = `lastframe_${project.id}_s${scene.sceneNumber}_${Date.now()}.png`;
      const destFramePath = path.join(FRAMES_DIR, frameFilename);
      const { durationSec } = await extractLastFrame(destClipPath, destFramePath, 0.14);

      const activeAcc =
        db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
        db.accounts.find((a) => a.status === 'active');

      if (activeAcc && req.body?.deductCredits !== false && req.body?.deductCredits !== 'false') {
        activeAcc.creditsRemaining = Math.max(0, activeAcc.creditsRemaining - (activeAcc.costPerClip || 20));
        if (activeAcc.creditsRemaining === 0) {
          activeAcc.status = 'exhausted';
        }
      }

      scene.videoUrl = `/media/clips/${clipFilename}`;
      scene.videoPath = destClipPath;
      scene.actualDurationSec = durationSec;
      scene.lastFrameUrl = `/media/frames/${frameFilename}`;
      scene.lastFramePath = destFramePath;
      scene.renderedByAccountId = activeAcc?.id;
      scene.sourceDownloadPath = sourceVideoPath;
      project.updatedAt = new Date().toISOString();

      // Advance bridge automatically to the next unrendered scene if available
      const nextScene =
        project.scenes.slice(sceneIdx + 1).find((s) => !s.videoUrl) ||
        project.scenes[sceneIdx + 1] ||
        scene;
      db.bridge.activeProjectId = project.id;
      db.bridge.activeSceneId = nextScene.id;

      saveDb(db);

      res.json({
        ok: true,
        project,
        scene,
        nextSceneId: nextScene.id,
        accounts: db.accounts,
        bridge: db.bridge,
      });
    } catch (err: any) {
      console.error('Error attaching video:', err);
      res.status(500).json({ ok: false, error: err.message || 'Gagal memproses klip video.' });
    }
  }
);

app.post('/api/projects/:projectId/scenes/:sceneId/extract-frame', async (req, res) => {
  try {
    const project = db.projects.find((p) => p.id === req.params.projectId);
    const scene = project?.scenes.find((s) => s.id === req.params.sceneId);
    if (!project || !scene || !scene.videoPath || !fs.existsSync(scene.videoPath)) {
      res.status(404).json({ ok: false, error: 'Klip video untuk scene ini belum tersedia.' });
      return;
    }

    const offsetSec = Math.max(0.05, Math.min(4.0, Number(req.body?.offsetFromEndSec) || 0.25));
    const frameFilename = `lastframe_${project.id}_s${scene.sceneNumber}_${Date.now()}.png`;
    const destFramePath = path.join(FRAMES_DIR, frameFilename);

    await extractLastFrame(scene.videoPath, destFramePath, offsetSec);

    scene.lastFrameUrl = `/media/frames/${frameFilename}`;
    scene.lastFramePath = destFramePath;
    project.updatedAt = new Date().toISOString();
    saveDb(db);

    res.json({ ok: true, scene, project });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Direct Base64 Captured Video Upload (Zero-Click Capture from Google Flow DOM) ─

app.post('/api/projects/:projectId/scenes/:sceneId/upload-captured-video', async (req, res) => {
  try {
    const project = db.projects.find((p) => p.id === req.params.projectId);
    const sceneIdx = project?.scenes.findIndex((s) => s.id === req.params.sceneId) ?? -1;
    if (!project || sceneIdx === -1) {
      res.status(404).json({ ok: false, error: 'Project atau scene tidak ditemukan.' });
      return;
    }

    const dataUrl = String(req.body?.dataUrl || '');
    const commaIdx = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || commaIdx === -1) {
      res.status(400).json({ ok: false, error: 'Payload video base64 tidak valid.' });
      return;
    }

    const scene = project.scenes[sceneIdx];
    const buf = Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
    if (buf.length < 15 * 1024) {
      res.status(400).json({ ok: false, error: 'Ukuran video terlalu kecil / belum selesai dimuat.' });
      return;
    }

    const clipFilename = `clip_${project.id}_s${scene.sceneNumber}_${Date.now()}.mp4`;
    const destClipPath = path.join(CLIPS_DIR, clipFilename);
    await fs.promises.writeFile(destClipPath, buf);

    const frameFilename = `lastframe_${project.id}_s${scene.sceneNumber}_${Date.now()}.png`;
    const destFramePath = path.join(FRAMES_DIR, frameFilename);
    const { durationSec } = await extractLastFrame(destClipPath, destFramePath, 0.14);

    const activeAcc =
      db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
      db.accounts.find((a) => a.status === 'active');

    if (activeAcc) {
      activeAcc.creditsRemaining = Math.max(
        0,
        activeAcc.creditsRemaining - (activeAcc.costPerClip || 20)
      );
      if (activeAcc.creditsRemaining === 0) activeAcc.status = 'exhausted';
    }

    scene.videoUrl = `/media/clips/${clipFilename}`;
    scene.videoPath = destClipPath;
    scene.actualDurationSec = durationSec;
    scene.lastFrameUrl = `/media/frames/${frameFilename}`;
    scene.lastFramePath = destFramePath;
    scene.renderedByAccountId = activeAcc?.id;
    project.updatedAt = new Date().toISOString();

    const nextScene =
      project.scenes.slice(sceneIdx + 1).find((s) => !s.videoUrl) ||
      project.scenes[sceneIdx + 1] ||
      scene;
    db.bridge.activeProjectId = project.id;
    db.bridge.activeSceneId = nextScene.id;

    // Auto-stitch immediately when the final scene finishes capturing!
    const readyScenes = project.scenes.filter((s) => s.videoPath && fs.existsSync(s.videoPath));
    const allComplete = readyScenes.length === project.scenes.length && project.scenes.length > 0;
    let stitched = false;
    let finalDurationSec = project.finalDurationSec || 0;

    if (allComplete && req.body?.autoStitchIfComplete !== false) {
      const cleanSlug = sanitizeFilename(project.title || 'FlowStudio_Output');
      const outFilename = `${cleanSlug}_${Date.now()}.mp4`;
      const outPath = path.join(EXPORTS_DIR, outFilename);
      const clipInputs = readyScenes.map((s) => ({
        videoPath: s.videoPath!,
        trimStartSec: s.trimStartSec ?? project.stitchSettings.trimStartDefault ?? 0.05,
        trimEndSec: s.trimEndSec ?? project.stitchSettings.trimEndDefault ?? 0.12,
      }));
      const stitchRes = await stitchVideoClips(
        clipInputs,
        project.aspectRatio,
        project.stitchSettings,
        outPath,
        TEMP_DIR
      );
      finalDurationSec = stitchRes.finalDurationSec;
      stitched = true;

      if (project.stitchSettings.copyToHasilUgc && fs.existsSync(HASIL_UGC_DIR)) {
        const hasilCopyPath = path.join(HASIL_UGC_DIR, `${cleanSlug}_FlowStudio.mp4`);
        await fs.promises.copyFile(outPath, hasilCopyPath).catch(() => {});
      }

      project.finalVideoUrl = `/media/exports/${outFilename}`;
      project.finalVideoPath = outPath;
      project.finalDurationSec = finalDurationSec;
    }

    saveDb(db);
    res.json({
      ok: true,
      project,
      scene,
      allComplete,
      stitched,
      finalDurationSec,
      accounts: db.accounts,
      bridge: db.bridge,
    });
  } catch (err: any) {
    console.error('Upload captured video error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Gagal menyimpan video hasil capture.' });
  }
});

// ─── 1-Click Scene Reroll Reset (Clear Single Bugged Clip Without Touching Others) ─

app.post('/api/projects/:projectId/scenes/:sceneId/clear-video', (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.projectId);
  const scene = project?.scenes.find((s) => s.id === req.params.sceneId);
  if (!project || !scene) {
    res.status(404).json({ ok: false, error: 'Scene tidak ditemukan.' });
    return;
  }

  scene.videoUrl = undefined;
  scene.videoPath = undefined;
  scene.actualDurationSec = undefined;
  scene.lastFrameUrl = undefined;
  scene.lastFramePath = undefined;
  scene.sourceDownloadPath = undefined;
  project.updatedAt = new Date().toISOString();

  db.bridge.bridgeMode = 'project';
  db.bridge.activeProjectId = project.id;
  db.bridge.activeSceneId = scene.id;
  saveDb(db);

  res.json({ ok: true, project, scene, bridge: db.bridge });
});

// ─── 1-Click Batch Pull N Recent Downloads & Auto-Stitch 20-40s MP4 ─────────

app.post('/api/projects/:projectId/batch-pull-and-stitch', async (req, res) => {
  try {
    const project = db.projects.find((p) => p.id === req.params.projectId);
    if (!project) {
      res.status(404).json({ ok: false, error: 'Project tidak ditemukan.' });
      return;
    }

    const emptyScenes = project.scenes.filter((s) => !s.videoUrl);
    const alreadyUsedPaths = new Set(
      project.scenes
        .map((s) => (s.sourceDownloadPath ? path.resolve(s.sourceDownloadPath) : ''))
        .filter(Boolean)
    );

    let attachedCount = 0;
    if (emptyScenes.length > 0) {
      const cutoffMs = Date.now() - 120 * 60 * 1000; // Last 2 hours of Downloads
      const allRecent = listRecentDownloadsMp4(20).filter((item) => {
        const resolved = path.resolve(item.fullPath);
        const modMs = new Date(item.modifiedAt).getTime();
        return !alreadyUsedPaths.has(resolved) && modMs >= cutoffMs;
      });

      if (allRecent.length === 0) {
        res.status(404).json({
          ok: false,
          error:
            'Belum ada file MP4 baru di folder Downloads (2 jam terakhir) yang belum dipakai. Klik tombol Download dulu pada hasil video di Google Flow!',
        });
        return;
      }

      // Take up to emptyScenes.length newest files, then sort oldest -> newest
      // so Download #1 maps to Empty Scene #1, Download #2 maps to Empty Scene #2, etc.!
      const pickedNewestFirst = allRecent.slice(0, emptyScenes.length);
      const pickedChronological = [...pickedNewestFirst].reverse();

      const activeAcc =
        db.accounts.find((a) => a.id === db.bridge.activeAccountId) ||
        db.accounts.find((a) => a.status === 'active');

      for (let i = 0; i < pickedChronological.length; i++) {
        const targetScene = emptyScenes[i];
        const srcItem = pickedChronological[i];
        const clipFilename = `clip_${project.id}_s${targetScene.sceneNumber}_${Date.now()}_${i}.mp4`;
        const destClipPath = path.join(CLIPS_DIR, clipFilename);

        await fs.promises.copyFile(srcItem.fullPath, destClipPath);

        const frameFilename = `lastframe_${project.id}_s${targetScene.sceneNumber}_${Date.now()}_${i}.png`;
        const destFramePath = path.join(FRAMES_DIR, frameFilename);
        const { durationSec } = await extractLastFrame(destClipPath, destFramePath, 0.14);

        targetScene.videoUrl = `/media/clips/${clipFilename}`;
        targetScene.videoPath = destClipPath;
        targetScene.actualDurationSec = durationSec;
        targetScene.lastFrameUrl = `/media/frames/${frameFilename}`;
        targetScene.lastFramePath = destFramePath;
        targetScene.renderedByAccountId = activeAcc?.id;
        targetScene.sourceDownloadPath = srcItem.fullPath;
        attachedCount++;

        if (activeAcc) {
          activeAcc.creditsRemaining = Math.max(
            0,
            activeAcc.creditsRemaining - (activeAcc.costPerClip || 20)
          );
          if (activeAcc.creditsRemaining === 0) activeAcc.status = 'exhausted';
        }
      }
    }

    const readyScenes = project.scenes.filter((s) => s.videoPath && fs.existsSync(s.videoPath));
    const allComplete = readyScenes.length === project.scenes.length && project.scenes.length > 0;
    let stitched = false;
    let finalDurationSec = project.finalDurationSec || 0;
    let copiedToHasilUgcPath: string | null = null;

    if (allComplete && req.body?.autoStitch !== false) {
      const cleanSlug = sanitizeFilename(project.title || 'FlowStudio_Output');
      const outFilename = `${cleanSlug}_${Date.now()}.mp4`;
      const outPath = path.join(EXPORTS_DIR, outFilename);

      const clipInputs = readyScenes.map((s) => ({
        videoPath: s.videoPath!,
        trimStartSec: s.trimStartSec ?? project.stitchSettings.trimStartDefault ?? 0.05,
        trimEndSec: s.trimEndSec ?? project.stitchSettings.trimEndDefault ?? 0.12,
      }));

      const stitchRes = await stitchVideoClips(
        clipInputs,
        project.aspectRatio,
        project.stitchSettings,
        outPath,
        TEMP_DIR
      );
      finalDurationSec = stitchRes.finalDurationSec;
      stitched = true;

      if (project.stitchSettings.copyToHasilUgc && fs.existsSync(HASIL_UGC_DIR)) {
        const hasilCopyPath = path.join(HASIL_UGC_DIR, `${cleanSlug}_FlowStudio.mp4`);
        await fs.promises.copyFile(outPath, hasilCopyPath).catch(() => {});
        if (fs.existsSync(hasilCopyPath)) {
          copiedToHasilUgcPath = hasilCopyPath;
        }
      }

      project.finalVideoUrl = `/media/exports/${outFilename}`;
      project.finalVideoPath = outPath;
      project.finalDurationSec = finalDurationSec;
    }

    const nextPending = project.scenes.find((s) => !s.videoUrl) || project.scenes[0];
    if (nextPending) {
      db.bridge.activeProjectId = project.id;
      db.bridge.activeSceneId = nextPending.id;
    }
    project.updatedAt = new Date().toISOString();
    saveDb(db);

    res.json({
      ok: true,
      project,
      attachedCount,
      allComplete,
      stitched,
      finalDurationSec,
      copiedToHasilUgcPath,
      accounts: db.accounts,
      bridge: db.bridge,
    });
  } catch (err: any) {
    console.error('Batch pull & stitch error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Gagal tarik batch & gabung video.' });
  }
});

// ─── FFmpeg Multi-Clip Stitcher (>10s Short & Long Video Merger) ─────────────

app.post('/api/projects/:projectId/stitch', async (req, res) => {
  try {
    const project = db.projects.find((p) => p.id === req.params.projectId);
    if (!project) {
      res.status(404).json({ ok: false, error: 'Project tidak ditemukan.' });
      return;
    }

    if (req.body?.stitchSettings) {
      project.stitchSettings = {
        ...project.stitchSettings,
        ...req.body.stitchSettings,
      };
    }

    const readyScenes = project.scenes.filter((s) => s.videoPath && fs.existsSync(s.videoPath));
    if (readyScenes.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'Belum ada klip MP4 di scene manapun. Masukkan minimal 1-2 klip hasil Google Flow dulu.',
      });
      return;
    }

    const cleanSlug = sanitizeFilename(project.title || 'FlowStudio_Output');
    const outFilename = `${cleanSlug}_${Date.now()}.mp4`;
    const outPath = path.join(EXPORTS_DIR, outFilename);

    const clipInputs = readyScenes.map((s) => ({
      videoPath: s.videoPath!,
      trimStartSec: s.trimStartSec ?? project.stitchSettings.trimStartDefault ?? 0.05,
      trimEndSec: s.trimEndSec ?? project.stitchSettings.trimEndDefault ?? 0.12,
    }));

    const { finalDurationSec } = await stitchVideoClips(
      clipInputs,
      project.aspectRatio,
      project.stitchSettings,
      outPath,
      TEMP_DIR
    );

    let copiedToHasilUgcPath: string | null = null;
    if (project.stitchSettings.copyToHasilUgc && fs.existsSync(HASIL_UGC_DIR)) {
      const hasilCopyPath = path.join(HASIL_UGC_DIR, `${cleanSlug}_FlowStudio.mp4`);
      await fs.promises.copyFile(outPath, hasilCopyPath).catch(() => {});
      if (fs.existsSync(hasilCopyPath)) {
        copiedToHasilUgcPath = hasilCopyPath;
      }
    }

    project.finalVideoUrl = `/media/exports/${outFilename}`;
    project.finalVideoPath = outPath;
    project.finalDurationSec = finalDurationSec;
    project.updatedAt = new Date().toISOString();
    saveDb(db);

    res.json({
      ok: true,
      project,
      finalVideoUrl: project.finalVideoUrl,
      finalVideoPath: outPath,
      finalDurationSec,
      copiedToHasilUgcPath,
      stitchedClipsCount: readyScenes.length,
    });
  } catch (err: any) {
    console.error('Stitch error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Gagal menggabungkan video dengan FFmpeg.' });
  }
});

// ─── Interactive Extension Setup Tab (Opened inside new Account Chrome) ─────

app.get('/api/extension-setup-guide', (req, res) => {
  const accName = String(req.query.acc || 'Akun Flow').replace(/[<>"']/g, '');
  const escapedDir = EXTENSION_DIR.replace(/\\/g, '\\\\');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Setup Ekstensi — ${accName}</title>
  <style>
    body { margin:0; padding:40px 20px; background:#110E0C; color:#F3ECE1; font-family:Inter,system-ui,sans-serif; }
    .box { max-width:640px; margin:0 auto; background:#1A1612; border:1px solid #EE9F27; border-radius:16px; padding:28px; }
    h1 { margin:0 0 8px; color:#EE9F27; font-size:22px; }
    p { color:#A39583; font-size:14px; line-height:1.5; }
    .step { background:#110E0C; border:1px solid #342B22; border-radius:12px; padding:16px; margin-top:14px; }
    .step-title { font-weight:700; color:#F7BE59; margin-bottom:8px; font-size:14px; }
    code { display:block; background:#231D17; padding:10px; border-radius:8px; color:#F3ECE1; margin:8px 0; font-size:13px; word-break:break-all; }
    button { background:#EE9F27; color:#110E0C; border:none; border-radius:8px; padding:10px 16px; font-weight:700; cursor:pointer; font-size:13px; }
    button:hover { background:#F7BE59; }
    .ok { color:#86EFAC; font-weight:700; margin-left:10px; font-size:13px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🧩 Pasang Flow Studio Dock — ${accName}</h1>
    <p>Cukup lakukan 3 langkah singkat ini <strong>1 kali saja</strong> di jendela Chrome ini:</p>

    <div class="step">
      <div class="step-title">Langkah 1: Buka Halaman Ekstensi Chrome</div>
      <p style="margin:0 0 8px;">Klik tombol di bawah, lalu <strong>paste (Ctrl+V) &amp; Enter</strong> di kolom URL paling atas browser ini:</p>
      <code>chrome://extensions</code>
      <button onclick="navigator.clipboard.writeText('chrome://extensions'); document.getElementById('ok1').textContent='✅ Tersalin! Paste di address bar atas'">📋 Copy chrome://extensions</button>
      <span id="ok1" class="ok"></span>
    </div>

    <div class="step">
      <div class="step-title">Langkah 2: Load Unpacked Folder Ekstensi</div>
      <p style="margin:0 0 8px;">Nyalakan saklar <strong>Developer mode</strong> (pojok kanan atas), klik <strong>Load unpacked</strong>, lalu paste alamat folder ini:</p>
      <code>${EXTENSION_DIR}</code>
      <button onclick="navigator.clipboard.writeText('${escapedDir}'); document.getElementById('ok2').textContent='✅ Path Folder Tersalin! Tinggal Ctrl+V di Load Unpacked'">📋 Copy Path Folder Ekstensi</button>
      <span id="ok2" class="ok"></span>
    </div>

    <div class="step">
      <div class="step-title">Langkah 3: Login Google di Tab Sebelah (Google Flow)</div>
      <p style="margin:0;">Pindah ke tab <strong>Google Flow</strong> di sebelah kiri, login akun Google lu 1x saja, lalu refresh halaman. Panel <strong>⚡ FLOW STUDIO DOCK</strong> langsung muncul di pojok kanan bawah!</p>
    </div>
  </div>
</body>
</html>`);
});

// ─── Windows Explorer Helper ─────────────────────────────────────────────────

app.post('/api/system/reveal', (req, res) => {
  const targetPath = String(req.body?.targetPath || '');
  if (!targetPath) {
    res.status(400).json({ ok: false, error: 'targetPath kosong.' });
    return;
  }

  const resolved = path.resolve(targetPath);
  const allowedRoots = [ROOT_DIR, path.resolve(HASIL_UGC_DIR), path.resolve(DOWNLOADS_DIR)];
  if (!allowedRoots.some((r) => resolved.toLowerCase().startsWith(r.toLowerCase()))) {
    res.status(403).json({ ok: false, error: 'Path di luar direktori proyek.' });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ ok: false, error: 'File/folder tidak ditemukan di disk.' });
    return;
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const child = spawn('explorer.exe', [`"${resolved}"`], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.unref();
  } else {
    const child = spawn('explorer.exe', [`/select,"${resolved}"`], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.unref();
  }

  res.json({ ok: true });
});

// Serve built frontend in production mode
const distDir = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`⚡ Flow Studio OS API aktif di http://127.0.0.1:${PORT}`);
});
