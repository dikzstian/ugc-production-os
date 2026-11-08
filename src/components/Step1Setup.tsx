import React, { useState } from 'react';
import {
  Camera,
  Copy,
  Film,
  ImagePlus,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { CAMERA_STYLES, LIGHTING_PRESETS, SCENE_LOCATIONS } from '../engine/presets';
import { estimateClipCountForProject, getProjectMaxClipSec } from '../engine/flowCompiler';
import { copyMediaImageToClipboard, uploadSingleFile } from '../lib/clipboardImage';
import {
  AspectRatio,
  CharacterAsset,
  FlowModelMode,
  ProductAsset,
  StudioProject,
} from '../types/studio';

interface Props {
  project: StudioProject;
  characters: CharacterAsset[];
  products: ProductAsset[];
  onChangeProject: (patch: Partial<StudioProject>) => void;
  onCreateCharacter: (c: Partial<CharacterAsset>) => Promise<CharacterAsset | null>;
  onUpdateCharacter: (id: string, c: Partial<CharacterAsset>) => Promise<void>;
  onDeleteCharacter: (id: string) => Promise<void>;
  onCreateProduct: (p: Partial<ProductAsset>) => Promise<ProductAsset | null>;
  onUpdateProduct: (id: string, p: Partial<ProductAsset>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onOpenCharLab: () => void;
  onGoStep2: () => void;
  notify: (msg: string, type?: 'ok' | 'err') => void;
}

const OMNI_DURATION_PRESETS = [
  { sec: 15, label: '15 dtk (1 Klip Utuh!)' },
  { sec: 30, label: '30 dtk (2 Klip)' },
  { sec: 45, label: '45 dtk (3 Klip)' },
  { sec: 60, label: '60 dtk (4 Klip)' },
  { sec: 90, label: '90 dtk (Long 6 Klip)' },
  { sec: 120, label: '2 Menit (Long 8 Klip)' },
  { sec: 180, label: '3 Menit (Long 12 Klip)' },
];

const VEO_DURATION_PRESETS = [
  { sec: 16, label: '16 dtk (2 Klip)' },
  { sec: 24, label: '24 dtk (3 Klip)' },
  { sec: 32, label: '32 dtk (4 Klip)' },
  { sec: 48, label: '48 dtk (6 Klip)' },
  { sec: 64, label: '64 dtk (8 Klip)' },
  { sec: 120, label: '2 Menit (15 Klip)' },
];

export const Step1Setup: React.FC<Props> = ({
  project,
  characters,
  products,
  onChangeProject,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onOpenCharLab,
  onGoStep2,
  notify,
}) => {
  const [addingChar, setAddingChar] = useState(false);
  const [addingProd, setAddingProd] = useState(false);

  const [cName, setCName] = useState('');
  const [cDemo, setCDemo] = useState('young Indonesian adult, mid 20s');
  const [cOutfit, setCOutfit] = useState('casual everyday cotton t-shirt');
  const [cStyle, setCStyle] = useState('santai akrab sehari-hari');

  const [pName, setPName] = useState('');
  const [pCat, setPCat] = useState('Produk Umum');
  const [pSpecs, setPSpecs] = useState('');
  const [pVisual, setPVisual] = useState('');

  const selectedChar = characters.find((c) => c.id === project.characterId);
  const selectedProd = products.find((p) => p.id === project.productId);

  const handleUploadCharPhoto = async (charId: string, file: File) => {
    try {
      const up = await uploadSingleFile(file);
      await onUpdateCharacter(charId, { imageUrl: up.url, filePath: up.filePath });
      notify('Foto referensi Karakter berhasil disimpan!');
    } catch (err: any) {
      notify(err.message, 'err');
    }
  };

  const handleUploadProdPhoto = async (prodId: string, file: File) => {
    try {
      const up = await uploadSingleFile(file);
      await onUpdateProduct(prodId, { imageUrl: up.url, filePath: up.filePath });
      notify('Foto referensi Produk berhasil disimpan!');
    } catch (err: any) {
      notify(err.message, 'err');
    }
  };

  const handleUploadLocationPhoto = async (file: File) => {
    try {
      const up = await uploadSingleFile(file);
      onChangeProject({
        useLocationIngredient: true,
        locationImageUrl: up.url,
        locationImagePath: up.filePath,
      });
      notify('Foto referensi Lokasi berhasil diupload!');
    } catch (err: any) {
      notify(err.message, 'err');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Row: Mode & Format */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Mode & Title */}
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm uppercase tracking-wider text-amberGold font-bold">
              1A. Pilih Jenis Video &amp; Durasi (&gt;10 Detik s/d Menit)
            </span>
          </div>

          <div>
            <label className="block text-xs text-mutedWarm mb-1.5">Judul Project</label>
            <input
              value={project.title}
              onChange={(e) => onChangeProject({ title: e.target.value })}
              placeholder="Contoh: UGC Mesin Las 30 Detik / Cerita Malam Eps 1"
              className="w-full px-3.5 py-2.5 rounded-xl bg-obsidian border border-line text-sm text-cream focus:border-amberGold focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onChangeProject({ contentMode: 'ugc' })}
              className={`p-3.5 rounded-xl border text-left transition ${
                project.contentMode === 'ugc'
                  ? 'bg-amberGold/15 border-amberGold text-cream'
                  : 'bg-obsidian border-line text-mutedWarm hover:border-amberGold/40'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm text-cream">
                <ShoppingBag className="w-4 h-4 text-amberGold" />
                UGC Produk / Jualan
              </div>
              <p className="text-[11px] text-mutedWarm mt-1">
                Hook → Masalah → Demo/Reveal → Bukti → CTA. Multi-angle konsisten.
              </p>
            </button>

            <button
              onClick={() => onChangeProject({ contentMode: 'storytelling' })}
              className={`p-3.5 rounded-xl border text-left transition ${
                project.contentMode === 'storytelling'
                  ? 'bg-amberGold/15 border-amberGold text-cream'
                  : 'bg-obsidian border-line text-mutedWarm hover:border-amberGold/40'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm text-cream">
                <Film className="w-4 h-4 text-amberGold" />
                Storytelling / Cerita
              </div>
              <p className="text-[11px] text-mutedWarm mt-1">
                Alur cerita / mini-drama / vlog bersambung mulus lintas klip & akun.
              </p>
            </button>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-xs text-mutedWarm mb-1.5">Rasio & Orientasi Video</label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: '9:16', label: '9:16 Short/Reels' },
                  { id: '16:9', label: '16:9 Long/YT' },
                  { id: '3:4', label: '3:4 Feed IG' },
                  { id: '1:1', label: '1:1 Square' },
                ] as { id: AspectRatio; label: string }[]
              ).map((r) => (
                <button
                  key={r.id}
                  onClick={() => onChangeProject({ aspectRatio: r.id })}
                  className={`py-2 px-2 rounded-lg border text-xs font-semibold ${
                    project.aspectRatio === r.id
                      ? 'bg-amberGold text-obsidian border-amberGold'
                      : 'bg-obsidian border-line text-mutedWarm hover:text-cream'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Engine Mode: Omni Flash 15s vs Hybrid vs Veo 8s */}
          <div>
            <label className="block text-xs text-mutedWarm mb-1.5">
              Engine Google Flow &amp; Strategi Durasi per Klip
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'omni_flash_15',
                    maxSec: 15,
                    title: '⚡ Omni Flash 15s',
                    desc: 'Maks 15 dtk/klip (~30 kata). Hemat kredit & minim sambungan!',
                  },
                  {
                    id: 'omni_hybrid',
                    maxSec: 15,
                    title: '🔥 Omni Hybrid',
                    desc: 'Hook tajam 6 dtk + Isi utuh 15 dtk. Terbaik buat retensi TikTok!',
                  },
                  {
                    id: 'veo_8',
                    maxSec: 8,
                    title: '🎥 Veo Fast-Cut 8s',
                    desc: 'Maks 8 dtk/klip (~15 kata). Pacing pindah angle cepat.',
                  },
                ] as { id: FlowModelMode; maxSec: number; title: string; desc: string }[]
              ).map((m) => {
                const currentModel = project.flowModel || 'omni_flash_15';
                const active = currentModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() =>
                      onChangeProject({
                        flowModel: m.id,
                        maxClipDurationSec: m.maxSec,
                        targetDurationSec:
                          m.id !== 'veo_8' && project.targetDurationSec === 16
                            ? 15
                            : project.targetDurationSec,
                      })
                    }
                    className={`p-2.5 rounded-xl border text-left transition ${
                      active
                        ? 'bg-amberGold/15 border-amberGold text-cream'
                        : 'bg-obsidian border-line text-mutedWarm hover:text-cream'
                    }`}
                  >
                    <div className="text-xs font-bold text-cream">{m.title}</div>
                    <div className="text-[10.5px] text-mutedWarm mt-0.5 leading-snug">{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration Picker (Presets + Free Input) */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
              <span className="text-mutedWarm">
                Target Durasi Total (Maks{' '}
                <strong className="text-cream">{getProjectMaxClipSec(project)} dtk/klip</strong>)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-mutedWarm">Ketik bebas (dtk):</span>
                <input
                  type="number"
                  min={3}
                  max={600}
                  value={project.targetDurationSec}
                  onChange={(e) =>
                    onChangeProject({
                      targetDurationSec: Math.max(3, Math.min(600, Number(e.target.value) || 15)),
                    })
                  }
                  className="w-20 px-2 py-1 rounded-lg bg-obsidian border border-amberGold/50 font-mono text-xs text-amberBright font-bold text-center"
                />
                <span className="font-mono text-amberBright font-semibold">
                  (~{estimateClipCountForProject(project)} Klip)
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {((project.flowModel || 'omni_flash_15') === 'veo_8'
                ? VEO_DURATION_PRESETS
                : OMNI_DURATION_PRESETS
              ).map((d) => (
                <button
                  key={d.sec}
                  onClick={() => onChangeProject({ targetDurationSec: d.sec })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border transition ${
                    project.targetDurationSec === d.sec
                      ? 'bg-amberGold text-obsidian font-bold border-amberGold'
                      : 'bg-obsidian text-mutedWarm border-line hover:text-cream'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Location, Camera & Lighting */}
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <span className="font-display text-sm uppercase tracking-wider text-amberGold font-bold flex items-center gap-2">
            <Camera className="w-4 h-4" />
            1B. Lokasi, Pencahayaan & Gaya Kamera HP
          </span>

          <div>
            <label className="block text-xs text-mutedWarm mb-1">Preset Lokasi & Ambience</label>
            <select
              value={project.scenePresetId}
              onChange={(e) => onChangeProject({ scenePresetId: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-obsidian border border-line text-sm text-cream"
            >
              {SCENE_LOCATIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-mutedWarm mb-1">
              Override Lokasi Kustom (Opsional — kosongkan jika ikut preset)
            </label>
            <input
              value={project.customLocation}
              onChange={(e) => onChangeProject({ customLocation: e.target.value })}
              placeholder="Misal: halaman teras rumah sore hari dengan motor terparkir..."
              className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-mutedWarm mb-1">Gaya Kamera Utama</label>
              <select
                value={project.cameraPresetId}
                onChange={(e) => onChangeProject({ cameraPresetId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
              >
                {CAMERA_STYLES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-mutedWarm mb-1">Mood Pencahayaan</label>
              <select
                value={project.lightingPresetId}
                onChange={(e) => onChangeProject({ lightingPresetId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-obsidian border border-line text-xs text-cream"
              >
                {LIGHTING_PRESETS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Location Reference Image */}
          <div className="p-3 rounded-xl bg-obsidian border border-line flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {project.locationImageUrl ? (
                <img
                  src={project.locationImageUrl}
                  alt="Lokasi"
                  className="w-12 h-12 rounded-lg object-cover border border-amberGold/50"
                />
              ) : null}
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-cream cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.useLocationIngredient}
                    onChange={(e) => onChangeProject({ useLocationIngredient: e.target.checked })}
                    className="accent-amberGold"
                  />
                  Kunci Ruangan Pakai Foto Ingredient Lokasi
                </label>
                <p className="text-[11px] text-mutedWarm">
                  Aktifkan jika lu punya 1 foto ruangan tetap biar background 100% identik.
                </p>
              </div>
            </div>
            <label className="px-3 py-1.5 rounded-lg bg-panelSoft hover:bg-panel border border-line text-xs font-semibold cursor-pointer whitespace-nowrap">
              Upload Foto Ruang
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadLocationPhoto(f);
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Bottom Row: Character Lock & Product Lock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Character Vault */}
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-sm uppercase tracking-wider text-amberGold font-bold flex items-center gap-2">
              <User className="w-4 h-4" />
              1C. Kunci Identitas Karakter (Talent)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenCharLab}
                className="px-2.5 py-1 rounded-lg bg-obsidian border border-amberGold/40 text-amberBright text-[11px] font-semibold flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Buat Wajah Baru (Lab)
              </button>
              <button
                onClick={() => setAddingChar(!addingChar)}
                className="px-2.5 py-1 rounded-lg bg-amberGold text-obsidian text-[11px] font-bold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Talent Baru
              </button>
            </div>
          </div>

          {addingChar && (
            <div className="p-3.5 rounded-xl bg-obsidian border border-amberGold/50 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Nama Talent (mis. Dimas)"
                  className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                />
                <input
                  value={cDemo}
                  onChange={(e) => setCDemo(e.target.value)}
                  placeholder="young Indonesian man, late 20s"
                  className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                />
                <input
                  value={cOutfit}
                  onChange={(e) => setCOutfit(e.target.value)}
                  placeholder="Outfit default (kaos hitam polos)"
                  className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                />
                <input
                  value={cStyle}
                  onChange={(e) => setCStyle(e.target.value)}
                  placeholder="Gaya bicara (santai lugas)"
                  className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAddingChar(false)}
                  className="px-2.5 py-1 rounded text-xs text-mutedWarm"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    if (!cName.trim()) return;
                    const created = await onCreateCharacter({
                      name: cName.trim(),
                      demographic: cDemo,
                      defaultOutfit: cOutfit,
                      speakingStyle: cStyle,
                    });
                    if (created) onChangeProject({ characterId: created.id });
                    setCName('');
                    setAddingChar(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-amberGold text-obsidian text-xs font-bold"
                >
                  Simpan Talent
                </button>
              </div>
            </div>
          )}

          <select
            value={project.characterId || ''}
            onChange={(e) => onChangeProject({ characterId: e.target.value || undefined })}
            className="w-full px-3 py-2.5 rounded-xl bg-obsidian border border-line text-sm text-cream"
          >
            <option value="">— Tanpa Karakter Spesifik —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.imageUrl ? '✓ (Ada Foto Master)' : '(Belum Upload Foto)'}
              </option>
            ))}
          </select>

          {selectedChar && (
            <div className="p-3.5 rounded-xl bg-obsidian border border-line space-y-3">
              <div className="flex items-start gap-3.5">
                <div className="w-20 h-24 rounded-xl bg-panel border border-line overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {selectedChar.imageUrl ? (
                    <img
                      src={selectedChar.imageUrl}
                      alt={selectedChar.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-mutedWarm/50" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-1.5 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold cursor-pointer flex items-center gap-1.5">
                      <ImagePlus className="w-3.5 h-3.5" />
                      {selectedChar.imageUrl ? 'Ganti Foto Master' : 'Upload Foto Master'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadCharPhoto(selectedChar.id, f);
                        }}
                      />
                    </label>
                    {selectedChar.imageUrl && (
                      <button
                        onClick={async () => {
                          try {
                            await copyMediaImageToClipboard(selectedChar.imageUrl!);
                            notify('Foto Karakter disalin! Tinggal Ctrl+V di Google Flow.');
                          } catch (err: any) {
                            notify(err.message, 'err');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-amberBright hover:bg-panelSoft flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Foto (Ctrl+V)
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteCharacter(selectedChar.id)}
                      className="p-1.5 rounded-lg bg-panel border border-line text-mutedWarm hover:text-red-400 ml-auto"
                      title="Hapus karakter"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={selectedChar.demographic}
                      onChange={(e) =>
                        onUpdateCharacter(selectedChar.id, { demographic: e.target.value })
                      }
                      placeholder="Demografi (cth: young Indonesian man, 26yo)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                    />
                    <input
                      value={selectedChar.speakingStyle}
                      onChange={(e) =>
                        onUpdateCharacter(selectedChar.id, { speakingStyle: e.target.value })
                      }
                      placeholder="Gaya bicara (cth: santai akrab sehari-hari)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                    />
                  </div>
                  {!selectedChar.imageUrl && (
                    <input
                      value={selectedChar.appearance}
                      onChange={(e) =>
                        onUpdateCharacter(selectedChar.id, { appearance: e.target.value })
                      }
                      placeholder="Ciri fisik wajah/rambut (dipakai saat belum ada Foto Master)..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                    />
                  )}
                  <input
                    value={selectedChar.defaultOutfit}
                    onChange={(e) =>
                      onUpdateCharacter(selectedChar.id, { defaultOutfit: e.target.value })
                    }
                    placeholder="Deskripsi baju default agar konsisten antar scene..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                  />
                  <label className="flex items-center gap-2 text-xs text-mutedWarm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project.useOutfitIngredient}
                      onChange={(e) => onChangeProject({ useOutfitIngredient: e.target.checked })}
                      className="accent-amberGold"
                    />
                    Kunci pakaian sama persis dengan foto karakter
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Product / Object Vault */}
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm uppercase tracking-wider text-amberGold font-bold flex items-center gap-2">
              <Package className="w-4 h-4" />
              1D. Kunci Produk / Objek ({project.contentMode === 'ugc' ? 'Wajib UGC' : 'Opsional Prop Cerita'})
            </span>
            <button
              onClick={() => setAddingProd(!addingProd)}
              className="px-2.5 py-1 rounded-lg bg-amberGold text-obsidian text-[11px] font-bold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Produk Baru
            </button>
          </div>

          {addingProd && (
            <div className="p-3.5 rounded-xl bg-obsidian border border-amberGold/50 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Nama Produk (mis. Mesin Las RYU)"
                  className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                />
                <input
                  value={pCat}
                  onChange={(e) => setPCat(e.target.value)}
                  placeholder="Kategori (Tools / Fashion / dll)"
                  className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                />
              </div>
              <input
                value={pVisual}
                onChange={(e) => setPVisual(e.target.value)}
                placeholder="Ciri fisik produk (warna hijau-hitam, bodi kotak ringkas, kabel las)..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
              />
              <textarea
                value={pSpecs}
                onChange={(e) => setPSpecs(e.target.value)}
                rows={2}
                placeholder="Fakta & spek valid produk (agar naskah anti-halusinasi)..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAddingProd(false)}
                  className="px-2.5 py-1 rounded text-xs text-mutedWarm"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    if (!pName.trim()) return;
                    const created = await onCreateProduct({
                      name: pName.trim(),
                      category: pCat,
                      verifiedSpecs: pSpecs,
                      visualDetails: pVisual,
                    });
                    if (created) onChangeProject({ productId: created.id });
                    setPName('');
                    setPSpecs('');
                    setPVisual('');
                    setAddingProd(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-amberGold text-obsidian text-xs font-bold"
                >
                  Simpan Produk
                </button>
              </div>
            </div>
          )}

          <select
            value={project.productId || ''}
            onChange={(e) => onChangeProject({ productId: e.target.value || undefined })}
            className="w-full px-3 py-2.5 rounded-xl bg-obsidian border border-line text-sm text-cream"
          >
            <option value="">— Tanpa Produk (Murni Cerita / Monolog) —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.imageUrl ? '✓ (Ada Foto Produk)' : '(Belum Upload Foto)'}
              </option>
            ))}
          </select>

          {selectedProd && (
            <div className="p-3.5 rounded-xl bg-obsidian border border-line space-y-2.5">
              <div className="flex items-start gap-3.5">
                <div className="w-20 h-20 rounded-xl bg-panel border border-line overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {selectedProd.imageUrl ? (
                    <img
                      src={selectedProd.imageUrl}
                      alt={selectedProd.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-7 h-7 text-mutedWarm/50" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-1.5 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold cursor-pointer flex items-center gap-1.5">
                      <ImagePlus className="w-3.5 h-3.5" />
                      {selectedProd.imageUrl ? 'Ganti Foto Produk' : 'Upload Foto Produk'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadProdPhoto(selectedProd.id, f);
                        }}
                      />
                    </label>
                    {selectedProd.imageUrl && (
                      <button
                        onClick={async () => {
                          try {
                            await copyMediaImageToClipboard(selectedProd.imageUrl!);
                            notify('Foto Produk disalin! Tinggal Ctrl+V di Google Flow.');
                          } catch (err: any) {
                            notify(err.message, 'err');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-amberBright hover:bg-panelSoft flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Foto (Ctrl+V)
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteProduct(selectedProd.id)}
                      className="p-1.5 rounded-lg bg-panel border border-line text-mutedWarm hover:text-red-400 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={selectedProd.visualDetails}
                    onChange={(e) =>
                      onUpdateProduct(selectedProd.id, { visualDetails: e.target.value })
                    }
                    placeholder="Detail visual wajib konsisten (warna, ukuran, bentuk)..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-mutedWarm mb-1">
                  Spek Valid (Dipakai oleh Generator Naskah Anti-Halu)
                </label>
                <textarea
                  rows={2}
                  value={selectedProd.verifiedSpecs}
                  onChange={(e) =>
                    onUpdateProduct(selectedProd.id, { verifiedSpecs: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onGoStep2}
          className="px-6 py-3 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian font-bold text-sm shadow-lg"
        >
          Lanjut ke Langkah 2: Susun Naskah & Pecah Scene (&gt;10 Detik) →
        </button>
      </div>
    </div>
  );
};
