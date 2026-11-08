import React, { useState } from 'react';
import {
  CheckCircle2,
  Chrome,
  Copy,
  FolderOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { copyTextToClipboard, revealInExplorer } from '../lib/clipboardImage';
import { FlowAccount } from '../types/studio';

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: FlowAccount[];
  activeAccountId?: string;
  extensionDir: string;
  onLaunchAccount: (id: string, openExtensionsTab?: boolean) => Promise<void>;
  onRotateAccount: () => Promise<void>;
  onAddAccount: (payload: Partial<FlowAccount>) => Promise<void>;
  onUpdateAccount: (id: string, payload: Partial<FlowAccount>) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onRefillAll: () => Promise<void>;
  notify: (msg: string, type?: 'ok' | 'err') => void;
}

export const AccountPoolDrawer: React.FC<Props> = ({
  open,
  onClose,
  accounts,
  activeAccountId,
  extensionDir,
  onLaunchAccount,
  onRotateAccount,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onRefillAll,
  notify,
}) => {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTier, setNewTier] = useState<'AI Pro' | 'AI Ultra' | 'Trial / Lainnya'>('AI Pro');
  const [newCredits, setNewCredits] = useState('1000');
  const [showAdd, setShowAdd] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  if (!open) return null;

  const totalCredits = accounts.reduce((sum, a) => sum + (a.creditsRemaining || 0), 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const max = Number(newCredits) || 1000;
    await onAddAccount({
      name: newName.trim() || `Akun Flow #${accounts.length + 1}`,
      emailHint: newEmail.trim(),
      planTier: newTier,
      creditsMax: max,
      creditsRemaining: max,
      costPerClip: 20,
    });
    setNewName('');
    setNewEmail('');
    setShowAdd(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-panel border-l border-line h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-line flex items-center justify-between bg-obsidian">
          <div>
            <h2 className="font-display text-xl font-bold tracking-wide text-amberGold uppercase flex items-center gap-2">
              <Chrome className="w-5 h-5" />
              Multi-Account Flow Vault (Zero Login-Logout)
            </h2>
            <p className="text-xs text-mutedWarm mt-1">
              Tiap akun punya profil Chrome terisolasi sendiri. Login cukup 1x selamanya — saat token habis, klik Rotasi!
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-panelSoft border border-line text-mutedWarm hover:text-cream"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Action Bar */}
        <div className="px-5 py-3.5 bg-panelSoft border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <span className="text-mutedWarm">Total Cadangan Pool: </span>
            <strong className="text-amberBright font-mono text-sm">{totalCredits} Token</strong>
            <span className="text-mutedWarm ml-2">({accounts.length} Akun)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRotateAccount}
              className="px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900/80 border border-red-700/60 text-red-200 text-xs font-semibold flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-amberGold" />
              Token Habis → Rotasi Akun Berikutnya
            </button>
            <button
              onClick={onRefillAll}
              className="px-3 py-1.5 rounded-lg bg-obsidian hover:bg-panel border border-line text-cream text-xs font-medium flex items-center gap-1.5"
              title="Isi penuh kembali angka kuota semua akun"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refill Semua
            </button>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="px-3 py-1.5 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Akun
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Add Form */}
          {showAdd && (
            <form
              onSubmit={handleCreate}
              className="p-4 rounded-xl bg-obsidian border border-amberGold/50 space-y-3"
            >
              <div className="text-xs font-bold text-amberGold uppercase">Tambah Profil Akun Google Flow Baru</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-mutedWarm mb-1">Nama Label Akun</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`Misal: Akun Flow #${accounts.length + 1}`}
                    className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-sm text-cream"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-mutedWarm mb-1">Catatan Email Google</label>
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="akun2@gmail.com"
                    className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-sm text-cream"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-mutedWarm mb-1">Paket Langganan</label>
                  <select
                    value={newTier}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setNewTier(val);
                      if (val === 'AI Ultra') setNewCredits('2500');
                      else if (val === 'AI Pro') setNewCredits('1000');
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-sm text-cream"
                  >
                    <option value="AI Pro">Google AI Pro (~1000 kredit)</option>
                    <option value="AI Ultra">Google AI Ultra (~2500+ kredit)</option>
                    <option value="Trial / Lainnya">Trial / Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-mutedWarm mb-1">Kuota Kredit Awal</label>
                  <input
                    type="number"
                    value={newCredits}
                    onChange={(e) => setNewCredits(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-sm text-cream font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs text-mutedWarm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amberGold text-obsidian text-xs font-bold"
                >
                  Simpan Profil Akun
                </button>
              </div>
            </form>
          )}

          {/* Account Cards */}
          {accounts.map((acc) => {
            const isActive = acc.id === activeAccountId || acc.status === 'active';
            const isExhausted = acc.status === 'exhausted' || acc.creditsRemaining <= 0;
            const pct = Math.min(100, Math.round((acc.creditsRemaining / Math.max(1, acc.creditsMax)) * 100));

            return (
              <div
                key={acc.id}
                className={`p-4 rounded-xl border transition ${
                  isActive
                    ? 'bg-panelSoft border-amberGold shadow-lg'
                    : isExhausted
                    ? 'bg-obsidian/60 border-red-900/50 opacity-80'
                    : 'bg-obsidian border-line'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-cream">{acc.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-line bg-panel text-mutedWarm">
                        {acc.planTier}
                      </span>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amberGold text-obsidian flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> AKTIF DIPAKAI
                        </span>
                      )}
                      {isExhausted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                          TOKEN HABIS
                        </span>
                      )}
                    </div>
                    <input
                      value={acc.emailHint}
                      onChange={(e) => onUpdateAccount(acc.id, { emailHint: e.target.value })}
                      placeholder="Klik untuk tulis catatan email akun ini..."
                      className="mt-1 bg-transparent text-xs text-mutedWarm focus:text-cream focus:outline-none border-b border-transparent focus:border-line w-64"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={launchingId === acc.id}
                      onClick={async () => {
                        setLaunchingId(acc.id);
                        try {
                          await onLaunchAccount(acc.id, false);
                        } finally {
                          setTimeout(() => setLaunchingId(null), 900);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Chrome className="w-3.5 h-3.5" />
                      {launchingId === acc.id ? 'Membuka Chrome...' : 'Buka Google Flow'}
                    </button>
                    <button
                      disabled={launchingId === `${acc.id}_ext`}
                      onClick={async () => {
                        setLaunchingId(`${acc.id}_ext`);
                        try {
                          await onLaunchAccount(acc.id, true);
                        } finally {
                          setTimeout(() => setLaunchingId(null), 900);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-panel hover:bg-panelSoft border border-line text-xs text-mutedWarm hover:text-cream disabled:opacity-60"
                      title="Buka Chrome sekaligus panduan 2-klik pasang ekstensi pendamping (cukup 1x)"
                    >
                      {launchingId === `${acc.id}_ext` ? 'Membuka...' : '+ Pasang Ekstensi'}
                    </button>
                    {accounts.length > 1 && (
                      <button
                        onClick={() => onDeleteAccount(acc.id)}
                        className="p-1.5 rounded-lg bg-panel border border-line text-mutedWarm hover:text-red-400"
                        title="Hapus akun dari pool"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Credits Bar & Quick Adjust */}
                <div className="mt-3 pt-3 border-t border-line/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-mutedWarm">Estimasi Sisa Kredit Flow</span>
                      <span className="font-mono text-amberBright">
                        {acc.creditsRemaining} / {acc.creditsMax} (~
                        {Math.floor(acc.creditsRemaining / Math.max(1, acc.costPerClip))} klip lagi)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-panel overflow-hidden border border-line">
                      <div
                        className={`h-full transition-all ${
                          pct > 25 ? 'bg-amberGold' : pct > 0 ? 'bg-orange-500' : 'bg-red-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <label className="text-mutedWarm text-[11px]">Sisa:</label>
                    <input
                      type="number"
                      value={acc.creditsRemaining}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        onUpdateAccount(acc.id, {
                          creditsRemaining: val,
                          status: val === 0 ? 'exhausted' : isActive ? 'active' : 'ready',
                        });
                      }}
                      className="w-20 px-2 py-1 rounded bg-panel border border-line font-mono text-xs text-cream"
                    />
                    <button
                      onClick={() =>
                        onUpdateAccount(acc.id, {
                          creditsRemaining: acc.creditsMax,
                          status: isActive ? 'active' : 'ready',
                        })
                      }
                      className="px-2 py-1 rounded bg-panel border border-line text-[11px] text-emerald-300 hover:bg-panelSoft flex items-center gap-1"
                      title="Reset penuh kuota akun ini"
                    >
                      <RefreshCw className="w-3 h-3" /> Penuhkan
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* One-Time Companion Extension Guide */}
          <div className="p-4 rounded-xl bg-obsidian border border-amberGold/30 space-y-2.5">
            <div className="text-xs font-bold text-amberBright uppercase">
              🧩 Lokasi Folder Extension &amp; Cara Pasang (Cukup 1x per Profil Akun)
            </div>
            <div className="p-2.5 rounded-lg bg-panel border border-line font-mono text-xs text-cream select-all break-all">
              {extensionDir || 'D:\\Dika\\ugc-production-os\\flow-studio\\chrome-extension-flow'}
            </div>
            <ol className="text-xs text-mutedWarm space-y-1 list-decimal list-inside leading-relaxed">
              <li>
                Klik tombol <strong>+ Pasang Ekstensi</strong> pada kartu akun di atas → jendela Chrome akun tersebut akan terbuka dengan panduan otomatis.
              </li>
              <li>
                Buka <code>chrome://extensions</code> → aktifkan <strong>Developer mode</strong> → klik <strong>Load unpacked</strong> → paste alamat folder di atas.
              </li>
            </ol>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={async () => {
                  const target =
                    extensionDir || 'D:\\Dika\\ugc-production-os\\flow-studio\\chrome-extension-flow';
                  await copyTextToClipboard(target);
                  setCopiedPath(true);
                  notify('✅ Path folder Extension berhasil disalin! Tinggal Ctrl+V di Load Unpacked.');
                  setTimeout(() => setCopiedPath(false), 3000);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  copiedPath
                    ? 'bg-emerald-500 text-obsidian'
                    : 'bg-amberGold hover:bg-amberBright text-obsidian'
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedPath ? '✅ Berhasil Disalin! (Tinggal Ctrl+V)' : 'Copy Path Folder Extension'}
              </button>
              <button
                onClick={async () => {
                  try {
                    const target =
                      extensionDir || 'D:\\Dika\\ugc-production-os\\flow-studio\\chrome-extension-flow';
                    await revealInExplorer(target);
                    notify('📂 Membuka folder Extension di Windows Explorer...');
                  } catch (err: any) {
                    notify(err.message, 'err');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-panel hover:bg-panelSoft border border-line text-xs text-cream flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Buka Folder Extension di Explorer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
