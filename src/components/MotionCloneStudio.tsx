import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Chrome,
  Copy,
  Download,
  Film,
  FolderOpen,
  ImagePlus,
  Loader2,
  Package,
  Play,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  Upload,
  User,
  Video,
  Zap,
} from 'lucide-react';
import { compileMotionClonePrompt } from '../engine/motionCompiler';
import {
  copyMediaImageToClipboard,
  copyTextToClipboard,
  revealInExplorer,
  uploadSingleFile,
} from '../lib/clipboardImage';
import {
  CharacterAsset,
  FlowAccount,
  MotionCloneJob,
  MotionCloneMode,
  ProductAsset,
} from '../types/studio';

interface Props {
  jobs: MotionCloneJob[];
  activeJob?: MotionCloneJob;
  characters: CharacterAsset[];
  products: ProductAsset[];
  activeAccount?: FlowAccount;
  activeSegmentId?: string;
  onSelectJob: (jobId: string) => Promise<void>;
  onCreateJob: () => Promise<void>;
  onUpdateJob: (job: MotionCloneJob) => Promise<void>;
  onDeleteJob: (jobId: string) => Promise<void>;
  onUploadReferenceVideo: (
    jobId: string,
    opts: { file?: File; grabLatest?: boolean; maxSegmentSec?: number }
  ) => Promise<void>;
  onResliceJob: (jobId: string, maxSegmentSec: number) => Promise<void>;
  onSelectBridgeSegment: (jobId: string, segId: string) => Promise<void>;
  onAttachSegmentOutput: (
    jobId: string,
    segId: string,
    opts: { file?: File; grabLatest?: boolean }
  ) => Promise<void>;
  onStitchJob: (jobId: string) => Promise<void>;
  onLaunchActiveAccount: () => Promise<void>;
  onRotateAccount: () => Promise<void>;
  notify: (msg: string, type?: 'ok' | 'err') => void;
}

