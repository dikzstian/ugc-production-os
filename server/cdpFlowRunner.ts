import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { compileFlowScenePrompt } from '../src/engine/flowCompiler';
import {
  AspectRatio,
  CharacterAsset,
  FlowAccount,
  ProductAsset,
  SceneClip,
  StudioProject,
} from '../src/types/studio';
import { extractLastFrame, stitchVideoClips } from './videoEngine';

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = ffmpegInstaller.path;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HELPER_JS_PATH = path.join(__dirname, 'flowPageHelper.js');
const EXT_CONTENT_JS_PATH = path.resolve(__dirname, '../chrome-extension-flow/content.js');

function getHelperScript(): string {
  return fs.readFileSync(HELPER_JS_PATH, 'utf-8');
}

const accountPortMap = new Map<string, number>();
let nextPortCursor = 9321;

export function getCdpPortForAccount(accountId: string, accounts: FlowAccount[]): number {
  const existing = accountPortMap.get(accountId);
  if (existing) return existing;

  for (const acc of accounts) {
    if (!accountPortMap.has(acc.id)) {
      accountPortMap.set(acc.id, nextPortCursor++);
    }
  }
  if (!accountPortMap.has(accountId)) {
    accountPortMap.set(accountId, nextPortCursor++);
  }
  return accountPortMap.get(accountId)!;
}

const portAliveCache = new Map<number, { alive: boolean; score: number; checkedAt: number }>();

async function inspectPortScore(port: number, useCache = false): Promise<{ alive: boolean; score: number }> {
  if (useCache) {
    const cached = portAliveCache.get(port);
    if (cached && Date.now() - cached.checkedAt < 2200) {
      return { alive: cached.alive, score: cached.score };
    }
  }
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1100),
    });
    if (!res.ok) {
      portAliveCache.set(port, { alive: false, score: 0, checkedAt: Date.now() });
      return { alive: false, score: 0 };
    }
    const targets = (await res.json()) as Array<{ type?: string; url?: string }>;
    const pages = targets.filter((t) => t.type === 'page' && t.url);
    let score = 15;
    if (pages.some((p) => p.url!.includes('flow.google.com/project/'))) {
      score = 100;
    } else if (pages.some((p) => p.url!.includes('flow.google.com') && !p.url!.includes('/about'))) {
      score = 60;
    }
    portAliveCache.set(port, { alive: true, score, checkedAt: Date.now() });
    return { alive: true, score };
  } catch {
    portAliveCache.set(port, { alive: false, score: 0, checkedAt: Date.now() });
    return { alive: false, score: 0 };
  }
}

export async function isCdpPortAlive(port: number, useCache = false): Promise<boolean> {
  const res = await inspectPortScore(port, useCache);
  return res.alive;
}

