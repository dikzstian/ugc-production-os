import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Chrome,
  Copy,
  Download,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Target,
  Upload,
  Zap,
} from 'lucide-react';
import { compileFlowScenePrompt } from '../engine/flowCompiler';
import {
  copyMediaImageToClipboard,
  copyTextToClipboard,
  revealInExplorer,
} from '../lib/clipboardImage';
import {
  AutoRunJob,
  CharacterAsset,
  DownloadsFileItem,
  FlowAccount,
  ProductAsset,
  StudioProject,
} from '../types/studio';

interface Props {
  project: StudioProject;
  character?: CharacterAsset;
  product?: ProductAsset;
  activeAccount?: FlowAccount;
  activeSceneId?: string;
  onSelectBridgeScene: (sceneId: string) => Promise<void>;
  onLaunchActiveAccount: () => Promise<void>;
  onRotateAccount: () => Promise<void>;
  onAttachVideo: (
    sceneId: string,
    opts: { file?: File; grabLatest?: boolean; sourceFilePath?: string }
  ) => Promise<void>;
  onClearSceneVideo: (sceneId: string) => Promise<void>;
  onBatchPullAndStitch: () => Promise<void>;
  onReExtractFrame: (sceneId: string, offsetSec: number) => Promise<void>;
  onChangeProject: (patch: Partial<StudioProject>) => void;
  onStitchProject: () => Promise<void>;
  onRefreshStudio: () => Promise<void>;
  isStitching: boolean;
  notify: (msg: string, type?: 'ok' | 'err') => void;
}