export const MotionCloneStudio: React.FC<Props> = ({
  jobs,
  activeJob,
  characters,
  products,
  activeAccount,
  activeSegmentId,
  onSelectJob,
  onCreateJob,
  onUpdateJob,
  onDeleteJob,
  onUploadReferenceVideo,
  onResliceJob,
  onSelectBridgeSegment,
  onAttachSegmentOutput,
  onStitchJob,
  onLaunchActiveAccount,
  onRotateAccount,
  notify,
}) => {
  const [uploadingRef, setUploadingRef] = useState(false);
  const [busySegId, setBusySegId] = useState<string | null>(null);
  const [stitching, setStitching] = useState(false);

  const refVideoCompareRef = useRef<HTMLVideoElement | null>(null);
  const outVideoCompareRef = useRef<HTMLVideoElement | null>(null);

  if (!activeJob) {
    return (
      <div className="p-10 rounded-2xl bg-panel border border-line text-center space-y-4 max-w-xl mx-auto mt-8">
        <Video className="w-10 h-10 text-amberGold mx-auto" />
        <h2 className="font-display text-xl font-bold uppercase text-cream">
          Motion Clone Studio (Tiru Gerakan Video Orang Lain)
        </h2>
        <p className="text-xs text-mutedWarm leading-relaxed">
          Upload 1 video referensi gerakan orang lain + 1 foto karakter/produk lu, lalu generate agar karakter lu mengikuti gerakan, gestur tangan, dan ekspresi video referensi secara natural &amp; clean!
        </p>
        <button
          onClick={onCreateJob}
          className="px-6 py-3 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian font-bold text-sm inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Mulai Motion Clone Baru
        </button>
      </div>
    );
  }

  const selectedChar = characters.find((c) => c.id === activeJob.characterId);
  const selectedProd = products.find((p) => p.id === activeJob.productId);
  const effectiveCharImg = activeJob.customCharImageUrl || selectedChar?.imageUrl;
  const effectiveProdImg = activeJob.customProdImageUrl || selectedProd?.imageUrl;

  const readyOutputs = activeJob.segments.filter((s) => Boolean(s.outputVideoUrl)).length;
  const previewOutputUrl =
    activeJob.finalVideoUrl ||
    (activeJob.segments.length === 1 ? activeJob.segments[0]?.outputVideoUrl : undefined);

  const patchJob = (patch: Partial<MotionCloneJob>) => {
    onUpdateJob({ ...activeJob, ...patch });
  };

  const playSideBySide = () => {
    if (refVideoCompareRef.current && outVideoCompareRef.current) {
      refVideoCompareRef.current.currentTime = 0;
      outVideoCompareRef.current.currentTime = 0;
      refVideoCompareRef.current.play().catch(() => {});
      outVideoCompareRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Motion Clone Job Bar */}
      <div className="p-4 rounded-2xl bg-panel border border-line flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="px-2.5 py-1 rounded-lg bg-amberGold text-obsidian font-display font-bold text-xs uppercase">
            🕺 MOTION CLONE
          </span>
          <select
            value={activeJob.id}
            onChange={(e) => onSelectJob(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian border border-line text-xs font-semibold text-cream"
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} ({j.segments.length} segmen)
              </option>
            ))}
          </select>
          <input
            value={activeJob.title}
            onChange={(e) => patchJob({ title: e.target.value })}
            className="px-3 py-1.5 rounded-xl bg-obsidian border border-line text-xs text-cream w-52"
            placeholder="Nama Motion Clone..."
          />
          <button
            onClick={onCreateJob}
            className="px-3 py-1.5 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Job Baru
          </button>
          {jobs.length > 1 && (
            <button
              onClick={() => onDeleteJob(activeJob.id)}
              className="p-1.5 rounded-lg bg-obsidian border border-line text-mutedWarm hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onLaunchActiveAccount}
            className="px-3 py-1.5 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5"
          >
            <Chrome className="w-3.5 h-3.5" />
            Buka Google Flow ({activeAccount?.name || 'Akun Aktif'})
          </button>
          <button
            onClick={onRotateAccount}
            className="px-2.5 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 text-xs font-semibold flex items-center gap-1"
          >
            <Zap className="w-3.5 h-3.5 text-amberGold" />
            Token Habis → Ganti Akun
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 1. Reference Video + 2. Target Image */}
        <div className="xl:col-span-5 space-y-5">
          {/* Box 1: Upload Reference Video */}
          <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm uppercase tracking-wider text-amberGold font-bold">
                1. Input Video Referensi Orang Lain
              </span>
              {activeJob.sourceDurationSec && (
                <span className="font-mono text-xs text-amberBright">
                  {activeJob.sourceDurationSec} dtk • {activeJob.aspectRatio}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="flex-1 py-2.5 px-3 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5">
                {uploadingRef ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Upload Video Referensi (MP4)
                <input
                  type="file"
                  accept="video/mp4,video/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploadingRef(true);
                    try {
                      await onUploadReferenceVideo(activeJob.id, {
                        file: f,
                        maxSegmentSec: activeJob.maxSegmentSec,
                      });
                    } finally {
                      setUploadingRef(false);
                    }
                  }}
                />
              </label>

              <button
                disabled={uploadingRef}
                onClick={async () => {
                  setUploadingRef(true);
                  try {
                    await onUploadReferenceVideo(activeJob.id, {
                      grabLatest: true,
                      maxSegmentSec: activeJob.maxSegmentSec,
                    });
                  } finally {
                    setUploadingRef(false);
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-obsidian hover:bg-panelSoft border border-line text-cream text-xs font-semibold flex items-center gap-1.5"
                title="Ambil video MP4 yang baru lu download dari TikTok/Reels di folder Downloads"
              >
                <Download className="w-3.5 h-3.5 text-amberGold" />
                Tarik dari Downloads
              </button>
            </div>

            {/* Segment Length Selector */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-mutedWarm">Batas Potong per Klip:</span>
              <div className="flex gap-1.5">
                {[
                  { sec: 15, label: '15 dtk (Omni Flash)' },
                  { sec: 10, label: '10 dtk' },
                  { sec: 8, label: '8 dtk (Veo)' },
                ].map((opt) => (
                  <button
                    key={opt.sec}
                    onClick={async () => {
                      if (activeJob.sourceVideoUrl) {
                        setUploadingRef(true);
                        try {
                          await onResliceJob(activeJob.id, opt.sec);
                        } finally {
                          setUploadingRef(false);
                        }
                      } else {
                        patchJob({ maxSegmentSec: opt.sec });
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                      activeJob.maxSegmentSec === opt.sec
                        ? 'bg-amberGold text-obsidian border-amberGold'
                        : 'bg-obsidian border-line text-mutedWarm hover:text-cream'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {activeJob.sourceVideoUrl && (
              <video
                key={activeJob.sourceVideoUrl}
                src={activeJob.sourceVideoUrl}
                controls
                className="w-full max-h-64 rounded-xl bg-black border border-line"
              />
            )}
          </div>

          {/* Box 2: Target Character & Product Image */}
          <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
            <span className="font-display text-sm uppercase tracking-wider text-amberGold font-bold block">
              2. Input Gambar Lu &amp; Mode Gerakan
            </span>

            <div className="space-y-2">
              {(
                [
                  {
                    id: 'character_swap',
                    title: '🔄 Ganti Karakter Saja (1:1 Clean Swap)',
                    desc: 'Orang di video referensi berubah jadi karakter lu, gerakan + ekspresi + ruangan asli sama persis.',
                  },
                  {
                    id: 'character_and_product',
                    title: '📦 Ganti Karakter + Barang yang Dipegang (UGC)',
                    desc: 'Orangnya jadi talent lu & barang yang dipegang di tangannya otomatis diganti jadi produk lu!',
                  },
                  {
                    id: 'motion_new_bg',
                    title: '🏠 Ikuti Gerakan Saja + Pindah Ruangan Baru',
                    desc: 'Gerakan badan & tangan sama persis seperti referensi, tapi background diganti ke studio/lokasi baru.',
                  },
                ] as { id: MotionCloneMode; title: string; desc: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => patchJob({ cloneMode: m.id })}
                  className={`w-full p-3 rounded-xl border text-left transition ${
                    activeJob.cloneMode === m.id
                      ? 'bg-amberGold/15 border-amberGold text-cream'
                      : 'bg-obsidian border-line text-mutedWarm hover:text-cream'
                  }`}
                >
                  <div className="text-xs font-bold text-cream">{m.title}</div>
                  <div className="text-[11px] text-mutedWarm mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>

            {activeJob.cloneMode === 'motion_new_bg' && (
              <div>
                <label className="block text-xs text-mutedWarm mb-1">
                  Deskripsi Ruangan / Background Baru
                </label>
                <input
                  value={activeJob.newLocationPrompt}
                  onChange={(e) => patchJob({ newLocationPrompt: e.target.value })}
                  placeholder="Misal: kamar minimalis Indonesia siang hari dengan cahaya jendela natural..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
                />
              </div>
            )}

            {/* Character Picker or Quick Image Upload */}
            <div className="p-3.5 rounded-xl bg-obsidian border border-line space-y-2.5">
              <div className="text-xs font-bold text-cream flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amberGold" />
                Gambar Karakter Pengganti
              </div>
              <select
                value={activeJob.characterId || ''}
                onChange={(e) =>
                  patchJob({
                    characterId: e.target.value || undefined,
                    customCharImageUrl: undefined,
                    customCharImagePath: undefined,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-xs text-cream"
              >
                <option value="">— Upload Gambar Bebas Tanpa Preset —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Talent: {c.name} {c.imageUrl ? '✓' : '(Belum ada foto)'}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-3">
                <div className="w-16 h-20 rounded-lg bg-panel border border-line overflow-hidden flex items-center justify-center flex-shrink-0">
                  {effectiveCharImg ? (
                    <img src={effectiveCharImg} alt="Char" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-mutedWarm/40" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="px-3 py-1.5 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold cursor-pointer inline-flex items-center gap-1.5">
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload Gambar Karakter Lu
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const up = await uploadSingleFile(f);
                          patchJob({
                            characterId: undefined,
                            customCharImageUrl: up.url,
                            customCharImagePath: up.filePath,
                          });
                          notify('Gambar karakter berhasil dipasang!');
                        } catch (err: any) {
                          notify(err.message, 'err');
                        }
                      }}
                    />
                  </label>
                  {effectiveCharImg && (
                    <button
                      onClick={async () => {
                        await copyMediaImageToClipboard(effectiveCharImg);
                        notify('Gambar Karakter tersalin! Tinggal Ctrl+V di Google Flow.');
                      }}
                      className="block px-2.5 py-1 rounded bg-panel border border-line text-[11px] text-amberBright"
                    >
                      📋 Copy Gambar (Ctrl+V)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Optional Product Image (when character_and_product) */}
            {activeJob.cloneMode === 'character_and_product' && (
              <div className="p-3.5 rounded-xl bg-obsidian border border-line space-y-2.5">
                <div className="text-xs font-bold text-cream flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-amberGold" />
                  Gambar Produk Pengganti
                </div>
                <select
                  value={activeJob.productId || ''}
                  onChange={(e) =>
                    patchJob({
                      productId: e.target.value || undefined,
                      customProdImageUrl: undefined,
                      customProdImagePath: undefined,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-xs text-cream"
                >
                  <option value="">— Upload Foto Produk Bebas —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      Produk: {p.name} {p.imageUrl ? '✓' : '(Belum ada foto)'}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-panel border border-line overflow-hidden flex items-center justify-center flex-shrink-0">
                    {effectiveProdImg ? (
                      <img src={effectiveProdImg} alt="Prod" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-mutedWarm/40" />
                    )}
                  </div>
                  <label className="px-3 py-1.5 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold cursor-pointer inline-flex items-center gap-1.5">
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload Foto Produk
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const up = await uploadSingleFile(f);
                          patchJob({
                            productId: undefined,
                            customProdImageUrl: up.url,
                            customProdImagePath: up.filePath,
                          });
                          notify('Foto produk berhasil dipasang!');
                        } catch (err: any) {
                          notify(err.message, 'err');
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Segments Execution + Stitch + Side-by-Side Compare */}
        <div className="xl:col-span-7 space-y-5">
          {/* Side-by-Side Comparison Player (Once Output Exists!) */}
          {activeJob.sourceVideoUrl && previewOutputUrl && (
            <div className="p-5 rounded-2xl bg-panel border border-emerald-600/60 space-y-3 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-display text-sm uppercase tracking-wider text-emerald-300 font-bold">
                    ✅ Cek Kemiripan Gerakan (Side-by-Side Sync Preview)
                  </span>
                  <p className="text-xs text-mutedWarm">
                    Putar berbarengan untuk membandingkan gerakan referensi asli vs hasil karakter lu!
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={playSideBySide}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-obsidian text-xs font-bold flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Putar Bareng (0:00)
                  </button>
                  <a
                    href={previewOutputUrl}
                    download
                    className="px-3 py-1.5 rounded-xl bg-amberGold text-obsidian text-xs font-bold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Download MP4
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-mutedWarm mb-1 font-semibold">
                    Video Referensi Orang Lain
                  </div>
                  <video
                    ref={refVideoCompareRef}
                    src={activeJob.sourceVideoUrl}
                    controls
                    className="w-full max-h-72 rounded-xl bg-black border border-line"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-emerald-300 mb-1 font-semibold">
                    Hasil Karakter Lu
                  </div>
                  <video
                    ref={outVideoCompareRef}
                    src={previewOutputUrl}
                    controls
                    className="w-full max-h-72 rounded-xl bg-black border border-emerald-600/50"
                  />
                </div>
              </div>
            </div>
          )}

          {activeJob.segments.length === 0 ? (
            <div className="p-8 rounded-2xl bg-panel border border-dashed border-line text-center text-mutedWarm text-sm">
              👈 Upload <strong>Video Referensi Orang Lain</strong> di kolom kiri terlebih dahulu. Sistem akan otomatis menyiapkan segmen gerakan &amp; prompt Motion-Transfer!
            </div>
          ) : (
            <>
              {/* Segment Cards */}
              {activeJob.segments.map((seg, idx) => {
                const compiled = compileMotionClonePrompt(
                  activeJob,
                  seg,
                  selectedChar,
                  selectedProd
                );
                const isTarget =
                  activeSegmentId === seg.id || (!activeSegmentId && idx === 0);
                const isBusy = busySegId === seg.id;

                return (
                  <div
                    key={seg.id}
                    className={`p-5 rounded-2xl border space-y-4 ${
                      isTarget
                        ? 'bg-panelSoft border-amberGold shadow-lg'
                        : 'bg-panel border-line'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-amberGold text-obsidian font-mono font-bold text-xs">
                          SEGMEN {seg.segmentNumber} / {activeJob.segments.length}
                        </span>
                        <span className="text-xs text-mutedWarm font-mono">
                          ({seg.startSec}s – {seg.endSec}s • {seg.durationSec} dtk)
                        </span>
                        {seg.outputVideoUrl && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Selesai
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => onSelectBridgeSegment(activeJob.id, seg.id)}
                        className="px-3 py-1 rounded-lg bg-obsidian border border-line text-xs text-amberBright flex items-center gap-1.5"
                      >
                        <Target className="w-3.5 h-3.5" />
                        {isTarget ? 'Aktif di Dock Flow' : 'Kirim ke Dock Flow'}
                      </button>
                    </div>

                    {/* Reference Clip + Quick Drag/Copy Bar */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-obsidian border border-line">
                      <div>
                        <div className="text-[11px] text-mutedWarm mb-1">
                          Potongan Klip Referensi Segmen {seg.segmentNumber}:
                        </div>
                        <video
                          src={seg.refClipUrl}
                          controls
                          className="w-full max-h-44 rounded-lg bg-black border border-line"
                        />
                      </div>

                      <div className="space-y-2 flex flex-col justify-between">
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold uppercase text-amberGold">
                            Aset untuk Dimasukkan ke Google Flow:
                          </div>
                          <button
                            onClick={async () => {
                              await revealInExplorer(seg.refClipPath);
                              notify('📂 File klip referensi disorot di Explorer! Drag langsung ke Google Flow.');
                            }}
                            className="w-full py-1.5 px-3 rounded-lg bg-panel hover:bg-panelSoft border border-line text-xs text-cream font-semibold flex items-center justify-between"
                          >
                            <span>1. Klip Video Referensi</span>
                            <span className="text-amberBright flex items-center gap-1">
                              <FolderOpen className="w-3.5 h-3.5" /> Buka &amp; Drag
                            </span>
                          </button>

                          {effectiveCharImg && (
                            <button
                              onClick={async () => {
                                await copyMediaImageToClipboard(effectiveCharImg);
                                notify('Gambar Karakter disalin! Tekan Ctrl+V di Google Flow.');
                              }}
                              className="w-full py-1.5 px-3 rounded-lg bg-panel hover:bg-panelSoft border border-line text-xs text-cream font-semibold flex items-center justify-between"
                            >
                              <span>2. Gambar Karakter Target</span>
                              <span className="text-amberBright flex items-center gap-1">
                                <Copy className="w-3.5 h-3.5" /> Copy (Ctrl+V)
                              </span>
                            </button>
                          )}

                          {activeJob.cloneMode === 'character_and_product' && effectiveProdImg && (
                            <button
                              onClick={async () => {
                                await copyMediaImageToClipboard(effectiveProdImg);
                                notify('Gambar Produk disalin! Tekan Ctrl+V di Google Flow.');
                              }}
                              className="w-full py-1.5 px-3 rounded-lg bg-panel hover:bg-panelSoft border border-line text-xs text-cream font-semibold flex items-center justify-between"
                            >
                              <span>3. Gambar Produk Target</span>
                              <span className="text-amberBright flex items-center gap-1">
                                <Copy className="w-3.5 h-3.5" /> Copy (Ctrl+V)
                              </span>
                            </button>
                          )}
                        </div>

                        <div>
                          <label className="block text-[10.5px] text-mutedWarm mb-1">
                            Dialog Bahasa Indonesia Baru (Opsional — kosongkan jika murni gerak):
                          </label>
                          <input
                            value={seg.dialogueOverride}
                            onChange={(e) => {
                              const next = activeJob.segments.map((s) =>
                                s.id === seg.id ? { ...s, dialogueOverride: e.target.value } : s
                              );
                              patchJob({ segments: next });
                            }}
                            placeholder="Kosongkan atau ketik kalimat dialog..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Prompt Copy */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold uppercase text-mutedWarm">
                          Prompt Motion-Transfer Clean (Omni Flash):
                        </span>
                        <button
                          onClick={async () => {
                            await copyTextToClipboard(compiled.prompt);
                            await onSelectBridgeSegment(activeJob.id, seg.id);
                            notify(`Prompt Motion Clone Segmen ${seg.segmentNumber} tersalin!`);
                          }}
                          className="px-3 py-1 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Prompt Motion Clone
                        </button>
                      </div>
                      <pre className="p-2.5 rounded-xl bg-obsidian border border-line font-mono text-[10.5px] text-cream/90 max-h-28 overflow-y-auto whitespace-pre-wrap">
                        {compiled.prompt}
                      </pre>
                    </div>

                    {/* Attach Output */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
                      <span className="text-xs font-semibold text-emerald-300">
                        Hasil Generate Segmen {seg.segmentNumber}:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={isBusy}
                          onClick={async () => {
                            setBusySegId(seg.id);
                            try {
                              await onAttachSegmentOutput(activeJob.id, seg.id, {
                                grabLatest: true,
                              });
                            } finally {
                              setBusySegId(null);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-obsidian text-xs font-bold flex items-center gap-1.5"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Tarik MP4 Hasil dari Downloads
                        </button>
                        <label className="px-3 py-1.5 rounded-lg bg-obsidian border border-line text-xs text-cream cursor-pointer flex items-center gap-1">
                          <Upload className="w-3.5 h-3.5" /> Upload MP4
                          <input
                            type="file"
                            accept="video/mp4,video/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              setBusySegId(seg.id);
                              try {
                                await onAttachSegmentOutput(activeJob.id, seg.id, { file: f });
                              } finally {
                                setBusySegId(null);
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Stitch Button when Multi-Segment (>15s Reference Video) */}
              {activeJob.segments.length > 1 && (
                <div className="p-5 rounded-2xl bg-panel border border-amberGold/50 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-sm uppercase font-bold text-amberGold">
                      Gabung Semua Segmen Motion Clone ({readyOutputs}/{activeJob.segments.length} Siap)
                    </div>
                    <p className="text-xs text-mutedWarm">
                      Menyatukan kembali semua segmen menjadi 1 video utuh berdurasi penuh &amp; simpan ke HASIL UGC.
                    </p>
                  </div>
                  <button
                    disabled={stitching || readyOutputs === 0}
                    onClick={async () => {
                      setStitching(true);
                      try {
                        await onStitchJob(activeJob.id);
                      } finally {
                        setStitching(false);
                      }
                    }}
                    className="px-5 py-3 rounded-xl bg-amberGold hover:bg-amberBright disabled:opacity-40 text-obsidian font-bold text-xs uppercase flex items-center gap-2"
                  >
                    {stitching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Film className="w-4 h-4" />
                    )}
                    Gabungkan Jadi 1 Video Utuh
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