export async function findAliveCdpPortAcrossAccounts(
  preferredAccount: FlowAccount | undefined,
  accounts: FlowAccount[],
  useCache = false
): Promise<{ port: number; account: FlowAccount | undefined } | null> {
  const candidates: Array<{ port: number; account: FlowAccount; score: number }> = [];

  for (const acc of accounts) {
    const p = getCdpPortForAccount(acc.id, accounts);
    const { alive, score } = await inspectPortScore(p, useCache);
    if (alive) {
      const prefBonus = preferredAccount && acc.id === preferredAccount.id ? 10 : 0;
      candidates.push({ port: p, account: acc, score: score + prefBonus });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { port: candidates[0].port, account: candidates[0].account };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let activeJobControl: { jobId: string; aborted: boolean } | null = null;

export function abortActiveCdpAutoRun(): void {
  if (activeJobControl) {
    activeJobControl.aborted = true;
    activeJobControl = null;
  }
}

export function isCdpAutoRunBusy(): boolean {
  return Boolean(activeJobControl && !activeJobControl.aborted);
}

// ─── Minimal Native WebSocket CDP Client ─────────────────────────────────────

class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private listeners = new Map<string, Set<(params: any) => void>>();
  public closed = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener('message', (evt) => {
      try {
        const raw = typeof evt.data === 'string' ? evt.data : String(evt.data);
        const msg = JSON.parse(raw);
        if (typeof msg.id === 'number') {
          const entry = this.pending.get(msg.id);
          if (entry) {
            clearTimeout(entry.timer);
            this.pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              entry.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          const set = this.listeners.get(msg.method);
          if (set) {
            for (const fn of set) {
              try {
                fn(msg.params || {});
              } catch {
                // ignore
              }
            }
          }
        }
      } catch {
        // ignore
      }
    });

    const handleClose = () => {
      this.closed = true;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Koneksi jendela Chrome terputus.'));
      }
      this.pending.clear();
    };

    this.ws.addEventListener('close', handleClose);
    this.ws.addEventListener('error', handleClose);
  }

  static async connect(wsUrl: string, timeoutMs = 8000): Promise<CdpClient> {
    return new Promise<CdpClient>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error('Timeout menghubungkan WebSocket ke Chrome CDP.'));
      }, timeoutMs);

      ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve(new CdpClient(ws));
        },
        { once: true }
      );

      ws.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('Gagal membuka koneksi WebSocket ke Chrome CDP.'));
        },
        { once: true }
      );
    });
  }

  send<T = any>(method: string, params: Record<string, any> = {}, timeoutMs = 25000): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('Jendela Google Flow sudah ditutup.'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout pada ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err: any) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  on(event: string, fn: (params: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
    return () => {
      this.listeners.get(event)?.delete(fn);
    };
  }

  async evaluate<T = any>(expression: string, awaitPromise = false, timeoutMs = 30000): Promise<T> {
    const res = await this.send<any>(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise,
      },
      timeoutMs
    );
    if (res?.exceptionDetails) {
      const txt =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'Evaluasi DOM error';
      throw new Error(txt);
    }
    return res?.result?.value as T;
  }

  async trustedClick(x: number, y: number): Promise<void> {
    const rx = Math.round(x);
    const ry = Math.round(y);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: rx,
      y: ry,
      button: 'none',
    });
    await sleep(30);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: rx,
      y: ry,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await sleep(40);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: rx,
      y: ry,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  }

  close(): void {
    this.closed = true;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

// ─── Image Normalization Helper (.webp / .jpg -> clean .png) ────────────────

async function prepareCleanPng(
  rawFilePath: string | undefined,
  imageUrl: string | undefined,
  mediaDir: string,
  tempDir: string
): Promise<{ pngPath: string; searchHints: string[] } | null> {
  let resolved = '';
  if (rawFilePath && fs.existsSync(rawFilePath)) {
    resolved = path.resolve(rawFilePath);
  } else if (imageUrl && imageUrl.startsWith('/media/')) {
    const rel = imageUrl.replace(/^\/media\//, '');
    const candidate = path.resolve(mediaDir, rel);
    if (fs.existsSync(candidate)) {
      resolved = candidate;
    }
  }

  if (!resolved || !fs.existsSync(resolved)) {
    return null;
  }

  const origBasename = path.basename(resolved);
  const origStem = path.basename(resolved, path.extname(resolved)).slice(0, 24);

  let pngPath = resolved;
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.png') {
    const st = await fs.promises.stat(resolved);
    const hash = crypto
      .createHash('md5')
      .update(`${resolved}_${st.mtimeMs}`)
      .digest('hex')
      .slice(0, 10);
    const converted = path.join(tempDir, `ing_${origStem}_${hash}.png`);
    if (!fs.existsSync(converted)) {
      await execFileAsync(FFMPEG_BIN, ['-y', '-i', resolved, '-frames:v', '1', converted]);
    }
    pngPath = converted;
  }

  const pngBasename = path.basename(pngPath);
  return {
    pngPath,
    searchHints: [pngBasename, origBasename, origStem],
  };
}

// ─── Find or Open `https://flow.google.com/` Page Target via CDP ─────────────

async function connectToFlowTarget(
  cdpPort: number,
  cdpDownloadDir: string
): Promise<{ pageClient: CdpClient; browserClient: CdpClient | null }> {
  await fs.promises.mkdir(cdpDownloadDir, { recursive: true });

  let browserClient: CdpClient | null = null;
  try {
    const verRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, {
      signal: AbortSignal.timeout(2500),
    });
    const verJson = (await verRes.json()) as { webSocketDebuggerUrl?: string };
    if (verJson.webSocketDebuggerUrl) {
      browserClient = await CdpClient.connect(verJson.webSocketDebuggerUrl, 5000);
      await browserClient
        .send('Browser.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: cdpDownloadDir,
          eventsEnabled: true,
        })
        .catch(() => {});
    }
  } catch {
    // Non-fatal
  }

  const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
    signal: AbortSignal.timeout(3000),
  });
  const targets = (await listRes.json()) as Array<{
    id: string;
    type: string;
    url: string;
    title: string;
    webSocketDebuggerUrl?: string;
  }>;

  const pageTargets = targets.filter(
    (t) =>
      t.type === 'page' &&
      t.webSocketDebuggerUrl &&
      !t.url.startsWith('devtools://') &&
      !t.url.startsWith('chrome-extension://')
  );

  let chosen =
    pageTargets.find((t) => t.url.includes('flow.google.com/project')) ||
    pageTargets.find((t) => t.url.includes('flow.google.com')) ||
    pageTargets.find((t) => t.url.includes('labs.google')) ||
    pageTargets[0];

  if (!chosen) {
    const newRes = await fetch(
      `http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent('https://flow.google.com/')}`,
      { method: 'PUT', signal: AbortSignal.timeout(4000) }
    );
    chosen = (await newRes.json()) as any;
  }

  if (!chosen?.webSocketDebuggerUrl) {
    browserClient?.close();
    throw new Error('Tidak dapat menemukan tab aktif di jendela Google Chrome.');
  }

  const pageClient = await CdpClient.connect(chosen.webSocketDebuggerUrl);
  const helperSource = getHelperScript();

  let extContextId: number | null = null;
  const unsubCtx = pageClient.on('Runtime.executionContextCreated', (params) => {
    const ctx = params?.context;
    if (
      ctx &&
      typeof ctx.origin === 'string' &&
      ctx.origin.startsWith('chrome-extension://') &&
      /Flow Studio/i.test(String(ctx.name || ''))
    ) {
      extContextId = ctx.id;
    }
  });

  await pageClient.send('Page.enable');
  await pageClient.send('Runtime.enable');
  await sleep(120);
  unsubCtx();

  if (extContextId && fs.existsSync(EXT_CONTENT_JS_PATH)) {
    const extCode = fs.readFileSync(EXT_CONTENT_JS_PATH, 'utf-8');
    await pageClient
      .send('Runtime.evaluate', {
        expression: extCode,
        contextId: extContextId,
      })
      .catch(() => {});
  }

  await pageClient.send('DOM.enable');
  await pageClient.send('Network.enable');
  await pageClient
    .send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: cdpDownloadDir,
    })
    .catch(() => {});

  await pageClient
    .send('Page.addScriptToEvaluateOnNewDocument', { source: helperSource })
    .catch(() => {});

  if (
    !chosen.url.includes('flow.google.com') &&
    !chosen.url.includes('labs.google') &&
    !chosen.url.includes('accounts.google.com')
  ) {
    await pageClient.send('Page.navigate', { url: 'https://flow.google.com/' });
    await sleep(2500);
  }

  await pageClient.send('Page.bringToFront').catch(() => {});
  await pageClient.evaluate(helperSource).catch(() => {});

  return { pageClient, browserClient };
}

