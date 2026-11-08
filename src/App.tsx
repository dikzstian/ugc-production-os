import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Chrome,
  Film,
  Layers,
  Plus,
  Scissors,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Video,
  Zap,
} from 'lucide-react';
import { AccountPoolDrawer } from './components/AccountPoolDrawer';
import { CharacterLabModal } from './components/CharacterLabModal';
import { MotionCloneStudio } from './components/MotionCloneStudio';
import { Step1Setup } from './components/Step1Setup';
import { Step2ScriptScenes } from './components/Step2ScriptScenes';
import { Step3FlowAndStitch } from './components/Step3FlowAndStitch';
import {
  BridgeState,
  CharacterAsset,
  FlowAccount,
  MotionCloneJob,
  ProductAsset,
  StudioProject,
} from './types/studio';

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3 | 'motion'>(1);

  const [accounts, setAccounts] = useState<FlowAccount[]>([]);
  const [characters, setCharacters] = useState<CharacterAsset[]>([]);
  const [products, setProducts] = useState<ProductAsset[]>([]);
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [motionJobs, setMotionJobs] = useState<MotionCloneJob[]>([]);
  const [bridge, setBridge] = useState<BridgeState>({});
  const [extensionDir, setExtensionDir] = useState('');

  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [activeMotionJobId, setActiveMotionJobId] = useState<string>('');
  const [openAccountDrawer, setOpenAccountDrawer] = useState(false);
  const [openCharLab, setOpenCharLab] = useState(false);
  const [isStitching, setIsStitching] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const motionSaveTimerRef = useRef<number | null>(null);

  const notify = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 3800);
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      const data = await res.json();
      if (data.ok) {
        setAccounts(data.accounts || []);
        setCharacters(data.characters || []);
        setProducts(data.products || []);
        setProjects(data.projects || []);
        setMotionJobs(data.motionJobs || []);
        setBridge(data.bridge || {});
        setExtensionDir(data.paths?.extensionDir || '');
        const initialProjId = data.bridge?.activeProjectId || data.projects?.[0]?.id || '';
        setActiveProjectId((curr) => curr || initialProjId);
        const initialMotionId = data.bridge?.activeMotionJobId || data.motionJobs?.[0]?.id || '';
        setActiveMotionJobId((curr) => curr || initialMotionId);
        if (data.bridge?.bridgeMode === 'motion' && (data.motionJobs?.length || 0) > 0) {
          setStep('motion');
        }
      }
    } catch (err: any) {
      notify('Gagal terhubung ke server lokal: ' + err.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Auto-sync state when user switches back from Google Flow Chrome window
  useEffect(() => {
    const onFocusSync = () => {
      if (!saveTimerRef.current && !motionSaveTimerRef.current && !isStitching) {
        loadBootstrap();
      }
    };
    window.addEventListener('focus', onFocusSync);
    return () => window.removeEventListener('focus', onFocusSync);
  }, [loadBootstrap, isStitching]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];
  const activeMotionJob = motionJobs.find((j) => j.id === activeMotionJobId) || motionJobs[0];
  const activeAccount =
    accounts.find((a) => a.id === bridge.activeAccountId) ||
    accounts.find((a) => a.status === 'active') ||
    accounts[0];
  const selectedCharacter = characters.find((c) => c.id === activeProject?.characterId);
  const selectedProduct = products.find((p) => p.id === activeProject?.productId);

  const persistProjectNow = async (proj: StudioProject) => {
    await fetch(`/api/projects/${proj.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj),
    });
  };

  const handleChangeProject = (patch: Partial<StudioProject>) => {
    if (!activeProject) return;
    const updated: StudioProject = {
      ...activeProject,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistProjectNow(updated).catch(() => {});
    }, 350);
  };

  const handleSwitchProject = async (projId: string) => {
    setActiveProjectId(projId);
    if (step === 'motion') setStep(1);
    const proj = projects.find((p) => p.id === projId);
    const res = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bridgeMode: 'project',
        activeProjectId: projId,
        activeSceneId: proj?.scenes?.[0]?.id,
      }),
    });
    const data = await res.json();
    if (data.ok) setBridge(data.bridge);
  };

  const handleCreateProject = async (mode: 'ugc' | 'storytelling') => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentMode: mode,
        title:
          mode === 'ugc'
            ? `UGC Baru #${projects.length + 1}`
            : `Storytelling Baru #${projects.length + 1}`,
        targetDurationSec: mode === 'ugc' ? 30 : 45,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setProjects(data.projects);
      setBridge(data.bridge);
      setActiveProjectId(data.project.id);
      setStep(1);
      notify(`Project ${mode === 'ugc' ? 'UGC' : 'Storytelling'} baru siap diatur!`);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (projects.length <= 1) {
      notify('Sisakan minimal 1 project aktif.', 'err');
      return;
    }
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setProjects(data.projects);
      setBridge(data.bridge);
      setActiveProjectId(data.projects[0]?.id || '');
      notify('Project dihapus.');
    }
  };

  // ─── Account Handlers ──────────────────────────────────────────────────────

  const handleLaunchAccount = async (id: string, openExtensionsTab = false) => {
    const res = await fetch(`/api/accounts/${id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openExtensionsTab }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal membuka Chrome.', 'err');
      return;
    }
    setAccounts(data.accounts);
    setBridge(data.bridge);
    notify(`🚀 Jendela Chrome ${data.account.name} terbuka tanpa perlu logout akun lain!`);
  };

  const handleRotateAccount = async () => {
    const res = await fetch('/api/accounts/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentAccountId: activeAccount?.id, launchChrome: true }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      if (data.accounts) setAccounts(data.accounts);
      setOpenAccountDrawer(true);
      notify(data.error || 'Semua akun sudah habis tokennya!', 'err');
      return;
    }
    setAccounts(data.accounts);
    setBridge(data.bridge);
    notify(
      `⚡ Pindah mulus ke ${data.rotatedTo.name}! Jendela Chrome baru sudah terbuka siap lanjut scene.`
    );
  };

  const handleAddAccount = async (payload: Partial<FlowAccount>) => {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      setAccounts(data.accounts);
      notify(`${data.account.name} ditambahkan ke Pool!`);
    }
  };

  const handleUpdateAccount = async (id: string, payload: Partial<FlowAccount>) => {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) setAccounts(data.accounts);
  };

  const handleDeleteAccount = async (id: string) => {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setAccounts(data.accounts);
      setBridge(data.bridge);
    }
  };

  const handleRefillAll = async () => {
    const res = await fetch('/api/accounts/refill-all', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      setAccounts(data.accounts);
      setBridge(data.bridge);
      notify('Semua kuota akun di Pool berhasil diisi penuh kembali!');
    }
  };

  // ─── Assets CRUD ───────────────────────────────────────────────────────────

  const handleCreateCharacter = async (c: Partial<CharacterAsset>) => {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const data = await res.json();
    if (data.ok) {
      setCharacters(data.characters);
      notify(`Talent ${data.character.name} ditambahkan!`);
      return data.character as CharacterAsset;
    }
    return null;
  };

  const handleUpdateCharacter = async (id: string, c: Partial<CharacterAsset>) => {
    const res = await fetch(`/api/characters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const data = await res.json();
    if (data.ok) setCharacters(data.characters);
  };

  const handleDeleteCharacter = async (id: string) => {
    const res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setCharacters(data.characters);
      if (activeProject?.characterId === id) {
        handleChangeProject({ characterId: data.characters[0]?.id });
      }
    }
  };

  const handleCreateProduct = async (p: Partial<ProductAsset>) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const data = await res.json();
    if (data.ok) {
      setProducts(data.products);
      notify(`Produk ${data.product.name} ditambahkan!`);
      return data.product as ProductAsset;
    }
    return null;
  };

  const handleUpdateProduct = async (id: string, p: Partial<ProductAsset>) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const data = await res.json();
    if (data.ok) setProducts(data.products);
  };

  const handleDeleteProduct = async (id: string) => {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setProducts(data.products);
      if (activeProject?.productId === id) {
        handleChangeProject({ productId: undefined });
      }
    }
  };

  // ─── Step 3 Video & Stitch Handlers ────────────────────────────────────────

  const handleSelectBridgeScene = async (sceneId: string) => {
    if (!activeProject) return;
    await persistProjectNow(activeProject);
    const res = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bridgeMode: 'project',
        activeProjectId: activeProject.id,
        activeSceneId: sceneId,
      }),
    });
    const data = await res.json();
    if (data.ok) setBridge(data.bridge);
  };

  const handleAttachVideo = async (
    sceneId: string,
    opts: { file?: File; grabLatest?: boolean; sourceFilePath?: string }
  ) => {
    if (!activeProject) return;
    await persistProjectNow(activeProject);

    let res: Response;
    if (opts.file) {
      const fd = new FormData();
      fd.append('video', opts.file);
      res = await fetch(`/api/projects/${activeProject.id}/scenes/${sceneId}/attach-video`, {
        method: 'POST',
        body: fd,
      });
    } else {
      res = await fetch(`/api/projects/${activeProject.id}/scenes/${sceneId}/attach-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grabLatestFromDownloads: opts.grabLatest,
          sourceFilePath: opts.sourceFilePath,
        }),
      });
    }

    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal memasukkan video MP4.', 'err');
      return;
    }

    setProjects((prev) => prev.map((p) => (p.id === data.project.id ? data.project : p)));
    if (data.accounts) setAccounts(data.accounts);
    if (data.bridge) setBridge(data.bridge);
    notify('✅ Klip MP4 masuk & Frame Terakhir otomatis diekstrak untuk sambungan scene berikutnya!');
  };

  const handleReExtractFrame = async (sceneId: string, offsetSec: number) => {
    if (!activeProject) return;
    const res = await fetch(
      `/api/projects/${activeProject.id}/scenes/${sceneId}/extract-frame`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offsetFromEndSec: offsetSec }),
      }
    );
    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal ambil ulang frame.', 'err');
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === data.project.id ? data.project : p)));
    notify(`Frame terakhir diambil ulang pada posisi -${offsetSec}s dari akhir klip!`);
  };

  const handleClearSceneVideo = async (sceneId: string) => {
    if (!activeProject) return;
    await persistProjectNow(activeProject);
    const res = await fetch(
      `/api/projects/${activeProject.id}/scenes/${sceneId}/clear-video`,
      { method: 'POST' }
    );
    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal mereset klip scene.', 'err');
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === data.project.id ? data.project : p)));
    if (data.bridge) setBridge(data.bridge);
    notify(
      `🔄 Klip Scene ${data.scene.sceneNumber} di-reset & dikirim ke Dock Extension! Tinggal reroll scene ini saja tanpa buang token scene lain.`
    );
  };

  const handleBatchPullAndStitch = async () => {
    if (!activeProject) return;
    setIsStitching(true);
    try {
      await persistProjectNow(activeProject);
      const res = await fetch(`/api/projects/${activeProject.id}/batch-pull-and-stitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoStitch: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        notify(data.error || 'Gagal tarik batch MP4 & gabung video.', 'err');
        return;
      }
      setProjects((prev) => prev.map((p) => (p.id === data.project.id ? data.project : p)));
      if (data.accounts) setAccounts(data.accounts);
      if (data.bridge) setBridge(data.bridge);

      if (data.stitched) {
        notify(
          `🎬 MANTAP! ${data.attachedCount} MP4 baru ditarik berurutan & langsung digabung jadi 1 Video Utuh (${data.finalDurationSec} detik)!` +
            (data.copiedToHasilUgcPath ? ' Tersimpan juga di D:\\Dika\\HASIL UGC!' : '')
        );
      } else {
        notify(
          `✅ ${data.attachedCount} MP4 baru berhasil dimasukkan ke scene kosong! Selesaikan sisa scene lalu klik Gabung.`
        );
      }
    } catch (err: any) {
      notify(err.message, 'err');
    } finally {
      setIsStitching(false);
    }
  };

  const handleStitchProject = async () => {
    if (!activeProject) return;
    setIsStitching(true);
    try {
      await persistProjectNow(activeProject);
      const res = await fetch(`/api/projects/${activeProject.id}/stitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stitchSettings: activeProject.stitchSettings }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        notify(data.error || 'Gagal menggabungkan video.', 'err');
        return;
      }
      setProjects((prev) => prev.map((p) => (p.id === data.project.id ? data.project : p)));
      notify(
        `🎬 Berhasil menggabungkan ${data.stitchedClipsCount} scene menjadi 1 MP4 utuh (${data.finalDurationSec} detik)!` +
          (data.copiedToHasilUgcPath ? ' Salinan juga masuk ke D:\\Dika\\HASIL UGC!' : '')
      );
    } catch (err: any) {
      notify(err.message, 'err');
    } finally {
      setIsStitching(false);
    }
  };

  // ─── Motion Clone Studio Handlers (Reference Video + Image -> Exact Motion) ──

  const persistMotionJobNow = async (job: MotionCloneJob) => {
    await fetch(`/api/motion-jobs/${job.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
  };

  const handleUpdateMotionJob = async (job: MotionCloneJob) => {
    const updated: MotionCloneJob = {
      ...job,
      updatedAt: new Date().toISOString(),
    };
    setMotionJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));

    if (motionSaveTimerRef.current) window.clearTimeout(motionSaveTimerRef.current);
    motionSaveTimerRef.current = window.setTimeout(() => {
      persistMotionJobNow(updated).catch(() => {});
    }, 300);
  };

  const handleSelectMotionJob = async (jobId: string) => {
    setActiveMotionJobId(jobId);
    const job = motionJobs.find((j) => j.id === jobId);
    const res = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bridgeMode: 'motion',
        activeMotionJobId: jobId,
        activeMotionSegmentId: job?.segments?.[0]?.id,
      }),
    });
    const data = await res.json();
    if (data.ok) setBridge(data.bridge);
  };

  const handleCreateMotionJob = async () => {
    const res = await fetch('/api/motion-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.ok) {
      setMotionJobs(data.motionJobs);
      setBridge(data.bridge);
      setActiveMotionJobId(data.job.id);
      setStep('motion');
      notify('🕺 Job Motion Clone baru siap! Upload video referensi + gambar lu.');
    }
  };

  const handleDeleteMotionJob = async (jobId: string) => {
    const res = await fetch(`/api/motion-jobs/${jobId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setMotionJobs(data.motionJobs);
      setBridge(data.bridge);
      setActiveMotionJobId(data.motionJobs?.[0]?.id || '');
      notify('Motion Clone job dihapus.');
    }
  };

  const handleUploadReferenceVideo = async (
    jobId: string,
    opts: { file?: File; grabLatest?: boolean; maxSegmentSec?: number }
  ) => {
    const curr = motionJobs.find((j) => j.id === jobId);
    if (curr) await persistMotionJobNow(curr);

    let res: Response;
    if (opts.file) {
      const fd = new FormData();
      fd.append('video', opts.file);
      if (opts.maxSegmentSec) fd.append('maxSegmentSec', String(opts.maxSegmentSec));
      res = await fetch(`/api/motion-jobs/${jobId}/upload-reference`, {
        method: 'POST',
        body: fd,
      });
    } else {
      res = await fetch(`/api/motion-jobs/${jobId}/upload-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grabLatestFromDownloads: opts.grabLatest,
          maxSegmentSec: opts.maxSegmentSec,
        }),
      });
    }

    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal memproses video referensi.', 'err');
      return;
    }

    setMotionJobs(data.motionJobs);
    setBridge(data.bridge);
    notify(
      `✅ Video referensi masuk (${data.job.sourceDurationSec}s) & otomatis dipotong rapi jadi ${data.job.segments.length} segmen!`
    );
  };

  const handleResliceMotionJob = async (jobId: string, maxSegmentSec: number) => {
    const res = await fetch(`/api/motion-jobs/${jobId}/reslice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxSegmentSec }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal memotong ulang video referensi.', 'err');
      return;
    }
    setMotionJobs(data.motionJobs);
    setBridge(data.bridge);
    notify(`✂️ Video referensi dipotong ulang maks ${maxSegmentSec} detik (${data.job.segments.length} segmen)!`);
  };

  const handleSelectBridgeSegment = async (jobId: string, segId: string) => {
    const curr = motionJobs.find((j) => j.id === jobId);
    if (curr) await persistMotionJobNow(curr);
    const res = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bridgeMode: 'motion',
        activeMotionJobId: jobId,
        activeMotionSegmentId: segId,
      }),
    });
    const data = await res.json();
    if (data.ok) setBridge(data.bridge);
  };

  const handleAttachMotionOutput = async (
    jobId: string,
    segId: string,
    opts: { file?: File; grabLatest?: boolean }
  ) => {
    const curr = motionJobs.find((j) => j.id === jobId);
    if (curr) await persistMotionJobNow(curr);

    let res: Response;
    if (opts.file) {
      const fd = new FormData();
      fd.append('video', opts.file);
      res = await fetch(`/api/motion-jobs/${jobId}/segments/${segId}/attach-output`, {
        method: 'POST',
        body: fd,
      });
    } else {
      res = await fetch(`/api/motion-jobs/${jobId}/segments/${segId}/attach-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grabLatestFromDownloads: opts.grabLatest }),
      });
    }

    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal menarik MP4 hasil Motion Clone.', 'err');
      return;
    }

    setMotionJobs(data.motionJobs);
    if (data.accounts) setAccounts(data.accounts);
    if (data.bridge) setBridge(data.bridge);
    notify('🎉 Hasil video Motion Clone berhasil masuk! Siap dibandingkan Side-by-Side.');
  };

  const handleStitchMotionJob = async (jobId: string) => {
    const curr = motionJobs.find((j) => j.id === jobId);
    if (curr) await persistMotionJobNow(curr);
    const res = await fetch(`/api/motion-jobs/${jobId}/stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      notify(data.error || 'Gagal menggabungkan segmen Motion Clone.', 'err');
      return;
    }
    setMotionJobs(data.motionJobs);
    notify(
      `🎬 Semua segmen Motion Clone berhasil dijahit jadi 1 MP4 utuh (${data.job.finalDurationSec} detik)!`
    );
  };

  const handleOpenMotionTab = async () => {
    setStep('motion');
    if (motionJobs.length === 0) {
      await handleCreateMotionJob();
    } else if (activeMotionJob) {
      await handleSelectMotionJob(activeMotionJob.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-obsidian text-amberGold font-display text-lg tracking-wider">
        MEMUAT FLOW STUDIO OS...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-cream flex flex-col">
      <div className="hazard-bar" />

      {/* Toast Notification (z-[200] so it always renders above Drawers & Modals!) */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[200] px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold max-w-md transition ${
            toast.type === 'ok'
              ? 'bg-emerald-950/95 border-emerald-500 text-emerald-200'
              : 'bg-red-950/95 border-red-500 text-red-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Top Studio Header */}
      <header className="border-b border-line bg-panel/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand + Project Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-display text-xl font-bold tracking-wide uppercase leading-none">
                FLOW <span className="text-amberGold">STUDIO OS</span>
              </div>
              <div className="text-[10px] font-mono text-mutedWarm mt-0.5">
                SHORT & LONG • UGC & STORYTELLING • MULTI-AKUN
              </div>
            </div>

            <div className="h-7 w-px bg-line hidden sm:block" />

            <div className="flex items-center gap-1.5">
              <select
                value={activeProject?.id || ''}
                onChange={(e) => handleSwitchProject(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-obsidian border border-line text-xs font-semibold text-cream max-w-[230px]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.contentMode === 'ugc' ? '🛍️' : '🎬'} {p.title}
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleCreateProject('ugc')}
                className="px-2.5 py-1.5 rounded-xl bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1"
                title="Buat Project UGC Baru"
              >
                <Plus className="w-3.5 h-3.5" />
                <ShoppingBag className="w-3.5 h-3.5" />
                UGC
              </button>
              <button
                onClick={() => handleCreateProject('storytelling')}
                className="px-2.5 py-1.5 rounded-xl bg-panelSoft hover:bg-obsidian border border-amberGold/40 text-amberBright text-xs font-bold flex items-center gap-1"
                title="Buat Project Storytelling Baru"
              >
                <Plus className="w-3.5 h-3.5" />
                <Film className="w-3.5 h-3.5" />
                Story
              </button>
              {activeProject && projects.length > 1 && (
                <button
                  onClick={() => handleDeleteProject(activeProject.id)}
                  className="p-1.5 rounded-lg bg-obsidian border border-line text-mutedWarm hover:text-red-400"
                  title="Hapus project ini"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Multi-Account Zero-Logout Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setOpenCharLab(true)}
              className="px-3 py-1.5 rounded-xl bg-obsidian hover:bg-panelSoft border border-line text-xs font-semibold text-cream flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amberGold" />
              Lab Karakter
            </button>

            <div className="flex items-center rounded-xl bg-obsidian border border-line p-1 gap-1">
              <button
                onClick={() => activeAccount && handleLaunchAccount(activeAccount.id, false)}
                className="px-2.5 py-1 rounded-lg bg-amberGold hover:bg-amberBright text-obsidian text-xs font-bold flex items-center gap-1.5"
                title="Buka jendela Chrome terisolasi untuk akun aktif (tanpa logout akun lain)"
              >
                <Chrome className="w-3.5 h-3.5" />
                {activeAccount?.name || 'Buka Flow'}
                <span className="font-mono text-[10px] bg-obsidian/20 px-1.5 py-0.2 rounded">
                  {activeAccount?.creditsRemaining ?? 0}
                </span>
              </button>

              <button
                onClick={handleRotateAccount}
                className="px-2 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 text-[11px] font-semibold flex items-center gap-1"
                title="Klik saat token akun aktif habis untuk otomatis pindah ke akun berikutnya!"
              >
                <Zap className="w-3 h-3 text-amberGold" />
                Ganti Akun
              </button>

              <button
                onClick={() => setOpenAccountDrawer(true)}
                className="px-2.5 py-1 rounded-lg hover:bg-panelSoft text-xs text-mutedWarm hover:text-cream flex items-center gap-1"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Pool ({accounts.length})
              </button>
            </div>
          </div>
        </div>

        {/* 3-Step Workflow + Referensi Video (Motion Clone) Switcher */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 bg-obsidian p-1.5 rounded-2xl border border-line">
            <button
              onClick={() => {
                setStep(1);
                if (bridge.bridgeMode === 'motion' && activeProject) {
                  handleSwitchProject(activeProject.id);
                }
              }}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                step === 1
                  ? 'bg-amberGold text-obsidian shadow'
                  : 'text-mutedWarm hover:text-cream'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>1. Konsep &amp; Ingredients</span>
            </button>
            <button
              onClick={() => {
                setStep(2);
                if (bridge.bridgeMode === 'motion' && activeProject) {
                  handleSwitchProject(activeProject.id);
                }
              }}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                step === 2
                  ? 'bg-amberGold text-obsidian shadow'
                  : 'text-mutedWarm hover:text-cream'
              }`}
            >
              <Scissors className="w-4 h-4" />
              <span>
                2. Naskah &amp; Scene ({activeProject?.scenes.length || 0} Klip)
              </span>
            </button>
            <button
              onClick={() => {
                setStep(3);
                if (activeProject?.scenes[0] && bridge.bridgeMode === 'motion') {
                  handleSelectBridgeScene(activeProject.scenes[0].id);
                }
              }}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                step === 3
                  ? 'bg-amberGold text-obsidian shadow'
                  : 'text-mutedWarm hover:text-cream'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>
                3. Produksi &amp; Gabung (
                {activeProject?.scenes.filter((s) => Boolean(s.videoUrl)).length || 0}/
                {activeProject?.scenes.length || 0})
              </span>
            </button>
            <button
              onClick={handleOpenMotionTab}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition border ${
                step === 'motion'
                  ? 'bg-amberGold text-obsidian border-amberGold shadow'
                  : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/60 hover:text-emerald-200'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>🕺 Referensi Video (Motion Clone)</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1">
        {activeProject && step === 1 && (
          <Step1Setup
            project={activeProject}
            characters={characters}
            products={products}
            onChangeProject={handleChangeProject}
            onCreateCharacter={handleCreateCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onCreateProduct={handleCreateProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onOpenCharLab={() => setOpenCharLab(true)}
            onGoStep2={() => setStep(2)}
            notify={notify}
          />
        )}

        {activeProject && step === 2 && (
          <Step2ScriptScenes
            project={activeProject}
            character={selectedCharacter}
            product={selectedProduct}
            onChangeProject={handleChangeProject}
            onGoStep3={() => {
              if (activeProject.scenes[0]) {
                handleSelectBridgeScene(activeProject.scenes[0].id);
              }
              setStep(3);
            }}
            notify={notify}
          />
        )}

        {activeProject && step === 3 && (
          <Step3FlowAndStitch
            project={activeProject}
            character={selectedCharacter}
            product={selectedProduct}
            activeAccount={activeAccount}
            activeSceneId={bridge.activeSceneId}
            onSelectBridgeScene={handleSelectBridgeScene}
            onLaunchActiveAccount={async () => {
              if (activeAccount) await handleLaunchAccount(activeAccount.id, false);
            }}
            onRotateAccount={handleRotateAccount}
            onAttachVideo={handleAttachVideo}
            onClearSceneVideo={handleClearSceneVideo}
            onBatchPullAndStitch={handleBatchPullAndStitch}
            onReExtractFrame={handleReExtractFrame}
            onChangeProject={handleChangeProject}
            onStitchProject={handleStitchProject}
            onRefreshStudio={loadBootstrap}
            isStitching={isStitching}
            notify={notify}
          />
        )}

        {step === 'motion' && (
          <MotionCloneStudio
            jobs={motionJobs}
            activeJob={activeMotionJob}
            characters={characters}
            products={products}
            activeAccount={activeAccount}
            activeSegmentId={bridge.activeMotionSegmentId}
            onSelectJob={handleSelectMotionJob}
            onCreateJob={handleCreateMotionJob}
            onUpdateJob={handleUpdateMotionJob}
            onDeleteJob={handleDeleteMotionJob}
            onUploadReferenceVideo={handleUploadReferenceVideo}
            onResliceJob={handleResliceMotionJob}
            onSelectBridgeSegment={handleSelectBridgeSegment}
            onAttachSegmentOutput={handleAttachMotionOutput}
            onStitchJob={handleStitchMotionJob}
            onLaunchActiveAccount={async () => {
              if (activeAccount) await handleLaunchAccount(activeAccount.id, false);
            }}
            onRotateAccount={handleRotateAccount}
            notify={notify}
          />
        )}
      </main>

      {/* Drawers & Modals */}
      <AccountPoolDrawer
        open={openAccountDrawer}
        onClose={() => setOpenAccountDrawer(false)}
        accounts={accounts}
        activeAccountId={activeAccount?.id}
        extensionDir={extensionDir}
        onLaunchAccount={handleLaunchAccount}
        onRotateAccount={handleRotateAccount}
        onAddAccount={handleAddAccount}
        onUpdateAccount={handleUpdateAccount}
        onDeleteAccount={handleDeleteAccount}
        onRefillAll={handleRefillAll}
        notify={notify}
      />

      <CharacterLabModal
        open={openCharLab}
        onClose={() => setOpenCharLab(false)}
        onSaveCharacterToStudio={async (c) => {
          const created = await handleCreateCharacter(c);
          if (created && activeProject) {
            handleChangeProject({ characterId: created.id });
          }
          return created;
        }}
        notify={notify}
      />
    </div>
  );
};