export const Step3FlowAndStitch: React.FC<Props> = ({
  project,
  character,
  product,
  activeAccount,
  activeSceneId,
  onSelectBridgeScene,
  onLaunchActiveAccount,
  onRotateAccount,
  onAttachVideo,
  onClearSceneVideo,
  onBatchPullAndStitch,
  onReExtractFrame,
  onChangeProject,
  onStitchProject,
  onRefreshStudio,
  isStitching,
  notify,
}) => {
  const [recentDownloads, setRecentDownloads] = useState<DownloadsFileItem[]>([]);
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [extensionOnline, setExtensionOnline] = useState(false);
  const [autoRunJob, setAutoRunJob] = useState<AutoRunJob | null>(null);
  const [startingAutoRun, setStartingAutoRun] = useState(false);

  const loadRecentDownloads = async () => {
    try {
      const res = await fetch('/api/downloads/recent');
      const data = await res.json();
      if (data.ok) setRecentDownloads(data.files || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadRecentDownloads();
  }, [project.updatedAt]);

  // Live poll Extension & Auto-Run status every 2.5s so progress & captured clips appear automatically!
  useEffect(() => {
    let lastCompletedSeen = project.scenes.filter((s) => Boolean(s.videoUrl)).length;
    let lastFinalUrlSeen = project.finalVideoUrl || '';

    const pollBridge = async () => {
      try {
        const res = await fetch('/api/bridge/state');
        const data = await res.json();
        if (!data.ok) return;
        setExtensionOnline(Boolean(data.extensionOnline));
        setAutoRunJob(data.autoRunJob || null);

        const remoteCompleted = data.activeProject?.completedScenes ?? lastCompletedSeen;
        const remoteFinalUrl = data.activeProject?.finalVideoUrl || '';
        if (remoteCompleted !== lastCompletedSeen || remoteFinalUrl !== lastFinalUrlSeen) {
          lastCompletedSeen = remoteCompleted;
          lastFinalUrlSeen = remoteFinalUrl;
          await onRefreshStudio();
          await loadRecentDownloads();
        }
      } catch {
        // ignore
      }
    };

    pollBridge();
    const timer = window.setInterval(pollBridge, 2500);
    return () => window.clearInterval(timer);
  }, [project.id, project.scenes, project.finalVideoUrl, onRefreshStudio]);

  const handleStartAutoRun = async (mode: 'all' | 'pilot_s1' = 'all') => {
    setStartingAutoRun(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/start-autorun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        notify(data.error || 'Gagal memulai Auto-Run.', 'err');
        return;
      }
      setAutoRunJob(data.autoRunJob);
      if (data.needsCloseOldWindow) {
        notify(
          '⚠️ Tutup (klik X) dulu semua jendela Chrome Akun Flow yang lama, lalu klik tombol Gas Run ini sekali lagi!',
          'err'
        );
      } else if (data.launchedChrome) {
        notify(
          '🚀 Membuka Chrome Otomatis (Tanpa Ekstensi)! Sistem langsung klik "+ New project", upload gambar, dan generate semua scene sampai jadi MP4!'
        );
      } else {
        notify(
          `🚀 Auto-Pilot berjalan! Scene 1 s/d ${project.scenes.length} sedang dikerjakan otomatis di Google Flow sampai jadi 1 MP4!`
        );
      }
    } catch (err: any) {
      notify(err.message, 'err');
    } finally {
      setStartingAutoRun(false);
    }
  };

  const handleCancelAutoRun = async () => {
    await fetch('/api/bridge/autorun-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true }),
    });
    setAutoRunJob(null);
    notify('Status Auto-Run dibersihkan.');
  };

  const readyClipsCount = project.scenes.filter((s) => Boolean(s.videoUrl)).length;
  const emptyClipsCount = project.scenes.length - readyClipsCount;
  const isAutoRunActive =
    autoRunJob?.projectId === project.id &&
    (autoRunJob.state === 'queued' || autoRunJob.state === 'running');
  const totalActualSec = project.scenes.reduce(
    (sum, s) => sum + (s.actualDurationSec || (s.videoUrl ? s.durationSec : 0)),
    0
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* LEFT: Multi-Account Scene Execution Queue */}
      <div className="xl:col-span-8 space-y-4">
        {/* Quick Flow Bar */}
        <div className="p-4 rounded-2xl bg-panel border border-amberGold/40 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase text-amberGold">
              Jembatan Aktif ke Google Flow
            </div>
            <p className="text-xs text-mutedWarm">
              Akun Aktif:{' '}
              <strong className="text-cream">{activeAccount?.name || 'Belum dipilih'}</strong>{' '}
              <span className="font-mono text-amberBright">
                ({activeAccount?.creditsRemaining ?? 0} token tersisa)
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onLaunchActiveAccount}
              className="px-3.5 py-2 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5"
            >
              <Chrome className="w-4 h-4" />
              Buka Google Flow ({activeAccount?.name || 'Akun Aktif'})
            </button>
            <button
              onClick={onRotateAccount}
              className="px-3 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 text-xs font-semibold flex items-center gap-1.5"
              title="Langsung tandai akun ini habis & buka jendela Chrome akun berikutnya tanpa logout!"
            >
              <Zap className="w-3.5 h-3.5 text-amberGold" />
              Token Habis → Ganti Akun
            </button>
          </div>
        </div>

        {/* 1-CLICK FULL AUTO-RUN HERO PANEL (Direct from Studio -> Google Flow -> Auto-Capture -> Auto-Stitch!) */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-amberGold/20 via-panel to-emerald-950/40 border-2 border-amberGold shadow-xl space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm sm:text-base uppercase tracking-wider text-amberGold font-extrabold flex items-center gap-2">
                <Zap className="w-5 h-5 text-amberBright" />
                1-Klik Langsung Beres ({project.scenes.length} Scene Otomatis Jadi 1 Video!)
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  extensionOnline
                    ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                    : 'bg-obsidian border-amberGold/40 text-amberBright'
                }`}
              >
                {extensionOnline
                  ? '🟢 Chrome Otomatis Terhubung (Tanpa Perlu Ekstensi!)'
                  : '🟡 Chrome Otomatis Siap Dibuka Saat Klik Run (Tanpa Ekstensi)'}
              </span>
            </div>
          </div>

          <p className="text-xs text-cream/85 leading-relaxed">
            <strong>Tidak perlu pasang ekstensi &amp; tidak perlu bikin Video 1 manual!</strong> Klik tombol kuning besar di bawah: Flow Studio OS langsung mengendalikan Chrome akun lu secara native di <strong>flow.google.com</strong> (klik <strong>+ New project</strong> sendiri, <strong>upload foto Karakter &amp; Produk otomatis</strong>, jalan <strong>Scene 1 → Scene {project.scenes.length}</strong>, tarik semua video selesai render, lalu <strong>gabung jadi 1 MP4 utuh</strong>)!
          </p>

          {autoRunJob && autoRunJob.projectId === project.id && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                autoRunJob.state === 'done'
                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
                  : autoRunJob.state === 'paused' || autoRunJob.state === 'error'
                  ? 'bg-amber-950/60 border-amberGold/60 text-amberBright'
                  : 'bg-obsidian/90 border-amberGold text-cream'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isAutoRunActive && <Loader2 className="w-4 h-4 animate-spin text-amberGold shrink-0" />}
                <span className="font-medium">{autoRunJob.stepText}</span>
              </div>
              <button
                onClick={handleCancelAutoRun}
                className="px-2.5 py-1 rounded-lg bg-panel hover:bg-red-950 border border-line text-[11px] text-mutedWarm hover:text-red-200 shrink-0 flex items-center gap-1"
              >
                <Square className="w-3 h-3" /> Tutup Status
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleStartAutoRun('all')}
              disabled={startingAutoRun || isStitching}
              className="flex-1 min-w-[260px] py-3.5 px-5 rounded-xl bg-amberGold hover:bg-amberBright disabled:opacity-50 text-obsidian font-display uppercase tracking-wide font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              {startingAutoRun ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-obsidian" />
              )}
              🚀 Gas Run Semua {emptyClipsCount > 0 ? emptyClipsCount : project.scenes.length} Scene Sampai Jadi MP4!
            </button>

            <button
              onClick={() => handleStartAutoRun('pilot_s1')}
              disabled={startingAutoRun || isStitching}
              className="px-3.5 py-3.5 rounded-xl bg-obsidian hover:bg-panelSoft border border-line text-cream text-xs font-bold flex items-center gap-1.5"
              title="Opsional saja kalau suatu saat lu pengen tes Scene 1 doang"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Tes Scene 1 Saja (Opsional)
            </button>

            <button
              onClick={async () => {
                await onBatchPullAndStitch();
                await loadRecentDownloads();
              }}
              disabled={isStitching || emptyClipsCount === 0}
              className="px-3.5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-obsidian text-xs font-extrabold flex items-center gap-1.5"
              title="Cadangan manual jika lu download MP4 sendiri dari Google Flow"
            >
              <Download className="w-4 h-4" />
              Tarik Batch Downloads ({emptyClipsCount || project.scenes.length})
            </button>
          </div>
        </div>

        {/* Scene Production Cards */}
        {project.scenes.map((scene, idx) => {
          const prevScene = idx > 0 ? project.scenes[idx - 1] : undefined;
          const compiled = compileFlowScenePrompt(project, scene, prevScene, character, product);
          const isBridgeTarget = activeSceneId === scene.id || (!activeSceneId && idx === 0);
          const isBusy = busySceneId === scene.id;

          return (
            <div
              key={scene.id}
              className={`p-5 rounded-2xl border transition space-y-4 ${
                isBridgeTarget
                  ? 'bg-panelSoft border-amberGold shadow-lg'
                  : scene.videoUrl
                  ? 'bg-panel border-emerald-800/60'
                  : 'bg-panel border-line'
              }`}
            >
              {/* Card Top */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-amberGold text-obsidian font-mono font-bold text-xs">
                    SCENE {scene.sceneNumber} / {project.scenes.length}
                  </span>
                  <span className="font-semibold text-sm text-cream">{scene.beatLabel}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-obsidian border border-line text-amberBright font-medium">
                    {compiled.flowModeBadge}
                  </span>
                  {scene.videoUrl && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Klip Siap ({scene.actualDurationSec || scene.durationSec}s)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {scene.videoUrl && (
                    <button
                      onClick={() => onClearSceneVideo(scene.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-700/60 text-red-200 text-xs font-semibold flex items-center gap-1.5"
                      title="Reset & reroll khusus scene ini saja jika ada gerakan aneh/glitch tanpa membuang klip scene lain!"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reroll Scene {scene.sceneNumber} Saja
                    </button>
                  )}

                  <button
                    onClick={() => onSelectBridgeScene(scene.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${
                      isBridgeTarget
                        ? 'bg-amberGold/20 border-amberGold text-amberBright'
                        : 'bg-obsidian border-line text-mutedWarm hover:text-cream'
                    }`}
                  >
                    <Target className="w-3.5 h-3.5" />
                    {isBridgeTarget ? 'Aktif di Dock Extension' : 'Kirim ke Dock Extension'}
                  </button>
                </div>
              </div>

              {/* Step A: Required Attachments (1-Click Copy Ctrl+V) */}
              {compiled.requiredAttachments.length > 0 && (
                <div className="p-3 rounded-xl bg-obsidian border border-line space-y-2">
                  <div className="text-[11px] font-bold uppercase text-mutedWarm">
                    1. Gambar Referensi / First Frame (Klik Copy lalu Ctrl+V di Google Flow):
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {compiled.requiredAttachments.map((att, aIdx) => (
                      <div
                        key={aIdx}
                        className="flex items-center gap-2.5 p-2 rounded-lg bg-panel border border-line"
                      >
                        {att.imageUrl ? (
                          <img
                            src={att.imageUrl}
                            alt={att.label}
                            className="w-11 h-11 rounded object-cover border border-amberGold/40"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded bg-obsidian border border-dashed border-line flex items-center justify-center text-[10px] text-mutedWarm">
                            Kosong
                          </div>
                        )}
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-cream">{att.label}</div>
                          {att.imageUrl ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={async () => {
                                  try {
                                    await copyMediaImageToClipboard(att.imageUrl!);
                                    notify(`${att.label} tersalin! Tekan Ctrl+V di Google Flow.`);
                                  } catch (err: any) {
                                    notify(err.message, 'err');
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-amberGold text-obsidian text-[11px] font-bold flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Copy Gambar (Ctrl+V)
                              </button>
                              {att.filePath && (
                                <button
                                  onClick={() => revealInExplorer(att.filePath!)}
                                  className="px-2 py-0.5 rounded bg-obsidian border border-line text-[10px] text-mutedWarm hover:text-cream"
                                  title="Tampilkan file asli di Explorer untuk drag-and-drop"
                                >
                                  Explorer
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-orange-300">
                              {att.type === 'last_frame'
                                ? `Selesaikan MP4 Scene ${scene.sceneNumber - 1} dulu agar Frame Terakhir otomatis diekstrak!`
                                : 'Upload foto referensi di Langkah 1 dulu'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step B: Anti-Bug Lock Summary + Prompt Box */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase text-mutedWarm">
                      2. Prompt Anti-Bug Google Flow Scene {scene.sceneNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-700/50 text-[10px] font-semibold text-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Zero Text • 0.0s Object Anchor • Dry Voice
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await copyTextToClipboard(compiled.prompt);
                      await onSelectBridgeScene(scene.id);
                      notify(`Prompt Scene ${scene.sceneNumber} berhasil disalin!`);
                    }}
                    className="px-3 py-1 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Prompt Scene {scene.sceneNumber}
                  </button>
                </div>

                {compiled.spokenDialogue && (
                  <div className="px-3 py-2 rounded-xl bg-obsidian/80 border border-emerald-800/40 text-[11px] text-emerald-200">
                    <span className="font-bold text-emerald-400">🎙️ Ejaan Suara Terkunci: </span>
                    &ldquo;{compiled.spokenDialogue}&rdquo;
                  </div>
                )}

                {compiled.antiBugWarnings && compiled.antiBugWarnings.length > 0 && (
                  <div className="px-3 py-2 rounded-xl bg-amber-950/40 border border-amberGold/40 text-[11px] text-amberBright space-y-0.5">
                    {compiled.antiBugWarnings.map((w, wIdx) => (
                      <div key={wIdx} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amberGold" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                <pre className="p-3 rounded-xl bg-obsidian border border-line font-mono text-[11px] text-cream/90 max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {compiled.prompt}
                </pre>
              </div>

              {/* Step C: Pull / Attach Rendered Video Clip */}
              <div className="p-3.5 rounded-xl bg-obsidian border border-line space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase text-emerald-300">
                    3. Masukkan Hasil Klip MP4 dari Google Flow:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={isBusy}
                      onClick={async () => {
                        setBusySceneId(scene.id);
                        try {
                          await onAttachVideo(scene.id, { grabLatest: true });
                          await loadRecentDownloads();
                        } finally {
                          setBusySceneId(null);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-obsidian text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Tarik MP4 Terbaru dari Downloads
                    </button>

                    {recentDownloads.length > 0 && (
                      <select
                        value=""
                        onChange={async (e) => {
                          const fp = e.target.value;
                          if (!fp) return;
                          setBusySceneId(scene.id);
                          try {
                            await onAttachVideo(scene.id, { sourceFilePath: fp });
                          } finally {
                            setBusySceneId(null);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream max-w-[190px]"
                      >
                        <option value="">Pilih dari Downloads...</option>
                        {recentDownloads.map((f) => (
                          <option key={f.fullPath} value={f.fullPath}>
                            {f.filename} ({f.sizeMb}MB)
                          </option>
                        ))}
                      </select>
                    )}

                    <label className="px-3 py-1.5 rounded-lg bg-panel hover:bg-panelSoft border border-line text-xs text-cream font-medium cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      Upload MP4
                      <input
                        type="file"
                        accept="video/mp4,video/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setBusySceneId(scene.id);
                          try {
                            await onAttachVideo(scene.id, { file: f });
                          } finally {
                            setBusySceneId(null);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Attached Video Preview + Extracted Last Frame */}
                {scene.videoUrl && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-line">
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-mutedWarm font-medium">
                        Preview Klip Scene {scene.sceneNumber} ({scene.actualDurationSec} dtk)
                      </div>
                      <video
                        key={scene.videoUrl}
                        src={scene.videoUrl}
                        controls
                        className="w-full max-h-56 rounded-lg bg-black border border-line"
                      />
                      <div className="flex items-center gap-2 text-[11px] text-mutedWarm">
                        <span>Potong Awal (dtk):</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="3"
                          value={scene.trimStartSec ?? 0.05}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            onChangeProject({
                              scenes: project.scenes.map((s) =>
                                s.id === scene.id ? { ...s, trimStartSec: val } : s
                              ),
                            });
                          }}
                          className="w-16 px-1.5 py-0.5 rounded bg-panel border border-line font-mono text-cream"
                        />
                        <span>Potong Akhir (dtk):</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="3"
                          value={scene.trimEndSec ?? 0.12}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            onChangeProject({
                              scenes: project.scenes.map((s) =>
                                s.id === scene.id ? { ...s, trimEndSec: val } : s
                              ),
                            });
                          }}
                          className="w-16 px-1.5 py-0.5 rounded bg-panel border border-line font-mono text-cream"
                        />
                      </div>
                    </div>

                    {scene.lastFrameUrl && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-mutedWarm font-medium flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-amberGold" />
                          Frame Terakhir Otomatis (Untuk Sambung Scene {scene.sceneNumber + 1}):
                        </div>
                        <img
                          src={scene.lastFrameUrl}
                          alt="Last frame"
                          className="w-full max-h-44 object-contain rounded-lg bg-black border border-line"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={async () => {
                              await copyMediaImageToClipboard(scene.lastFrameUrl!);
                              notify('Frame terakhir disalin! Tinggal Ctrl+V sebagai First Frame scene berikutnya.');
                            }}
                            className="px-2.5 py-1 rounded bg-amberGold text-obsidian text-[11px] font-bold flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copy Frame
                          </button>
                          <button
                            onClick={() => onReExtractFrame(scene.id, 0.35)}
                            className="px-2 py-1 rounded bg-panel border border-line text-[11px] text-mutedWarm hover:text-cream flex items-center gap-1"
                            title="Gunakan jika mata karakter pas kedip di ujung klip"
                          >
                            <RefreshCw className="w-3 h-3" /> Mundur -0.35s
                          </button>
                          <button
                            onClick={() => onReExtractFrame(scene.id, 0.7)}
                            className="px-2 py-1 rounded bg-panel border border-line text-[11px] text-mutedWarm hover:text-cream"
                          >
                            Mundur -0.7s
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* RIGHT STICKY: FFmpeg Multi-Clip Stitcher */}
      <div className="xl:col-span-4 xl:sticky xl:top-5 space-y-4">
        <div className="p-5 rounded-2xl bg-panel border border-amberGold/50 shadow-xl space-y-4">
          <div>
            <h3 className="font-display text-base uppercase tracking-wider text-amberGold font-bold flex items-center gap-2">
              <Film className="w-4 h-4" />
              Studio Gabung Video Utuh (FFmpeg)
            </h3>
            <p className="text-xs text-mutedWarm mt-1">
              Menyatukan semua klip 8–15 detik menjadi 1 video panjang 20–40+ detik yang mulus, natural, dan siap upload ke TikTok / Reels / Shorts / YouTube.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-obsidian border border-line space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-mutedWarm">Klip Terkumpul</span>
              <span className="font-mono font-bold text-amberBright">
                {readyClipsCount} / {project.scenes.length} Scene
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-panel overflow-hidden border border-line">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{
                  width: `${Math.round(
                    (readyClipsCount / Math.max(1, project.scenes.length)) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs pt-1">
              <span className="text-mutedWarm">Total Durasi Kotor</span>
              <span className="font-mono text-cream">{totalActualSec.toFixed(1)} Detik</span>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl bg-obsidian border border-line">
              <input
                type="checkbox"
                checked={project.stitchSettings.applyRealismGrain}
                onChange={(e) =>
                  onChangeProject({
                    stitchSettings: {
                      ...project.stitchSettings,
                      applyRealismGrain: e.target.checked,
                    },
                  })
                }
                className="accent-amberGold mt-0.5"
              />
              <div>
                <div className="font-semibold text-cream">
                  Realism Smartphone Sensor Grain
                </div>
                <div className="text-[11px] text-mutedWarm">
                  Menambahkan grain tipis & kontras organik kamera HP agar sambungan antar-klip tidak terlihat licin AI.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl bg-obsidian border border-line">
              <input
                type="checkbox"
                checked={project.stitchSettings.normalizeAudio}
                onChange={(e) =>
                  onChangeProject({
                    stitchSettings: {
                      ...project.stitchSettings,
                      normalizeAudio: e.target.checked,
                    },
                  })
                }
                className="accent-amberGold mt-0.5"
              />
              <div>
                <div className="font-semibold text-cream">Normalisasi Suara Antar-Klip</div>
                <div className="text-[11px] text-mutedWarm">
                  Meratakan volume audio walaupun klip dirender dari beberapa akun berbeda.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl bg-obsidian border border-line">
              <input
                type="checkbox"
                checked={project.stitchSettings.copyToHasilUgc}
                onChange={(e) =>
                  onChangeProject({
                    stitchSettings: {
                      ...project.stitchSettings,
                      copyToHasilUgc: e.target.checked,
                    },
                  })
                }
                className="accent-amberGold mt-0.5"
              />
              <div>
                <div className="font-semibold text-cream">
                  Simpan Otomatis ke Folder HASIL UGC
                </div>
                <div className="text-[11px] text-mutedWarm font-mono">
                  D:\Dika\HASIL UGC
                </div>
              </div>
            </label>
          </div>

          {project.scenes.length > 1 && emptyClipsCount > 0 && (
            <button
              onClick={async () => {
                await onBatchPullAndStitch();
                await loadRecentDownloads();
              }}
              disabled={isStitching}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-obsidian font-display uppercase tracking-wide font-bold text-xs flex items-center justify-center gap-2 shadow-lg"
            >
              {isStitching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menarik &amp; Menggabungkan...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Tarik Batch ({emptyClipsCount} MP4 Baru) &amp; Auto-Gabung
                </>
              )}
            </button>
          )}

          <button
            onClick={onStitchProject}
            disabled={isStitching || readyClipsCount === 0}
            className="w-full py-3.5 px-4 rounded-xl bg-amberGold hover:bg-amberBright disabled:opacity-40 text-obsidian font-display uppercase tracking-wide font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
          >
            {isStitching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sedang Menggabungkan Video...
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                Gabungkan {readyClipsCount} Klip Jadi 1 MP4 Utuh
              </>
            )}
          </button>

          {/* Final Exported Video Player */}
          {project.finalVideoUrl && (
            <div className="pt-3 border-t border-line space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-300 uppercase">
                  ✅ Video Akhir Siap ({project.finalDurationSec} Detik)
                </span>
              </div>
              <video
                key={project.finalVideoUrl}
                src={project.finalVideoUrl}
                controls
                className="w-full max-h-80 rounded-xl bg-black border border-emerald-700/50"
              />
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={project.finalVideoUrl}
                  download
                  className="py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-obsidian text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </a>
                {project.finalVideoPath && (
                  <button
                    onClick={() => revealInExplorer(project.finalVideoPath!)}
                    className="py-2 px-3 rounded-lg bg-obsidian hover:bg-panelSoft border border-line text-cream text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Buka di Folder
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