async function ensureHelperInjected(page: CdpClient): Promise<void> {
  await page.evaluate(getHelperScript()).catch(() => {});
}

async function inspectPage(page: CdpClient): Promise<any> {
  await ensureHelperInjected(page);
  return page.evaluate('window.__DIKA_FLOW_CDP__.inspectFlowPage()');
}

async function setHud(page: CdpClient, text: string, state = 'running'): Promise<void> {
  await page
    .evaluate(
      `window.__DIKA_FLOW_CDP__ && window.__DIKA_FLOW_CDP__.updateHud(${JSON.stringify(
        text
      )}, ${JSON.stringify(state)})`
    )
    .catch(() => {});
}

// ─── Attach Single Ingredient/Frame Image via Flow's Native `+` Add Menu ────

async function attachSinglePngToFlowComposer(
  page: CdpClient,
  pngPath: string,
  searchHints: string[]
): Promise<boolean> {
  const beforeState = await inspectPage(page);
  const chipsBefore = beforeState?.totalChipCount || 0;

  // Step 1: Open '+' Add Menu & check if this asset is already in the project's recent uploads
  const libCheck = await page.evaluate<{
    foundInLibrary: boolean;
    uploadBtnCoords: { x: number; y: number } | null;
  }>(
    `window.__DIKA_FLOW_CDP__.tryAttachExistingAssetFromAddMenu(${JSON.stringify(searchHints)})`,
    true,
    15000
  );

  if (libCheck?.foundInLibrary) {
    const afterLib = await inspectPage(page);
    return (afterLib?.totalChipCount || 0) > chipsBefore;
  }

  if (!libCheck?.uploadBtnCoords) {
    return false;
  }

  // Step 2: Intercept OS File Chooser & click `Upload media` button in Add Menu
  let interceptedBackendNodeId: number | null = null;
  const unsub = page.on('Page.fileChooserOpened', (params) => {
    if (params?.backendNodeId) {
      interceptedBackendNodeId = params.backendNodeId;
    }
  });

  try {
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
    await page.trustedClick(libCheck.uploadBtnCoords.x, libCheck.uploadBtnCoords.y);

    for (let w = 0; w < 12 && !interceptedBackendNodeId; w++) {
      await sleep(150);
    }

    if (interceptedBackendNodeId) {
      await page.send('DOM.setFileInputFiles', {
        files: [pngPath],
        backendNodeId: interceptedBackendNodeId,
      });
    }
  } finally {
    unsub();
    await page.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
  }

  // Step 3: Handle "I agree" rights dialog, click "Add to prompt" if needed, & wait until aria-busy="false"
  await page.evaluate(
    `window.__DIKA_FLOW_CDP__.finishAddMenuUploadAndAttach(${JSON.stringify(
      searchHints
    )}, ${chipsBefore})`,
    true,
    25000
  );

  const finalState = await inspectPage(page);
  return (finalState?.totalChipCount || 0) > chipsBefore;
}

