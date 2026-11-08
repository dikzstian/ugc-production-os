import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  Clapperboard,
  Copy,
  Grid,
  Image as ImageIcon,
  LayoutGrid,
  Lock,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import {
  compileRawStudioPrompt,
  DEFAULT_RAW_SCENES,
  INITIAL_RAW_FORM,
  loadSavedCustomScenes,
  RAW_CAMERAS,
  RAW_LIGHTINGS,
  RAW_RATIOS,
  RAW_SKIN_TONES,
  RAW_TIPS,
  RawScenePreset,
  RawStudioFormState,
  RawStudioMode,
  saveCustomScenesToStorage,
} from '../engine/rawStudioEngine';
import { copyTextToClipboard } from '../lib/clipboardImage';
import { CharacterAsset } from '../types/studio';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaveCharacterToStudio?: (c: Partial<CharacterAsset>) => Promise<CharacterAsset | null>;
  notify: (msg: string, type?: 'ok' | 'err') => void;
}

const MODES: {
  id: RawStudioMode;
  label: string;
  desc: string;
  Icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'scene', label: 'Foto Scene', desc: 'Konten harian: selfie, mirror, street, cafe', Icon: Camera },
  { id: 'casting', label: 'Casting Baru', desc: 'Lahirkan wajah karakter baru dari nol', Icon: User },
  { id: 'repair', label: 'Realism Repair', desc: 'Perbaiki foto yang masih keliatan AI', Icon: Wrench },
  { id: 'sheet', label: 'Char Sheet 18', desc: 'Kunci identitas: 18 sudut wajah & macro', Icon: Grid },
  { id: 'collage', label: 'Collage 5 Panel', desc: 'Grid editorial multi-ekspresi 9:16', Icon: LayoutGrid },
  { id: 'video', label: 'Video Veo/Flow', desc: 'Prompt video selfie-vlog realistis cepat', Icon: Clapperboard },
];

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="mb-3.5">
    <div className="flex items-baseline justify-between mb-1 gap-2">
      <label className="font-display text-[11px] uppercase tracking-wider text-amberBright font-bold">
        {label}
      </label>
      {hint && <span className="text-[11px] text-mutedWarm">{hint}</span>}
    </div>
    {children}
  </div>
);

const CheckRow: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 py-1 cursor-pointer text-xs text-cream select-none">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-amberGold w-3.5 h-3.5"
    />
    <span>{label}</span>
  </label>
);

