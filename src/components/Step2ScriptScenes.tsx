import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Link2,
  Layers,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  auditSceneAntiBug,
  extractSpokenLinesFromRawScript,
  normalizeIndonesianForSpeech,
} from '../engine/antiBugEngine';
import {
  autoSplitScriptToScenes,
  compileMasterScriptPrompt,
  countWords,
  estimateClipCountForProject,
  estimateClipSeconds,
  getMaxSafeWords,
  getProjectMaxClipSec,
  getWordBudgetStatus,
} from '../engine/flowCompiler';
import {
  HOOK_PRESETS,
  PERSONAS,
  SHOT_TYPES,
  STORY_ARCS,
  TONE_PRESETS,
} from '../engine/presets';
import { copyTextToClipboard } from '../lib/clipboardImage';
import {
  CharacterAsset,
  ContinuityMode,
  ProductAsset,
  SceneClip,
  SpeechMode,
  StudioProject,
} from '../types/studio';

interface Props {
  project: StudioProject;
  character?: CharacterAsset;
  product?: ProductAsset;
  onChangeProject: (patch: Partial<StudioProject>) => void;
  onGoStep3: () => void;
  notify: (msg: string, type?: 'ok' | 'err') => void;
}

export const Step2ScriptScenes: React.FC<Props> = ({
  project,
  character,
  product,
  onChangeProject,
  onGoStep3,
  notify,
}) => {
  const [showPromptCompiler, setShowPromptCompiler] = useState(false);

  const maxClipSec = getProjectMaxClipSec(project);
  const safeWordsLimit = getMaxSafeWords(maxClipSec);
  const targetClipCount = estimateClipCountForProject(project);
  const masterScriptPrompt = compileMasterScriptPrompt(project, character, product);

  const totalEstimatedSec = project.scenes.reduce((acc, s) => acc + (s.durationSec || 7), 0);
  const rawSpokenOnly = extractSpokenLinesFromRawScript(project.rawScript);
  const rawSpokenWords = countWords(normalizeIndonesianForSpeech(rawSpokenOnly));
  const rawEstTotalSec =
    rawSpokenWords > 0
      ? Math.ceil(rawSpokenWords / 1.85) + Math.max(1, Math.ceil(rawSpokenWords / safeWordsLimit)) * 2
      : 0;
  const rawEstClips =
    rawSpokenWords > 0 ? Math.max(1, Math.ceil(rawSpokenWords / safeWordsLimit)) : 0;

  const handleAutoSplit = (goStraightToStep3 = false) => {
    if (!project.rawScript.trim()) {
      notify('Tempel atau tulis narasi Bahasa Indonesia lu dulu di kotak Narasi!', 'err');
      return;
    }
    const generated = autoSplitScriptToScenes(project.rawScript, project);
    onChangeProject({ scenes: generated });
    const estTotal = generated.reduce((s, c) => s + c.durationSec, 0);
    notify(
      `🛡️ Narasi dikunci jadi ${generated.length} Klip Anti-Bug (~${estTotal} detik total • Ejaan suara & pose aman)!`
    );
    if (goStraightToStep3) {
      setTimeout(() => onGoStep3(), 80);
    }
  };

  const updateScene = (sceneId: string, patch: Partial<SceneClip>) => {
    const next = project.scenes.map((s) => {
      if (s.id !== sceneId) return s;
      const updated = { ...s, ...patch };
      if (patch.dialogue !== undefined && patch.durationSec === undefined) {
        updated.durationSec = estimateClipSeconds(patch.dialogue, maxClipSec);
      }
      return updated;
    });
    onChangeProject({ scenes: next });
  };

  const splitSingleSceneInTwo = (sceneId: string) => {
    const idx = project.scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const target = project.scenes[idx];
    const words = target.dialogue.trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) return;

    const mid = Math.ceil(words.length / 2);
    const part1 = words.slice(0, mid).join(' ');
    const part2 = words.slice(mid).join(' ');

    const sc1: SceneClip = {
      ...target,
      dialogue: part1,
      durationSec: estimateClipSeconds(part1, maxClipSec),
    };
    const sc2: SceneClip = {
      ...target,
      id: `sc_${Date.now()}_split`,
      beatLabel: `${target.beatLabel} (Lanjutan)`,
      dialogue: part2,
      durationSec: estimateClipSeconds(part2, maxClipSec),
      continuityMode: project.contentMode === 'storytelling' ? 'frame_chain' : 'ingredients',
      videoUrl: undefined,
      videoPath: undefined,
      lastFrameUrl: undefined,
      lastFramePath: undefined,
    };

    const next = [...project.scenes];
    next.splice(idx, 1, sc1, sc2);
    next.forEach((s, i) => (s.sceneNumber = i + 1));
    onChangeProject({ scenes: next });
    notify('Scene panjang berhasil dibelah menjadi 2 klip aman!');
  };

  const addBlankScene = () => {
    const num = project.scenes.length + 1;
    const newSc: SceneClip = {
      id: `sc_${Date.now()}`,
      sceneNumber: num,
      beatLabel: `Scene ${num}`,
      durationSec: 7,
      dialogue: '',
      speechMode: 'lip_sync',
      shotType: 'talking_head',
      actionDirection: 'speaks casually and naturally to camera',
      gesture: '',
      continuityMode: project.contentMode === 'storytelling' && num > 1 ? 'frame_chain' : 'ingredients',
      trimStartSec: 0.05,
      trimEndSec: 0.12,
    };
    onChangeProject({ scenes: [...project.scenes, newSc] });
  };

  const moveScene = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= project.scenes.length) return;
    const next = [...project.scenes];
    const [item] = next.splice(idx, 1);
    next.splice(targetIdx, 0, item);
    next.forEach((s, i) => (s.sceneNumber = i + 1));
    onChangeProject({ scenes: next });
  };

  const deleteScene = (sceneId: string) => {
    const next = project.scenes.filter((s) => s.id !== sceneId);
    next.forEach((s, i) => (s.sceneNumber = i + 1));
    onChangeProject({ scenes: next });
  };

  const setAllContinuity = (mode: ContinuityMode) => {
    const next = project.scenes.map((s, idx) => ({
      ...s,
      continuityMode: idx === 0 && mode === 'frame_chain' ? 'ingredients' : mode,
    }));
    onChangeProject({ scenes: next });
    notify(
      mode === 'frame_chain'
        ? 'Semua scene (S2 dst.) diset ke Seamless Frame-Chain (Sambung Frame Terakhir)!'
        : 'Semua scene diset ke Multi-Angle Ingredients!'
    );
  };

  return (
    <div className="space-y-6">
      {/* Section A: Zero-API-Key Master Script Prompt Compiler */}
      <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-display text-sm uppercase tracking-wider text-amberGold font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              2A. Mesin Pembuat Prompt Naskah Anti-AI (Tanpa Perlu API Key!)
            </span>
            <p className="text-xs text-mutedWarm mt-0.5">
              Isi poin singkat → Copy Master Prompt ke ChatGPT / Gemini Web → Paste hasilnya ke kotak naskah di bawah!
            </p>
          </div>
          <button
            onClick={() => setShowPromptCompiler(!showPromptCompiler)}
            className="px-3 py-1 rounded-lg bg-obsidian border border-line text-xs text-mutedWarm hover:text-cream"
          >
            {showPromptCompiler ? 'Sembunyikan' : 'Buka Generator Prompt Naskah'}
          </button>
        </div>

        {showPromptCompiler && (
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-mutedWarm mb-1">Persona Audiens</label>
                <select
                  value={project.personaId}
                  onChange={(e) => onChangeProject({ personaId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
                >
                  {PERSONAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-mutedWarm mb-1">Gaya Bahasa Lisan</label>
                <select
                  value={project.toneId}
                  onChange={(e) => onChangeProject({ toneId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
                >
                  {TONE_PRESETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-mutedWarm mb-1">
                  {project.contentMode === 'ugc' ? 'Gaya Hook 3 Detik Pertama' : 'Alur Storytelling'}
                </label>
                {project.contentMode === 'ugc' ? (
                  <select
                    value={project.hookId}
                    onChange={(e) => onChangeProject({ hookId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
                  >
                    {HOOK_PRESETS.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={project.storyArcId}
                    onChange={(e) => onChangeProject({ storyArcId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
                  >
                    {STORY_ARCS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-mutedWarm mb-1">
                  {project.contentMode === 'ugc'
                    ? 'Pain Point / Masalah Utama Pembeli'
                    : 'Premis / Kejadian Inti Cerita'}
                </label>
                <textarea
                  rows={2}
                  value={project.painPointOrPremise}
                  onChange={(e) => onChangeProject({ painPointOrPremise: e.target.value })}
                  placeholder={
                    project.contentMode === 'ugc'
                      ? 'Misal: Suka kesel beli kaos murah baru dicuci sekali kerahnya langsung melar...'
                      : 'Misal: Kejadian salah kirim paket tengah malam yang bikin panik...'
                  }
                  className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
                />
              </div>
              <div>
                <label className="block text-[11px] text-mutedWarm mb-1">
                  {project.contentMode === 'ugc' ? 'Kalimat Arah CTA Akhir' : 'Kalimat Penutup / Pancingan Komentar'}
                </label>
                <textarea
                  rows={2}
                  value={project.ctaText}
                  onChange={(e) => onChangeProject({ ctaText: e.target.value })}
                  placeholder={
                    project.contentMode === 'ugc'
                      ? 'Misal: Cek warna dan ukurannya di keranjang sekarang.'
                      : 'Misal: Kalau lu di posisi gue, lu bakal gimana?'
                  }
                  className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-obsidian p-3 rounded-xl border border-line">
              <div className="text-xs text-mutedWarm">
                Master Prompt otomatis memaksa AI menulis tepat{' '}
                <strong className="text-amberBright">{targetClipCount} Scene</strong> (maks{' '}
                <strong>{maxClipSec} dtk / ~{safeWordsLimit} kata</strong> per klip) sesuai mode{' '}
                <strong className="text-cream">
                  {(project.flowModel || 'omni_flash_15') === 'veo_8'
                    ? 'Veo 8s'
                    : (project.flowModel || 'omni_flash_15') === 'omni_hybrid'
                    ? 'Omni Flash Hybrid'
                    : 'Omni Flash 15s'}
                </strong>
                .
              </div>
              <button
                onClick={async () => {
                  await copyTextToClipboard(masterScriptPrompt);
                  notify('Master Prompt Naskah disalin! Paste ke ChatGPT / Gemini, lalu tempel hasilnya di bawah.');
                }}
                className="px-4 py-2 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Master Prompt Naskah
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section B: SCRIPT + AKSI MODEL / VO / NARASI-ONLY FAST ANTI-BUG BOX (20-40 Detik) */}
      <div className="p-5 rounded-2xl bg-panel border-2 border-amberGold/50 space-y-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-display text-sm sm:text-base uppercase tracking-wider text-amberGold font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              2B. Kotak Script + Aksi Model / VO / Narasi (20–40 Detik • Anti-Bug Otomatis)
            </span>
            <p className="text-xs text-mutedWarm mt-0.5">
              Bisa tulis <strong>Script Lengkap (Aksi Model + Dialog/VO)</strong>, format{' '}
              <strong>Inline (Gerakan) Kalimat</strong>, atau <strong>Narasi Pure</strong>! Arahan gerak model otomatis dipisahkan dari suara &amp; dikunci ke pose aman anti-glitch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleAutoSplit(false)}
              className="px-3.5 py-2 rounded-xl bg-panelSoft hover:bg-obsidian border border-amberGold/50 text-amberBright text-xs font-bold flex items-center gap-1.5"
            >
              <Scissors className="w-3.5 h-3.5" />
              Pecah &amp; Cek Scene ({rawEstClips || targetClipCount} Klip)
            </button>
            <button
              onClick={() => handleAutoSplit(true)}
              className="px-4 py-2 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <Zap className="w-4 h-4" />
              Kunci Script → Langsung Produksi Auto-Run!
            </button>
          </div>
        </div>

        {/* 1-Click Format Template Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-mutedWarm font-semibold">Isi Contoh Format 1-Klik:</span>
          <button
            type="button"
            onClick={() =>
              onChangeProject({
                rawScript: `[SCENE 1 - Hook & Masalah]\nAksi: Duduk santai ngobrol ke kamera, ekspresi agak kesel tapi relatable, tangan diam\nDialog: Jujur dulu gw paling males pakai skincare siang-siang karena baru 2 jam muka langsung berminyak parah!\n\n[SCENE 2 - Tampil Produk]\nAksi: Pegang produk di depan dada sambil senyum yakin ke kamera, sesekali lirik produk\nDialog: Sampai akhirnya gw ganti ke yang harga 150rb ini, asli teksturnya ringan bgt kayak cuma nempel air.\n\n[SCENE 3 - Bukti & Closing]\nAksi: Close-up tangan memegang produk dengan tenang menunjukkan detail kemasan\nVO: Lembapnya ngunci seharian 100% tanpa lengket sama sekali, mending lu langsung cek sekarang deh!`,
              })
            }
            className="px-2.5 py-1 rounded-lg bg-amberGold/15 hover:bg-amberGold/25 border border-amberGold/50 text-amberBright font-semibold"
          >
            🎬 Format 1: Script Lengkap (Aksi + Dialog/VO)
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeProject({
                rawScript: `(Duduk santai ngobrol ke kamera, ekspresi penasaran) Jujur awalnya gw ragu beli alat sekecil ini harganya cuma 150rb utk 2pcs.\n\n(Pegang produk di depan dada sambil senyum puas) Tapi pas udah dipakai kerja seharian, tenaganya stabil bgt ga gampang panas!\n\n(VO | Close-up detail produk dipegang dua tangan) Buat lu yg cari barang awet 100% ga ribet, mending wajib cobain sekarang juga!`,
              })
            }
            className="px-2.5 py-1 rounded-lg bg-obsidian hover:bg-panelSoft border border-line text-cream font-medium"
          >
            ⚡ Format 2: Cepat Inline (Gerakan) + Kalimat
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeProject({
                rawScript: `Jujur awalnya gw ragu beli produk harga 150rb ini karena kelihatannya simpel bgt. Tapi pas udah dipakai rutin tiap pagi, hasilnya kerasa jauh lebih rapi dan hemat waktu. Buat lu yg lagi cari solusi praktis buat harian, mending langsung cek sekarang sebelum kehabisan.`,
              })
            }
            className="px-2.5 py-1 rounded-lg bg-obsidian hover:bg-panelSoft border border-line text-mutedWarm hover:text-cream font-medium"
          >
            🎙️ Format 3: Narasi Pure (Gerakan Otomatis)
          </button>
        </div>

        <textarea
          rows={7}
          value={project.rawScript}
          onChange={(e) => onChangeProject({ rawScript: e.target.value })}
          placeholder={`Bisa pilih salah satu dari 3 gaya penulisan:\n\n[SCENE 1 - Hook]\nAksi: Duduk santai ngobrol ke kamera, ekspresi relatable\nDialog: Jujur awalnya gw ragu beli produk harga 150rb ini...\n\n[SCENE 2 - Show Produk]\nAksi: Pegang produk di depan dada sambil senyum tenang\nVO / Dialog: Tapi pas dipakai harian ternyata awet bgt 100%!`}
          className="w-full p-3.5 rounded-xl bg-obsidian border border-line text-sm text-cream font-sans leading-relaxed focus:border-amberGold focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-obsidian px-3.5 py-2.5 rounded-xl border border-line">
          <div className="flex flex-wrap items-center gap-3 text-mutedWarm">
            <span>
              Kata Ucap Terdeteksi:{' '}
              <strong className="text-cream font-mono">{rawSpokenWords} kata</strong>
            </span>
            <span>•</span>
            <span>
              Estimasi Durasi Video:{' '}
              <strong className="text-amberBright font-mono">~{rawEstTotalSec} detik</strong> (
              {rawEstClips} Klip Omni Flash)
            </span>
          </div>
          <span className="text-[11px] text-emerald-300 font-medium">
            🛡️ Zero-Spawn • Tanpa Teks Bocor • Tanpa BGM Nyasar • Suara Indonesia Jernih
          </span>
        </div>
      </div>

      {/* Section C: Scene Cards (>10s Continuity Chain) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-panel p-4 rounded-2xl border border-line">
          <div>
            <div className="font-display text-sm uppercase tracking-wider text-amberGold font-bold">
              2C. Rangkaian Scene ({project.scenes.length} Klip • Total Estimasi ~{totalEstimatedSec} Detik)
            </div>
            <p className="text-xs text-mutedWarm">
              Atur sudut kamera & cara nyambung antar-klip supaya video &gt;10 detik terasa hidup dan konsisten.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAllContinuity('ingredients')}
              className="px-3 py-1.5 rounded-lg bg-obsidian hover:bg-panelSoft border border-line text-xs text-cream flex items-center gap-1.5"
              title="Cocok untuk UGC: tiap scene ganti angle natural dengan foto Karakter & Produk yang sama"
            >
              <Layers className="w-3.5 h-3.5 text-amberGold" />
              Set Semua: Multi-Angle Ingredients
            </button>
            <button
              onClick={() => setAllContinuity('frame_chain')}
              className="px-3 py-1.5 rounded-lg bg-obsidian hover:bg-panelSoft border border-line text-xs text-cream flex items-center gap-1.5"
              title="Cocok untuk Storytelling: Scene 2 dst. otomatis memakai Frame Terakhir klip sebelumnya (tetap mulus walau ganti akun Google Flow!)"
            >
              <Link2 className="w-3.5 h-3.5 text-emerald-400" />
              Set Semua: Seamless Frame-Chain
            </button>
            <button
              onClick={addBlankScene}
              className="px-3 py-1.5 rounded-lg bg-amberGold text-obsidian text-xs font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Scene
            </button>
          </div>
        </div>

        {project.scenes.map((scene, idx) => {
          const budget = getWordBudgetStatus(scene.dialogue, maxClipSec);
          const audit = auditSceneAntiBug(scene.dialogue, scene.durationSec, maxClipSec);

          return (
            <div
              key={scene.id}
              className="p-4 rounded-2xl bg-panel border border-line space-y-3 hover:border-amberGold/40 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-lg bg-amberGold text-obsidian font-mono font-bold text-xs">
                    SCENE {scene.sceneNumber}
                  </span>
                  <input
                    value={scene.beatLabel}
                    onChange={(e) => updateScene(scene.id, { beatLabel: e.target.value })}
                    className="px-2.5 py-1 rounded-lg bg-obsidian border border-line text-xs font-semibold text-cream w-44"
                  />
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                      budget.level === 'ok'
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50'
                        : budget.level === 'warn'
                        ? 'bg-amber-950/70 text-amber-300 border-amber-700/50'
                        : 'bg-red-950/80 text-red-300 border-red-700'
                    }`}
                  >
                    {budget.label}
                  </span>
                  {budget.level === 'over' && (
                    <button
                      onClick={() => splitSingleSceneInTwo(scene.id)}
                      className="px-2.5 py-0.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Scissors className="w-3 h-3" /> Belah Jadi 2 Klip
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-mutedWarm mr-1">Durasi:</label>
                  <select
                    value={scene.durationSec}
                    onChange={(e) => updateScene(scene.id, { durationSec: Number(e.target.value) })}
                    className="px-2 py-1 rounded-lg bg-obsidian border border-line text-xs font-mono text-amberBright"
                  >
                    {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((sec) => (
                      <option key={sec} value={sec}>
                        {sec} dtk{sec > 8 ? ' (Omni)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => moveScene(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg bg-obsidian border border-line text-mutedWarm hover:text-cream disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveScene(idx, 1)}
                    disabled={idx === project.scenes.length - 1}
                    className="p-1.5 rounded-lg bg-obsidian border border-line text-mutedWarm hover:text-cream disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteScene(scene.id)}
                    className="p-1.5 rounded-lg bg-obsidian border border-line text-mutedWarm hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Dialogue + Live Phonetic Normalization Preview */}
              <div className="space-y-1.5">
                <textarea
                  rows={2}
                  value={scene.dialogue}
                  onChange={(e) => updateScene(scene.id, { dialogue: e.target.value })}
                  placeholder="Kalimat narasi Bahasa Indonesia untuk klip ini..."
                  className="w-full p-2.5 rounded-xl bg-obsidian border border-line text-sm text-cream"
                />
                {scene.dialogue.trim() && audit.fixesApplied.length > 0 && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-700/40 text-[11px] text-emerald-200">
                    🎙️ <strong>Ejaan Suara Otomatis ke Flow:</strong> &ldquo;{audit.phoneticPreview}&rdquo;
                  </div>
                )}
              </div>

              {/* Shot, Speech, Continuity, Action */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] uppercase text-mutedWarm mb-1">
                    Mode Sambungan (&gt;10s Continuity)
                  </label>
                  <select
                    value={scene.sceneNumber === 1 && scene.continuityMode === 'frame_chain' ? 'ingredients' : scene.continuityMode}
                    onChange={(e) =>
                      updateScene(scene.id, { continuityMode: e.target.value as ContinuityMode })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  >
                    <option value="ingredients">🎯 Ingredients Multi-Angle (Karakter/Produk)</option>
                    {scene.sceneNumber > 1 && (
                      <option value="frame_chain">
                        🔗 Frame-Chain (Sambung Frame Akhir Scene {scene.sceneNumber - 1})
                      </option>
                    )}
                    <option value="broll_visual">🎞️ Visual B-Roll (Tanpa Ngomong On-Cam)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-mutedWarm mb-1">Angle / Shot Kamera</label>
                  <select
                    value={scene.shotType}
                    onChange={(e) => updateScene(scene.id, { shotType: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  >
                    {SHOT_TYPES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-mutedWarm mb-1">Mode Suara Dialog</label>
                  <select
                    value={scene.speechMode}
                    onChange={(e) =>
                      updateScene(scene.id, { speechMode: e.target.value as SpeechMode })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  >
                    <option value="lip_sync">🗣️ Lip-Sync Ngomong Langsung ke Kamera</option>
                    <option value="voice_over">🎙️ Voiceover Narasi (Mulut Tidak Ngomong)</option>
                    <option value="silent_broll">🔇 Visual Murni + Suara Ruangan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] uppercase text-mutedWarm mb-1">
                    Arahan Gerakan / Aksi (Inggris/Indo boleh)
                  </label>
                  <input
                    value={scene.actionDirection}
                    onChange={(e) => updateScene(scene.id, { actionDirection: e.target.value })}
                    placeholder="holds the product naturally while speaking..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-mutedWarm mb-1">
                    Mikro-Gestur Tambahan (Opsional)
                  </label>
                  <input
                    value={scene.gesture}
                    onChange={(e) => updateScene(scene.id, { gesture: e.target.value })}
                    placeholder="nods warmly, points casually..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onGoStep3}
          disabled={project.scenes.length === 0}
          className="px-6 py-3 rounded-xl bg-amberGold hover:bg-amberBright disabled:opacity-40 text-obsidian font-bold text-sm shadow-lg"
        >
          Lanjut ke Langkah 3: Eksekusi Google Flow & Gabung Video MP4 →
        </button>
      </div>
    </div>
  );
};