// ─── Capture Rendered Video Bytes via 3-Method Cascade ───────────────────────

async function captureRenderedVideoBuffer(
  page: CdpClient,
  videoSrc: string,
  cdpDownloadDir: string,
  knownDownloadFiles: Set<string>
): Promise<Buffer | null> {
  // Method A: Fetch inside flow.google.com page context
  try {
    const res = await page.evaluate<{ ok: boolean; dataUrl?: string }>(
      `window.__DIKA_FLOW_CDP__.fetchVideoAsDataUrl(${JSON.stringify(videoSrc)})`,
      true,
      45000
    );
    if (res?.ok && res.dataUrl) {
      const comma = res.dataUrl.indexOf(',');
      if (comma !== -1) {
        const buf = Buffer.from(res.dataUrl.slice(comma + 1), 'base64');
        if (buf.length > 20 * 1024) return buf;
      }
    }
  } catch {
    // Try Method B
  }

  // Method B: Node native fetch with browser cookies from Network.getCookies
  if (videoSrc.startsWith('http://') || videoSrc.startsWith('https://')) {
    try {
      const cookieRes = await page.send<{ cookies: Array<{ name: string; value: string }> }>(
        'Network.getCookies',
        { urls: [videoSrc, 'https://flow.google.com/'] }
      );
      const cookieHeader = (cookieRes.cookies || [])
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
      const r = await fetch(videoSrc, {
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
        signal: AbortSignal.timeout(45000),
      });
      if (r.ok) {
        const arr = await r.arrayBuffer();
        const buf = Buffer.from(arr);
        if (buf.length > 20 * 1024) return buf;
      }
    } catch {
      // Try Method C
    }
  }

  // Method C: Hover video card & click Flow's native Download button -> read from cdpDownloadDir
  try {
    const state = await inspectPage(page);
    const vMatch = (state?.videos || []).find((v: any) => v.src === videoSrc);
    if (vMatch) {
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: vMatch.x,
        y: vMatch.y,
        button: 'none',
      });
      await sleep(500);
    }

    const dlBtn = await page.evaluate<{ found: boolean; x?: number; y?: number }>(
      `window.__DIKA_FLOW_CDP__.findDownloadButtonForVideo(${JSON.stringify(videoSrc)})`
    );
    if (dlBtn?.found && dlBtn.x && dlBtn.y) {
      await page.trustedClick(dlBtn.x, dlBtn.y);
      for (let w = 0; w < 25; w++) {
        await sleep(1000);
        const newMp4 = findNewCompletedMp4InDir(cdpDownloadDir, knownDownloadFiles);
        if (newMp4) {
          knownDownloadFiles.add(newMp4);
          const buf = await fs.promises.readFile(newMp4);
          if (buf.length > 20 * 1024) return buf;
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function findNewCompletedMp4InDir(dir: string, knownSet: Set<string>): string | null {
  try {
    if (!fs.existsSync(dir)) return null;
    const names = fs.readdirSync(dir);
    if (names.some((n) => n.endsWith('.crdownload') || n.endsWith('.tmp'))) {
      return null;
    }
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.mp4')) continue;
      const full = path.join(dir, name);
      if (knownSet.has(full)) continue;
      const st = fs.statSync(full);
      if (st.isFile() && st.size > 20 * 1024) {
        return full;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Main End-to-End Multi-Scene Zero-Extension CDP Orchestrator ─────────────

export interface CdpAutoRunContext {
  jobId: string;
  cdpPort: number;
  mode: 'all' | 'pilot_s1' | 'rest';
  projectId: string;
  mediaDir: string;
  clipsDir: string;
  framesDir: string;
  exportsDir: string;
  tempDir: string;
  hasilUgcDir: string;
  getProjectAndAssets: () => {
    project: StudioProject | undefined;
    character: CharacterAsset | undefined;
    product: ProductAsset | undefined;
    activeAccount: FlowAccount | undefined;
  };
  onReportProgress: (
    state: 'queued' | 'running' | 'done' | 'paused' | 'error' | 'cancelled',
    stepText: string,
    currentSceneNumber?: number
  ) => void;
  onSaveDb: () => void;
  sanitizeFilename: (name: string) => string;
}

export async function runProjectViaCdp(ctx: CdpAutoRunContext): Promise<void> {
  abortActiveCdpAutoRun();
  const control = { jobId: ctx.jobId, aborted: false };
  activeJobControl = control;

  const cdpDownloadDir = path.join(ctx.tempDir, 'cdp_downloads');
  await fs.promises.mkdir(cdpDownloadDir, { recursive: true });

  const knownDownloadFiles = new Set<string>();
  try {
    for (const f of fs.readdirSync(cdpDownloadDir)) {
      knownDownloadFiles.add(path.join(cdpDownloadDir, f));
    }
  } catch {
    // ignore
  }

  let page: CdpClient | null = null;
  let browser: CdpClient | null = null;

  const report = async (
    state: 'queued' | 'running' | 'done' | 'paused' | 'error' | 'cancelled',
    stepText: string,
    sceneNum?: number
  ) => {
    ctx.onReportProgress(state, stepText, sceneNum);
    if (page && !page.closed) {
      await setHud(page, stepText, state);
    }
  };

  try {
    await report('running', '🔌 Menghubungkan otomatis ke jendela Chrome Google Flow...');

    const conn = await connectToFlowTarget(ctx.cdpPort, cdpDownloadDir);
    page = conn.pageClient;
    browser = conn.browserClient;

    // 1. Wait for flow.google.com DOM & auto-click "+ New project" if on landing page
    let state = await inspectPage(page);
    for (let waitLoad = 0; waitLoad < 14 && !control.aborted; waitLoad++) {
      if (state?.isSignInRequired || state?.promptBox?.found || state?.newProjectBtn?.found) {
        break;
      }
      await report('running', '⏳ Menunggu halaman flow.google.com selesai dimuat...');
      await sleep(1200);
      state = await inspectPage(page);
    }

    if (control.aborted) return;

    if (state?.isSignInRequired) {
      await report(
        'paused',
        '🔑 Silakan Login akun Google PRO lu dulu di jendela Chrome yang terbuka, lalu klik tombol Gas Run lagi!'
      );
      return;
    }

    if (!state?.promptBox?.found && state?.newProjectBtn?.found) {
      await report(
        'running',
        `✨ Mengklik tombol "${state.newProjectBtn.label || '+ New project'}" secara otomatis di flow.google.com...`
      );
      await page.trustedClick(state.newProjectBtn.x, state.newProjectBtn.y);

      for (let w = 0; w < 22 && !control.aborted; w++) {
        await sleep(1100);
        state = await inspectPage(page);
        if (state?.promptBox?.found) break;
      }
    }

    if (control.aborted) return;

    if (!state?.promptBox?.found) {
      await report(
        'paused',
        '⏸️ Kotak prompt belum terlihat di flow.google.com. Klik "+ New project" di Chrome, lalu klik tombol Gas Run lagi!'
      );
      return;
    }

    const initAssets = ctx.getProjectAndAssets();
    if (!initAssets.project) {
      await report('error', 'Project tidak ditemukan.');
      return;
    }

    const allScenes = initAssets.project.scenes;
    const pendingScenes = allScenes.filter((s) => !s.videoUrl);
    const targetSceneIds = (
      ctx.mode === 'pilot_s1'
        ? allScenes.slice(0, 1)
        : ctx.mode === 'rest'
        ? allScenes.slice(1).filter((s) => !s.videoUrl)
        : pendingScenes.length > 0
        ? pendingScenes
        : allScenes
    ).map((s) => s.id);

    if (targetSceneIds.length === 0) {
      await report('done', '✅ Semua scene sudah memiliki video MP4!');
      return;
    }

    let mountedKeys: string[] = [];
    let lastConfiguredVideoType = '';

    for (let idx = 0; idx < targetSceneIds.length; idx++) {
      if (control.aborted) return;

      const { project, character, product } = ctx.getProjectAndAssets();
      if (!project) break;

      const sceneIndex = project.scenes.findIndex((s) => s.id === targetSceneIds[idx]);
      if (sceneIndex === -1) continue;

      const sc: SceneClip = project.scenes[sceneIndex];
      const prevScene = sceneIndex > 0 ? project.scenes[sceneIndex - 1] : undefined;

      // Re-compile right before running so Scene 2/3 gets freshly extracted Last Frame if using frame_chain
      const compiled = compileFlowScenePrompt(project, sc, prevScene, character, product);
      const imageAttachments = (compiled.requiredAttachments || []).filter((a) =>
        Boolean(a.filePath || a.imageUrl)
      );

      // 2. Ensure Flow Settings are set to Video + (Ingredients / Frames) + (9:16 / 16:9) + Duration + x1
      const desiredRatio: AspectRatio = project.aspectRatio || '9:16';
      const desiredVideoType =
        sc.continuityMode === 'frame_chain' && sceneIndex > 0 ? 'Frames' : 'Ingredients';
      const ratioIconToken = desiredRatio === '9:16' ? 'crop_9_16' : 'crop_16_9';
      const targetDurSec = Math.max(3, Math.min(15, Math.round(Number(sc.durationSec) || 12)));

      state = await inspectPage(page);
      const pill = String(state?.settingsPillText || '');
      const needsSettingsUpdate =
        Boolean(state?.settingsOverlayOpen) ||
        !pill.includes('Video') ||
        !pill.includes(`${targetDurSec}s`) ||
        !pill.includes(ratioIconToken) ||
        !pill.includes('x1') ||
        lastConfiguredVideoType !== desiredVideoType;

      if (needsSettingsUpdate) {
        await report(
          'running',
          `⚙️ Scene ${sc.sceneNumber}/${project.scenes.length}: Mengatur mode Google Flow ke Video · ${desiredVideoType} · ${desiredRatio} · ${targetDurSec}s · x1...`,
          sc.sceneNumber
        );
        await page.evaluate(
          `window.__DIKA_FLOW_CDP__.configureFlowVideoSettings(${JSON.stringify(
            desiredRatio
          )}, ${JSON.stringify(desiredVideoType)}, ${targetDurSec})`,
          true,
          12000
        );
        lastConfiguredVideoType = desiredVideoType;
        await sleep(300);
      }

      // 3A. Upload / Attach Reference Images (Smart prefix diffing so we never unnecessarily clear already-mounted chips!)
      const desiredKeys = imageAttachments.map((a) => a.imageUrl || a.filePath || '');
      state = await inspectPage(page);

      if ((state?.totalChipCount || 0) === 0) {
        mountedKeys = [];
      } else if (
        mountedKeys.length === 0 &&
        sc.continuityMode === 'ingredients' &&
        (state?.settledChipCount || 0) === desiredKeys.length
      ) {
        mountedKeys = [...desiredKeys];
      }

      const isPrefixMatch =
        mountedKeys.length <= desiredKeys.length &&
        mountedKeys.every((k, i) => k === desiredKeys[i]);

      if (!isPrefixMatch) {
        await page.evaluate('window.__DIKA_FLOW_CDP__.clearComposerChips()').catch(() => {});
        await sleep(500);
        mountedKeys = [];
      }

      for (let aIdx = mountedKeys.length; aIdx < imageAttachments.length; aIdx++) {
        if (control.aborted) return;
        const att = imageAttachments[aIdx];
        await report(
          'running',
          `🖼️ Scene ${sc.sceneNumber}/${project.scenes.length}: Menambahkan gambar ${att.label} (${aIdx + 1}/${imageAttachments.length}) ke kotak prompt...`,
          sc.sceneNumber
        );

        const cleanImg = await prepareCleanPng(
          att.filePath,
          att.imageUrl,
          ctx.mediaDir,
          ctx.tempDir
        );
        if (cleanImg) {
          let attachedOk = false;
          for (let attempt = 1; attempt <= 3 && !control.aborted; attempt++) {
            attachedOk = await attachSinglePngToFlowComposer(
              page,
              cleanImg.pngPath,
              cleanImg.searchHints
            );
            const checkState = await inspectPage(page);
            if (attachedOk && (checkState?.totalChipCount || 0) >= aIdx + 1) {
              break;
            }
            await sleep(700);
          }
          if (attachedOk) {
            mountedKeys.push(desiredKeys[aIdx]);
          }
          await sleep(600);
        }
      }

      // Hard Verification: if any required chip is STILL missing in <flow-ingredient-bar>, do a clean full pass!
      state = await inspectPage(page);
      if (
        imageAttachments.length > 0 &&
        (state?.totalChipCount || 0) < imageAttachments.length &&
        !control.aborted
      ) {
        await page.evaluate('window.__DIKA_FLOW_CDP__.clearComposerChips()').catch(() => {});
        await sleep(600);
        mountedKeys = [];
        for (let aIdx = 0; aIdx < imageAttachments.length && !control.aborted; aIdx++) {
          const att = imageAttachments[aIdx];
          const cleanImg = await prepareCleanPng(
            att.filePath,
            att.imageUrl,
            ctx.mediaDir,
            ctx.tempDir
          );
          if (cleanImg) {
            await attachSinglePngToFlowComposer(page, cleanImg.pngPath, cleanImg.searchHints);
            mountedKeys.push(desiredKeys[aIdx]);
            await sleep(700);
          }
        }
      }

      if (control.aborted) return;

      // Snapshot existing <video> sources BEFORE submitting Scene `sc`
      state = await inspectPage(page);
      const knownVideosBefore = new Set<string>(
        (state?.videos || []).map((v: any) => String(v.src))
      );

      // 3B. Focus ProseMirror, Clear Old Text & Insert Anti-Bug Prompt via Trusted CDP Input
      await report(
        'running',
        `✍️ Scene ${sc.sceneNumber}/${project.scenes.length}: Mengisi Prompt Anti-Bug & menekan tombol Generate...`,
        sc.sceneNumber
      );

      const singleLinePrompt = compiled.prompt.replace(/\s*\r?\n\s*/g, ' ').trim();

      await page.evaluate('window.__DIKA_FLOW_CDP__.preparePromptBoxForInsert()');
      await sleep(150);

      state = await inspectPage(page);
      if (state?.promptBox?.found) {
        await page.trustedClick(state.promptBox.x, state.promptBox.y);
        await sleep(150);
      }

      await page.evaluate('window.__DIKA_FLOW_CDP__.preparePromptBoxForInsert()');
      await sleep(100);
      await page.send('Input.insertText', { text: singleLinePrompt });
      await sleep(600);

      // 3C. Click Generate Button (waiting up to 35s if ingredient upload is still finishing)
      let clickedGenerate = false;
      for (let waitBtn = 35; waitBtn > 0 && !control.aborted; waitBtn--) {
        state = await inspectPage(page);
        if (state?.generateBtn?.found && state.generateBtn.enabled) {
          await page.trustedClick(state.generateBtn.x, state.generateBtn.y);
          await sleep(450);
          const postClick = await inspectPage(page);
          if (
            postClick?.generateBtn?.found &&
            postClick.generateBtn.enabled &&
            (postClick?.promptBox?.textLength || 0) >= 30
          ) {
            await page.evaluate('window.__DIKA_FLOW_CDP__.clickLastGenBtnFallback()').catch(() => {});
          }
          clickedGenerate = true;
          break;
        }
        await report(
          'running',
          `⏳ Menunggu gambar selesai diproses agar tombol Generate aktif (${waitBtn}d)...`,
          sc.sceneNumber
        );
        await sleep(1000);
      }

      if (control.aborted) return;

      if (!clickedGenerate) {
        await report(
          'paused',
          `⏸️ Prompt Scene ${sc.sceneNumber} sudah siap di kotak Google Flow! Silakan klik tombol panah Generate di Chrome.`,
          sc.sceneNumber
        );
        return;
      }

      // 3D. Poll for Newly Rendered Video & Auto-Capture MP4 into Studio Scene!
      let capturedBuf: Buffer | null = null;
      const maxRenderWaitSec = 300;

      for (let elapsed = 0; elapsed < maxRenderWaitSec && !control.aborted; elapsed += 2) {
        await report(
          'running',
          `🎬 Google Flow sedang merender Video Scene ${sc.sceneNumber}/${project.scenes.length}... (${elapsed}d) — Otomatis ditarik begitu selesai!`,
          sc.sceneNumber
        );
        await sleep(2000);

        if (elapsed < 6) continue;

        const directFile = findNewCompletedMp4InDir(cdpDownloadDir, knownDownloadFiles);
        if (directFile) {
          knownDownloadFiles.add(directFile);
          capturedBuf = await fs.promises.readFile(directFile);
          if (capturedBuf.length > 20 * 1024) break;
          capturedBuf = null;
        }

        state = await inspectPage(page);

        if (state?.errorBanner && elapsed >= 8) {
          await report(
            'error',
            `⚠️ Google Flow melaporkan kendala pada Scene ${sc.sceneNumber}: "${state.errorBanner}". Cek jendela Chrome atau klik Ganti Akun jika kuota habis!`,
            sc.sceneNumber
          );
          return;
        }

        const freshVideos = (state?.videos || []).filter(
          (v: any) => !knownVideosBefore.has(v.src) && (v.readyState >= 2 || v.duration >= 1.5)
        );

        if (freshVideos.length > 0) {
          const newestVid = freshVideos[freshVideos.length - 1];
          await report(
            'running',
            `📥 Video Scene ${sc.sceneNumber} selesai dirender! Menarik MP4 otomatis ke Flow Studio OS...`,
            sc.sceneNumber
          );
          await sleep(1500);
          capturedBuf = await captureRenderedVideoBuffer(
            page,
            newestVid.src,
            cdpDownloadDir,
            knownDownloadFiles
          );
          knownVideosBefore.add(newestVid.src);
          if (capturedBuf && capturedBuf.length > 20 * 1024) {
            break;
          }
          capturedBuf = null;
        }
      }

      if (control.aborted) return;

      if (!capturedBuf) {
        await report(
          'paused',
          `⏸️ Waktu tunggu render Scene ${sc.sceneNumber} habis atau video belum muncul. Jika di Chrome sudah selesai, klik Download di Flow lalu klik "Tarik Batch Downloads" di Studio!`,
          sc.sceneNumber
        );
        return;
      }

      // 3E. Save Captured MP4, Extract Last Frame PNG, Deduct Token & Update DB!
      const freshCtx = ctx.getProjectAndAssets();
      const liveProj = freshCtx.project;
      const liveScene = liveProj?.scenes.find((s) => s.id === sc.id);
      if (!liveProj || !liveScene) return;

      const clipFilename = `clip_${liveProj.id}_s${liveScene.sceneNumber}_${Date.now()}.mp4`;
      const destClipPath = path.join(ctx.clipsDir, clipFilename);
      await fs.promises.writeFile(destClipPath, capturedBuf);

      const frameFilename = `lastframe_${liveProj.id}_s${liveScene.sceneNumber}_${Date.now()}.png`;
      const destFramePath = path.join(ctx.framesDir, frameFilename);
      const { durationSec } = await extractLastFrame(destClipPath, destFramePath, 0.14);

      if (freshCtx.activeAccount) {
        freshCtx.activeAccount.creditsRemaining = Math.max(
          0,
          freshCtx.activeAccount.creditsRemaining - (freshCtx.activeAccount.costPerClip || 20)
        );
        if (freshCtx.activeAccount.creditsRemaining === 0) {
          freshCtx.activeAccount.status = 'exhausted';
        }
      }

      liveScene.videoUrl = `/media/clips/${clipFilename}`;
      liveScene.videoPath = destClipPath;
      liveScene.actualDurationSec = durationSec;
      liveScene.lastFrameUrl = `/media/frames/${frameFilename}`;
      liveScene.lastFramePath = destFramePath;
      liveScene.renderedByAccountId = freshCtx.activeAccount?.id;
      liveProj.updatedAt = new Date().toISOString();
      ctx.onSaveDb();

      await report(
        'running',
        `✅ Klip Scene ${liveScene.sceneNumber}/${liveProj.scenes.length} berhasil masuk (${durationSec}s)!`,
        liveScene.sceneNumber
      );

      if (idx < targetSceneIds.length - 1 && !control.aborted) {
        await sleep(2500);
      }
    }

    if (control.aborted) return;

    // 4. Auto-Stitch Final Video with FFmpeg once all scenes have clips!
    const finalAssets = ctx.getProjectAndAssets();
    const finalProj = finalAssets.project;
    if (!finalProj) return;

    const readyScenes = finalProj.scenes.filter((s) => s.videoPath && fs.existsSync(s.videoPath));
    if (readyScenes.length === finalProj.scenes.length && finalProj.scenes.length > 0) {
      await report(
        'running',
        `🎞️ Semua ${readyScenes.length} Scene sudah lengkap! Menggabungkan otomatis dengan FFmpeg jadi 1 Video MP4 Utuh...`
      );

      const cleanSlug = ctx.sanitizeFilename(finalProj.title || 'FlowStudio_Output');
      const outFilename = `${cleanSlug}_${Date.now()}.mp4`;
      const outPath = path.join(ctx.exportsDir, outFilename);
      const clipInputs = readyScenes.map((s) => ({
        videoPath: s.videoPath!,
        trimStartSec: s.trimStartSec ?? finalProj.stitchSettings.trimStartDefault ?? 0.05,
        trimEndSec: s.trimEndSec ?? finalProj.stitchSettings.trimEndDefault ?? 0.12,
      }));

      const stitchRes = await stitchVideoClips(
        clipInputs,
        finalProj.aspectRatio,
        finalProj.stitchSettings,
        outPath,
        ctx.tempDir
      );

      if (finalProj.stitchSettings.copyToHasilUgc && fs.existsSync(ctx.hasilUgcDir)) {
        const hasilCopyPath = path.join(ctx.hasilUgcDir, `${cleanSlug}_FlowStudio.mp4`);
        await fs.promises.copyFile(outPath, hasilCopyPath).catch(() => {});
      }

      finalProj.finalVideoUrl = `/media/exports/${outFilename}`;
      finalProj.finalVideoPath = outPath;
      finalProj.finalDurationSec = stitchRes.finalDurationSec;
      finalProj.updatedAt = new Date().toISOString();
      ctx.onSaveDb();

      await report(
        'done',
        `🎉 BERES TOTAL! ${readyScenes.length} Scene berhasil dibuat & digabung otomatis jadi 1 MP4 Utuh (${stitchRes.finalDurationSec} detik)! Siap ditonton di panel kanan.`
      );
    } else if (ctx.mode === 'pilot_s1') {
      await report(
        'done',
        '✅ Tes Scene 1 selesai & klip sudah masuk ke Studio! Cek hasilnya di bawah; kalau sudah pas, klik tombol "Gas Run Semua" untuk lanjut sisa scene sampai jadi 1 MP4!'
      );
    } else {
      await report(
        'done',
        `✅ Selesai menjalankan antrean (${readyScenes.length}/${finalProj.scenes.length} klip siap di Studio).`
      );
    }
  } catch (err: any) {
    if (!control.aborted) {
      await report(
        'error',
        `⚠️ Terjadi kendala komunikasi Chrome Otomatis: ${err?.message || String(err)}`
      );
    }
  } finally {
    page?.close();
    browser?.close();
    if (activeJobControl === control) {
      activeJobControl = null;
    }
  }
}