const ScenePicker: React.FC<{
  scenes: RawScenePreset[];
  value: string;
  onChange: (val: string) => void;
  onAdd: (sc: RawScenePreset) => void;
  onDeleteCustom: (id: string) => void;
}> = ({ scenes, value, onChange, onAdd, onDeleteCustom }) => {
  const [openAdd, setOpenAdd] = useState(false);
  const [name, setName] = useState('');
  const [loc, setLoc] = useState('');
  const [time, setTime] = useState('');
  const [lightId, setLightId] = useState(RAW_LIGHTINGS[0].id);
  const [lightManual, setLightManual] = useState('');
  const [audio, setAudio] = useState('');
  const [err, setErr] = useState('');

  const selectedScene = scenes.find((s) => s.id === value);

  const handleSave = () => {
    if (!name.trim() || !loc.trim()) {
      setErr('Nama dan deskripsi lokasi wajib diisi.');
      return;
    }
    const lighting =
      lightManual.trim() ||
      (RAW_LIGHTINGS.find((l) => l.id === lightId) || RAW_LIGHTINGS[0]).desc;
    const sc: RawScenePreset = {
      id: 'custom_' + Date.now(),
      label: name.trim() + ' •custom',
      location: loc.trim(),
      time: time.trim() || 'daytime',
      lighting,
      audio: audio.trim() || 'natural ambient sound of the location',
      custom: true,
    };
    onAdd(sc);
    setName('');
    setLoc('');
    setTime('');
    setLightManual('');
    setAudio('');
    setErr('');
    setOpenAdd(false);
  };

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream focus:border-amberGold focus:outline-none"
        >
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {selectedScene?.custom && (
          <button
            type="button"
            onClick={() => onDeleteCustom(selectedScene.id)}
            className="px-2.5 rounded-lg bg-obsidian border border-line text-mutedWarm hover:text-red-400"
            title="Hapus lokasi custom ini"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpenAdd(!openAdd)}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 border whitespace-nowrap ${
            openAdd
              ? 'bg-amberGold text-obsidian border-amberGold'
              : 'bg-panelSoft text-amberBright border-line hover:border-amberGold/50'
          }`}
        >
          {openAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {openAdd ? 'Batal' : 'Lokasi baru'}
        </button>
      </div>

      {openAdd && (
        <div className="mt-2.5 p-3.5 rounded-xl bg-panelSoft border border-amberGold/40 space-y-2.5">
          <Field label="Nama lokasi" hint="untuk list (tersimpan permanen)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="cth: Pasar tradisional pagi"
              className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
            />
          </Field>
          <Field label="Deskripsi lokasi" hint="bahasa Inggris = hasil terbaik">
            <input
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              placeholder="cth: busy traditional morning market, vegetable stalls, plastic tarps overhead"
              className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
            />
          </Field>
          <Field label="Waktu">
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="cth: early morning / night"
              className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
            />
          </Field>
          <Field label="Lighting" hint="pilih yang masuk akal utk lokasi ini">
            <select
              value={lightId}
              onChange={(e) => setLightId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
            >
              {RAW_LIGHTINGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Atau tulis lighting manual" hint="kosongkan = pakai pilihan di atas">
            <input
              value={lightManual}
              onChange={(e) => setLightManual(e.target.value)}
              placeholder="cth: morning sun filtering through tarps, dappled light"
              className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
            />
          </Field>
          <Field label="Ambient audio (utk video)">
            <input
              value={audio}
              onChange={(e) => setAudio(e.target.value)}
              placeholder="cth: vendors shouting, plastic bags rustling"
              className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
            />
          </Field>
          {err && <div className="text-xs text-red-400 font-semibold">{err}</div>}
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-2 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold"
          >
            Simpan ke list permanen &amp; pakai
          </button>
        </div>
      )}
    </div>
  );
};

export const CharacterLabModal: React.FC<Props> = ({
  open,
  onClose,
  onSaveCharacterToStudio,
  notify,
}) => {
  const [mode, setMode] = useState<RawStudioMode>('casting');
  const [compact, setCompact] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customScenes, setCustomScenes] = useState<RawScenePreset[]>([]);
  const [f, setF] = useState<RawStudioFormState>(INITIAL_RAW_FORM);
  const [saveCharName, setSaveCharName] = useState('');

  useEffect(() => {
    setCustomScenes(loadSavedCustomScenes());
  }, []);

  if (!open) return null;

  const allScenes = [...DEFAULT_RAW_SCENES, ...customScenes];

  const updateField = <K extends keyof RawStudioFormState>(
    key: K,
    val: RawStudioFormState[K]
  ) => {
    setF((prev) => ({ ...prev, [key]: val }));
  };

  const handleAddCustomScene = (sc: RawScenePreset) => {
    const updated = [...customScenes, sc];
    setCustomScenes(updated);
    saveCustomScenesToStorage(updated);
    updateField('scene', sc.id);
    notify(`Lokasi custom "${sc.label}" tersimpan permanen!`);
  };

  const handleDeleteCustomScene = (id: string) => {
    const updated = customScenes.filter((s) => s.id !== id);
    setCustomScenes(updated);
    saveCustomScenesToStorage(updated);
    updateField('scene', DEFAULT_RAW_SCENES[0].id);
    notify('Lokasi custom dihapus.');
  };

  const prompt = compileRawStudioPrompt(mode, f, allScenes, compact);

  const needsRef =
    mode === 'scene' ||
    mode === 'repair' ||
    mode === 'sheet' ||
    mode === 'collage' ||
    (mode === 'video' && f.videoSource !== 'manual');

  const showCompact = mode !== 'repair' && mode !== 'video';

  const handleCopy = async () => {
    await copyTextToClipboard(prompt);
    setCopied(true);
    notify(`Prompt ${MODES.find((m) => m.id === mode)?.label} berhasil disalin!`);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveCastingAsTalent = async () => {
    if (!onSaveCharacterToStudio) return;
    const name = saveCharName.trim() || 'Talent Casting Baru';
    const appearanceParts = [
      f.face.trim(),
      f.eyes.trim(),
      f.hair.trim(),
      f.skinTone.trim() ? `${f.skinTone.trim()} skin` : '',
      f.distinct.trim(),
    ].filter(Boolean);

    const created = await onSaveCharacterToStudio({
      name,
      demographic: f.demographic.trim() || 'young Indonesian adult, early 20s',
      appearance:
        appearanceParts.join(', ') ||
        'soft oval face, warm dark brown eyes, natural dark hair, subtle beauty mark',
      defaultOutfit: f.wardrobe.trim() || 'casual everyday outfit',
      speakingStyle: f.vibe.trim() || 'santai natural sehari-hari',
    });
    if (created) {
      setSaveCharName('');
      notify(`Talent "${created.name}" masuk ke daftar Karakter Studio! Tinggal upload fotonya nanti.`);
    }
  };

  const isCustomSkinTone = !RAW_SKIN_TONES.some((s) => s.value === f.skinTone);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5">
      <div className="w-full max-w-6xl bg-panel border border-line rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line bg-obsidian flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amberGold text-obsidian flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold uppercase text-cream flex items-center gap-2">
                Character &amp; Realism Lab
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amberGold/15 text-amberGold border border-amberGold/40">
                  RAW Studio v3 Full Engine
                </span>
              </h2>
              <p className="text-xs text-mutedWarm">
                100% sesuai menu RAW Studio v3 — mesin realisme terkunci, variabel tinggal isi, output prompt presisi real-time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setF(INITIAL_RAW_FORM);
                notify('Semua kolom input dikosongkan ke setelan awal.');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-panelSoft hover:bg-panel border border-line text-xs text-mutedWarm hover:text-cream flex items-center gap-1"
              title="Reset form ke awal"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Isian
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-panelSoft border border-line text-mutedWarm hover:text-cream"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-Column Body matching RAW Studio v3 */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
          {/* LEFT: 6 Mode Tabs + Exact Form Inputs */}
          <div className="p-5 overflow-y-auto space-y-4">
            {/* 6 Mode Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MODES.map((m) => {
                const active = mode === m.id;
                const Icon = m.Icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`rounded-xl p-3 text-left border transition ${
                      active
                        ? 'bg-amberGold text-obsidian border-amberGold shadow'
                        : 'bg-obsidian text-cream border-line hover:border-amberGold/40'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <div className="font-display text-xs font-bold">{m.label}</div>
                    <div
                      className={`text-[10.5px] mt-0.5 leading-tight ${
                        active ? 'text-obsidian/80 font-medium' : 'text-mutedWarm'
                      }`}
                    >
                      {m.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Reference Image Reminder */}
            {needsRef && (
              <div className="rounded-xl px-3.5 py-2.5 text-xs flex items-start gap-2 bg-amberGold/10 border border-amberGold/35 text-amberBright">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-amberGold" />
                <span>
                  {mode === 'video'
                    ? f.videoSource === 'ingredients'
                      ? 'Upload SEMUA foto ingredient yang dicentang ke Flow bareng prompt ini — urutannya bebas, prompt udah mengikat masing-masing perannya.'
                      : 'Upload foto master sebagai first frame / ingredient di Flow bareng prompt ini.'
                    : 'Mode ini butuh foto master reference: upload fotonya BARENG prompt hasil generate.'}
                </span>
              </div>
            )}

            {/* 1. MODE: FOTO SCENE */}
            {mode === 'scene' && (
              <div>
                <Field label="Lokasi + lighting" hint="pilih dari list atau bikin baru">
                  <ScenePicker
                    scenes={allScenes}
                    value={f.scene}
                    onChange={(v) => updateField('scene', v)}
                    onAdd={handleAddCustomScene}
                    onDeleteCustom={handleDeleteCustomScene}
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Gaya kamera">
                    <select
                      value={f.camera}
                      onChange={(e) => updateField('camera', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    >
                      {RAW_CAMERAS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Rasio">
                    <select
                      value={f.ratio}
                      onChange={(e) => updateField('ratio', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    >
                      {RAW_RATIOS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Ekspresi" hint="kosong = candid natural">
                  <input
                    value={f.expression}
                    onChange={(e) => updateField('expression', e.target.value)}
                    placeholder="cth: pouty lips, cute confident, looking at phone screen"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Pose / aksi">
                  <input
                    value={f.pose}
                    onChange={(e) => updateField('pose', e.target.value)}
                    placeholder="cth: standing facing mirror, peace sign"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Outfit">
                  <input
                    value={f.wardrobe}
                    onChange={(e) => updateField('wardrobe', e.target.value)}
                    placeholder="cth: fitted grey turtleneck crop top, denim shorts"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Styling rambut" hint="warna tetap ikut referensi">
                  <input
                    value={f.hair}
                    onChange={(e) => updateField('hair', e.target.value)}
                    placeholder="cth: long straight with soft bangs / high ponytail"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Catatan ekstra (opsional)">
                  <input
                    value={f.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="cth: holding iced coffee cup"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
              </div>
            )}

            {/* 2. MODE: CASTING BARU */}
            {mode === 'casting' && (
              <div>
                <Field label="Demografi">
                  <input
                    value={f.demographic}
                    onChange={(e) => updateField('demographic', e.target.value)}
                    placeholder="cth: young Indonesian woman, 23 years old"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Bentuk & karakter wajah">
                  <input
                    value={f.face}
                    onChange={(e) => updateField('face', e.target.value)}
                    placeholder="cth: soft oval face, slightly rounded cheeks"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Mata">
                  <input
                    value={f.eyes}
                    onChange={(e) => updateField('eyes', e.target.value)}
                    placeholder="cth: warm dark brown almond eyes"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Rambut">
                  <input
                    value={f.hair}
                    onChange={(e) => updateField('hair', e.target.value)}
                    placeholder="cth: long layered dark brown, natural waves"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Tone kulit">
                  <div className="space-y-2">
                    <select
                      value={isCustomSkinTone ? '__custom__' : f.skinTone}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          updateField('skinTone', '');
                        } else {
                          updateField('skinTone', e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    >
                      {RAW_SKIN_TONES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                      <option value="__custom__">Ketik tone kulit custom...</option>
                    </select>
                    {isCustomSkinTone && (
                      <input
                        value={f.skinTone}
                        onChange={(e) => updateField('skinTone', e.target.value)}
                        placeholder="cth: olive warm / kuning langsat"
                        className="w-full px-3 py-2 rounded-lg bg-obsidian border border-amberGold/50 text-xs text-cream"
                      />
                    )}
                  </div>
                </Field>
                <Field label="Distinctive feature" hint="WAJIB — kunci karakter solid">
                  <input
                    value={f.distinct}
                    onChange={(e) => updateField('distinct', e.target.value)}
                    placeholder="cth: small beauty mark under left eye"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Vibe">
                  <input
                    value={f.vibe}
                    onChange={(e) => updateField('vibe', e.target.value)}
                    placeholder="cth: approachable girl-next-door, anak kuliahan Jakarta"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>

                {/* Bonus Integration: Save Casting directly to Studio Talent Vault */}
                {onSaveCharacterToStudio && (
                  <div className="mt-4 p-3 rounded-xl bg-obsidian border border-line space-y-2">
                    <div className="text-[11px] text-amberBright font-semibold flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-amberGold" />
                      Opsional: Simpan Desain Karakter Ini ke Daftar Talent Project
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={saveCharName}
                        onChange={(e) => setSaveCharName(e.target.value)}
                        placeholder="Nama panggilan talent (cth: Siska / Raka)..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-panel border border-line text-xs text-cream"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCastingAsTalent}
                        className="px-3 py-1.5 rounded-lg bg-panelSoft hover:bg-amberGold hover:text-obsidian border border-amberGold/40 text-amberBright text-xs font-bold whitespace-nowrap transition"
                      >
                        + Simpan ke Talent
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. MODE: REALISM REPAIR */}
            {mode === 'repair' && (
              <div>
                <Field label="Bagian yang mau diperbaiki" hint="makin sedikit = identitas makin aman">
                  <div className="rounded-xl px-3.5 py-2.5 bg-obsidian border border-line space-y-1">
                    <CheckRow
                      checked={f.fixSkin}
                      onChange={(v) => updateField('fixSkin', v)}
                      label="Kulit — porcelain, tanpa tekstur"
                    />
                    <CheckRow
                      checked={f.fixHair}
                      onChange={(v) => updateField('fixHair', v)}
                      label="Rambut — terlalu sempurna / gloss seragam"
                    />
                    <CheckRow
                      checked={f.fixEyes}
                      onChange={(v) => updateField('fixEyes', v)}
                      label="Mata — kilau simetris tidak natural"
                    />
                    <CheckRow
                      checked={f.fixTeeth}
                      onChange={(v) => updateField('fixTeeth', v)}
                      label="Gigi — terlalu rata & putih seragam"
                    />
                  </div>
                </Field>
                <Field label="Sekalian pindah scene?">
                  <div className="rounded-xl px-3.5 py-2.5 bg-obsidian border border-line">
                    <CheckRow
                      checked={f.changeScene}
                      onChange={(v) => updateField('changeScene', v)}
                      label="Ya, ganti lokasi + lighting"
                    />
                  </div>
                </Field>
                {f.changeScene && (
                  <Field label="Scene baru" hint="pilih dari list atau bikin baru">
                    <ScenePicker
                      scenes={allScenes}
                      value={f.scene}
                      onChange={(v) => updateField('scene', v)}
                      onAdd={handleAddCustomScene}
                      onDeleteCustom={handleDeleteCustomScene}
                    />
                  </Field>
                )}
              </div>
            )}

            {/* 4. MODE: CHAR SHEET 18 */}
            {mode === 'sheet' && (
              <div>
                <Field label="Wardrobe di sheet" hint="polos = fokus penuh ke wajah">
                  <input
                    value={f.wardrobe}
                    onChange={(e) => updateField('wardrobe', e.target.value)}
                    placeholder="default: plain light top, clean neckline"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <div className="rounded-xl p-3.5 text-xs leading-relaxed bg-obsidian border border-line text-mutedWarm">
                  <strong className="text-cream">18 panel anatomi &amp; sudut kamera sudah dikunci presisi:</strong>{' '}
                  7 sudut wajah (frontal eye-level, high, low jawline, 3/4 kiri, 90° profil kiri, 3/4 kanan, 90° profil kanan),{' '}
                  6 panel macro (mata kiri, mata kanan + alis, batang hidung, bibir, rahang kiri, rahang kanan),{' '}
                  top-down dahi, bottom-up dagu, over-the-shoulder, macro pori pipi, dan dutch angle close-up. Ini aset internal kunci wajah, bukan konten posting.
                </div>
              </div>
            )}

            {/* 5. MODE: COLLAGE 5 PANEL */}
            {mode === 'collage' && (
              <div>
                <Field label="Lokasi + lighting" hint="pilih dari list atau bikin baru">
                  <ScenePicker
                    scenes={allScenes}
                    value={f.scene}
                    onChange={(v) => updateField('scene', v)}
                    onAdd={handleAddCustomScene}
                    onDeleteCustom={handleDeleteCustomScene}
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Outfit">
                    <input
                      value={f.wardrobe}
                      onChange={(e) => updateField('wardrobe', e.target.value)}
                      placeholder="cth: navy pleated chiffon dress, gold earrings"
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    />
                  </Field>
                  <Field label="Styling rambut">
                    <input
                      value={f.hair}
                      onChange={(e) => updateField('hair', e.target.value)}
                      placeholder="cth: high ponytail with braided crown"
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    />
                  </Field>
                </div>
                <Field label="Panel 1 — hero">
                  <input
                    value={f.exp1}
                    onChange={(e) => updateField('exp1', e.target.value)}
                    placeholder="soft confident smile"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Panel 2">
                    <input
                      value={f.exp2}
                      onChange={(e) => updateField('exp2', e.target.value)}
                      placeholder="candid side glance"
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    />
                  </Field>
                  <Field label="Panel 3">
                    <input
                      value={f.exp3}
                      onChange={(e) => updateField('exp3', e.target.value)}
                      placeholder="shy smile"
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    />
                  </Field>
                  <Field label="Panel 4">
                    <input
                      value={f.exp4}
                      onChange={(e) => updateField('exp4', e.target.value)}
                      placeholder="joyful laugh"
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    />
                  </Field>
                  <Field label="Panel 5">
                    <input
                      value={f.exp5}
                      onChange={(e) => updateField('exp5', e.target.value)}
                      placeholder="over-the-shoulder look"
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* 6. MODE: VIDEO VEO/FLOW */}
            {mode === 'video' && (
              <div>
                <Field label="Sumber karakter">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: 'ref',
                          Icon: ImageIcon,
                          title: 'First frame',
                          desc: '1 foto master jadi frame awal',
                        },
                        {
                          id: 'ingredients',
                          Icon: LayoutGrid,
                          title: 'Ingredients',
                          desc: 'Multi-foto: karakter, outfit, objek, lokasi',
                        },
                        {
                          id: 'manual',
                          Icon: User,
                          title: 'Manual',
                          desc: 'Teks saja — wajah bisa beda tiap generate',
                        },
                      ] as const
                    ).map((s) => {
                      const active = f.videoSource === s.id;
                      const Icon = s.Icon;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => updateField('videoSource', s.id)}
                          className={`rounded-xl p-3 text-left border transition ${
                            active
                              ? 'bg-amberGold text-obsidian border-amberGold'
                              : 'bg-obsidian text-cream border-line hover:border-amberGold/40'
                          }`}
                        >
                          <Icon className="w-4 h-4 mb-1" />
                          <div className="font-display text-xs font-bold">{s.title}</div>
                          <div
                            className={`text-[10.5px] mt-0.5 leading-tight ${
                              active ? 'text-obsidian/80' : 'text-mutedWarm'
                            }`}
                          >
                            {s.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                {f.videoSource === 'manual' && (
                  <Field label="Deskripsi karakter">
                    <input
                      value={f.character}
                      onChange={(e) => updateField('character', e.target.value)}
                      placeholder="cth: a young woman, mid 20s, long brown hair, oversized shirt"
                      className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                    />
                  </Field>
                )}

                {f.videoSource === 'ingredients' && (
                  <Field
                    label="Ingredient yang lu upload di Flow"
                    hint="centang sesuai foto yang dipakai"
                  >
                    <div className="rounded-xl px-3.5 py-2.5 bg-obsidian border border-line space-y-1">
                      <CheckRow
                        checked={f.ingCharacter}
                        onChange={(v) => updateField('ingCharacter', v)}
                        label="Karakter (foto master)"
                      />
                      <CheckRow
                        checked={f.ingOutfit}
                        onChange={(v) => updateField('ingOutfit', v)}
                        label="Outfit (foto pakaian)"
                      />
                      <CheckRow
                        checked={f.ingObject}
                        onChange={(v) => updateField('ingObject', v)}
                        label="Objek / produk (foto barang)"
                      />
                      <CheckRow
                        checked={f.ingLocation}
                        onChange={(v) => updateField('ingLocation', v)}
                        label="Lokasi (foto tempat)"
                      />
                    </div>
                    {f.ingObject && (
                      <div className="mt-2">
                        <input
                          value={f.objectName}
                          onChange={(e) => updateField('objectName', e.target.value)}
                          placeholder="nama objeknya — cth: iced coffee cup / skincare bottle"
                          className="w-full px-3 py-2 rounded-lg bg-obsidian border border-amberGold/40 text-xs text-cream"
                        />
                      </div>
                    )}
                    <p className="mt-2 text-[11px] leading-relaxed text-mutedWarm">
                      Jangan deskripsikan ulang isi foto di kolom lain — teks yang beda dikit dari fotonya bikin hasil drift. Gambar = identitas, teks = aksi.
                    </p>
                  </Field>
                )}

                {!(f.videoSource === 'ingredients' && f.ingLocation) && (
                  <Field label="Lokasi + lighting + audio" hint="pilih dari list atau bikin baru">
                    <ScenePicker
                      scenes={allScenes}
                      value={f.scene}
                      onChange={(v) => updateField('scene', v)}
                      onAdd={handleAddCustomScene}
                      onDeleteCustom={handleDeleteCustomScene}
                    />
                  </Field>
                )}

                <Field label="Aksi utama" hint="SATU aksi per clip">
                  <input
                    value={f.action}
                    onChange={(e) => updateField('action', e.target.value)}
                    placeholder="cth: walks slowly through / sits at a table in"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Gestur kecil">
                  <input
                    value={f.gesture}
                    onChange={(e) => updateField('gesture', e.target.value)}
                    placeholder="cth: tucking hair behind her ear / sipping a drink"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Dialog (opsional)" hint="mid-sentence = candid">
                  <input
                    value={f.dialog}
                    onChange={(e) => updateField('dialog', e.target.value)}
                    placeholder="cth: ...jadi tadi tuh ya, dia tiba-tiba nyamperin gw"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
                <Field label="Override audio (opsional)">
                  <input
                    value={f.audio}
                    onChange={(e) => updateField('audio', e.target.value)}
                    placeholder="kosong = ikut preset scene"
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-line text-xs text-cream"
                  />
                </Field>
              </div>
            )}

            {/* Realism Lock Indicator */}
            <div className="rounded-xl p-3 bg-obsidian border border-line flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-mutedWarm">
                <span className="text-emerald-400 font-bold">Realism engine terkunci</span> — tekstur kulit + pori,
                asimetri natural, helai rambut lepas, grain, framing miring, highlight blown, background lived-in, dan
                negative prompt anti-plastik otomatis tertanam di semua mode.
              </div>
            </div>
          </div>

          {/* RIGHT: Viewfinder Live Output + Rapi/Compact Toggle + Tips */}
          <div className="p-5 flex flex-col bg-obsidian/40 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amberGold" />
                <span className="font-display text-xs uppercase tracking-widest text-amberBright font-bold">
                  Output — {MODES.find((m) => m.id === mode)?.label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {showCompact && (
                  <div className="flex rounded-lg overflow-hidden border border-line">
                    <button
                      type="button"
                      onClick={() => setCompact(false)}
                      className={`px-2.5 py-1.5 text-xs font-bold ${
                        !compact ? 'bg-amberGold text-obsidian' : 'bg-obsidian text-mutedWarm'
                      }`}
                    >
                      Rapi
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompact(true)}
                      className={`px-2.5 py-1.5 text-xs font-bold ${
                        compact ? 'bg-amberGold text-obsidian' : 'bg-obsidian text-mutedWarm'
                      }`}
                    >
                      Compact
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCopy}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    copied
                      ? 'bg-emerald-400 text-obsidian'
                      : 'bg-amberGold hover:bg-amberBright text-obsidian'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Tersalin!' : 'Salin prompt'}
                </button>
              </div>
            </div>

            {/* Viewfinder Output Box */}
            <div className="relative flex-1 min-h-[280px]">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amberGold pointer-events-none" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amberGold pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amberGold pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amberGold pointer-events-none" />
              <pre className="w-full h-full max-h-[52vh] overflow-y-auto rounded-xl p-4 bg-obsidian border border-line font-mono text-[11.5px] leading-relaxed text-cream/90 whitespace-pre-wrap">
                {prompt}
              </pre>
            </div>

            {/* Mode-Specific Tips */}
            <div className="rounded-xl p-3.5 bg-panel border border-line space-y-1">
              <div className="font-display text-[11px] uppercase tracking-widest text-amberBright font-bold mb-1.5">
                Cara pakai mode ini
              </div>
              {(RAW_TIPS[mode] || []).map((t, i) => (
                <div key={i} className="flex gap-2 text-xs leading-relaxed text-mutedWarm">
                  <span className="text-amberGold font-bold">—</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
