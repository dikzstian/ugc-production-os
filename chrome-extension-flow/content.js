(() => {
  if (window.__FLOW_STUDIO_DOCK_MOUNTED__ === 2) return;
  window.__FLOW_STUDIO_DOCK_MOUNTED__ = 2;
  if (window.__FLOW_STUDIO_DOCK_TIMER__) {
    clearInterval(window.__FLOW_STUDIO_DOCK_TIMER__);
  }
  const prevHost = document.getElementById('dika-flow-studio-dock-host');
  if (prevHost) {
    prevHost.remove();
  }

  const host = document.createElement('div');
  host.id = 'dika-flow-studio-dock-host';
  host.style.cssText =
    'position:fixed;bottom:18px;right:18px;z-index:2147483646;font-family:Inter,system-ui,sans-serif;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  let isMinimized = false;
  let bridgeData = null;
  let statusBanner = '';
  let statusOk = true;

  // Auto-Run & Auto-Queue state
  let isQueueRunning = false;
  let queueAbortRequested = false;
  let skipCurrentWaitRequested = false;
  let queueStatusText = '';
  let isBatchPulling = false;
  let lastHandledAutoRunId = '';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function apiCall(path, method = 'GET', body = undefined) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FLOW_STUDIO_API', path, method, body }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(resp || { ok: false, error: 'Tidak ada respons dari extension worker.' });
      });
    });
  }

  function fetchRemoteVideoAsDataUrl(videoUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FLOW_STUDIO_FETCH_VIDEO_DATAURL', videoUrl }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(resp || { ok: false, error: 'Gagal fetch video.' });
      });
    });
  }

  async function reportAutoRunProgress(state, stepText, currentSceneNumber = undefined) {
    queueStatusText = stepText;
    render();
    await apiCall('/api/bridge/autorun-progress', 'POST', {
      state,
      stepText,
      currentSceneNumber,
    }).catch(() => {});
  }

  function showMsg(text, ok = true, durationMs = 4500) {
    statusBanner = text;
    statusOk = ok;
    render();
    if (durationMs > 0) {
      setTimeout(() => {
        if (statusBanner === text) {
          statusBanner = '';
          render();
        }
      }, durationMs);
    }
  }

  async function dataUrlToPngBlob(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Gagal konversi PNG'));
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar'));
      img.src = dataUrl;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal konversi blob video'));
      reader.readAsDataURL(blob);
    });
  }

  async function copyAttachmentToClipboard(mediaUrl, label) {
    showMsg(`Menyalin ${label} ke clipboard...`, true);
    const res = await apiCall(`/api/media-base64?mediaUrl=${encodeURIComponent(mediaUrl)}`);
    if (!res.ok || !res.data?.dataUrl) {
      showMsg(res.error || res.data?.error || 'Gambar belum diupload untuk aset ini.', false);
      return;
    }
    try {
      const pngBlob = await dataUrlToPngBlob(res.data.dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      showMsg(`✅ ${label} tersalin! Klik area Google Flow lalu tekan Ctrl+V.`, true);
    } catch (err) {
      showMsg('Gagal copy gambar ke clipboard: ' + err.message, false);
    }
  }

  function findPrimaryPromptElement() {
    const directPm = document.querySelector(
      'flow-rich-text-editor .ProseMirror[role="textbox"], .ProseMirror[contenteditable="true"], flow-prompt-box [role="textbox"]'
    );
    if (directPm) {
      const r = directPm.getBoundingClientRect();
      if (r.width >= 80 && r.height >= 12) return directPm;
    }

    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
    ).filter((el) => {
      if (host.contains(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.top < 52 && r.height < 46) return false;
      return r.width > 100 && r.height >= 12;
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });

    return candidates[0];
  }

  function findComposerContainer(promptEl) {
    if (!promptEl) return null;
    const promptRect = promptEl.getBoundingClientRect();
    let composerRoot = null;
    let curr = promptEl.parentElement;
    for (let depth = 0; depth < 7 && curr && curr !== document.body; depth++) {
      const r = curr.getBoundingClientRect();
      const btnCount = curr.querySelectorAll('button, [role="button"]').length;
      if (btnCount >= 1 && r.width >= promptRect.width * 0.85 && r.height <= 440) {
        composerRoot = curr;
      }
      curr = curr.parentElement;
    }
    return composerRoot;
  }

  function countComposerImages(promptEl) {
    const chipCount = document.querySelectorAll('flow-ingredient-chip button.chip-container').length;
    if (chipCount > 0) return chipCount;
    const root = findComposerContainer(promptEl) || promptEl?.parentElement;
    if (!root) return 0;
    return Array.from(root.querySelectorAll('img')).filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width >= 20 && r.height >= 20;
    }).length;
  }

  /**
   * Automatically opens "New project" if Google Flow is still on its landing/home page
   */
  async function ensureFlowWorkspaceReady() {
    let promptEl = findPrimaryPromptElement();
    if (promptEl) return promptEl;

    // Look for "+ New project" / "Create" button on Google Flow landing screen
    const newProjBtn = Array.from(document.querySelectorAll('button, a, [role="button"]')).find(
      (el) => {
        if (host.contains(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 24) return false;
        const txt = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.trim();
        return /\b(new project|create project|buat proyek|proyek baru)\b/i.test(txt);
      }
    );

    if (newProjBtn) {
      newProjBtn.click();
    }

    for (let i = 0; i < 20 && !queueAbortRequested; i++) {
      await sleep(1000);
      promptEl = findPrimaryPromptElement();
      if (promptEl) return promptEl;
    }
    return null;
  }

  /**
   * Automatically pastes/uploads Reference Images (Character / Product / Last Frame) into Flow's composer!
   */
  async function autoAttachSceneIngredients(attachments, attachedCache) {
    const validAtts = (attachments || []).filter((a) => a.imageUrl && a.type !== 'ref_video');
    if (!validAtts.length) return;

    const promptEl = findPrimaryPromptElement();
    if (!promptEl) return;

    // If Flow cleared composer chips after previous generation, reset cache so we re-attach
    if (countComposerImages(promptEl) === 0 && attachedCache.size > 0) {
      attachedCache.clear();
    }

    for (let idx = 0; idx < validAtts.length; idx++) {
      if (queueAbortRequested) break;
      const att = validAtts[idx];
      if (attachedCache.has(att.imageUrl)) continue;

      const res = await apiCall(`/api/media-base64?mediaUrl=${encodeURIComponent(att.imageUrl)}`);
      if (!res.ok || !res.data?.dataUrl) continue;

      try {
        const pngBlob = await dataUrlToPngBlob(res.data.dataUrl);
        const file = new File([pngBlob], `ingredient_${att.type}_${idx + 1}.png`, {
          type: 'image/png',
        });

        const beforeCount = countComposerImages(promptEl);
        promptEl.focus();

        const dt = new DataTransfer();
        dt.items.add(file);

        // Method 1: Dispatch native paste event onto Flow's prompt textbox (identical to Ctrl+V!)
        const pasteEvt = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        promptEl.dispatchEvent(pasteEvt);

        await sleep(1100);
        let afterCount = countComposerImages(promptEl);

        // Method 2 fallback: Attach via <input type="file"> if paste didn't mount a chip
        if (afterCount <= beforeCount) {
          const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(
            (inp) => {
              const acc = (inp.getAttribute('accept') || '').toLowerCase();
              return !acc || acc.includes('image') || acc.includes('*');
            }
          );
          if (fileInputs.length > 0) {
            const targetInput = fileInputs[fileInputs.length - 1];
            targetInput.files = dt.files;
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        attachedCache.add(att.imageUrl);
        // Wait for Google Flow to finish uploading the ingredient thumbnail
        await sleep(2200);
      } catch {
        // Ignore single attachment error and continue
      }
    }
  }

  function findFlowGenerateButton(promptEl) {
    const directGen = document.querySelector(
      'flow-generate-icon-button button.generate-icon-button, button.generate-icon-button[type="submit"], button[aria-label="Start generation"]'
    );
    if (directGen) {
      const isDisabled =
        Boolean(directGen.disabled) ||
        directGen.classList.contains('mat-mdc-button-disabled') ||
        directGen.getAttribute('aria-disabled') === 'true';
      if (!isDisabled) return directGen;
    }

    if (!promptEl) return null;
    const promptRect = promptEl.getBoundingClientRect();
    const composerRoot = findComposerContainer(promptEl);

    const rawButtons = Array.from(
      (composerRoot || document).querySelectorAll('button, [role="button"]')
    );

    const excludeRe =
      /\b(add|attach|upload|ingredient|image|photo|frame|settings|tune|config|aspect|ratio|output|count|model|veo|close|clear|delete|remove|cancel|stop|expand|collapse|dropdown|menu|history|back|download|share|edit|extend|upscale)\b/i;
    const positiveLabelRe = /\b(generate|create|buat|submit|send|run)\b/i;
    const iconNameRe =
      /^(arrow_forward|arrow_upward|north|east|send|auto_awesome|spark|sparkles|play_arrow)$/i;

    let bestBtn = null;
    let bestScore = -1;

    for (const btn of rawButtons) {
      if (host.contains(btn)) continue;
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;

      const r = btn.getBoundingClientRect();
      if (r.width < 20 || r.height < 20 || r.width > 260 || r.height > 100) continue;

      if (Math.abs(r.bottom - promptRect.bottom) > 160 && Math.abs(r.top - promptRect.top) > 160) {
        continue;
      }

      const aria = (btn.getAttribute('aria-label') || '').trim();
      const title = (btn.getAttribute('title') || '').trim();
      const text = (btn.textContent || '').trim().replace(/\s+/g, ' ');
      const combined = `${aria} ${title} ${text}`.trim();

      if (text === '+' || text === '×' || excludeRe.test(combined)) continue;

      let score = 0;
      if (positiveLabelRe.test(combined)) score += 100;
      if (btn.getAttribute('type') === 'submit') score += 85;
      if (iconNameRe.test(text)) score += 75;

      const iconEl = btn.querySelector('i, span[class*="icon"], span[class*="symbol"], mat-icon');
      const iconTxt = (iconEl?.textContent || '').trim();
      if (iconNameRe.test(iconTxt)) score += 75;

      if (r.left >= promptRect.left + promptRect.width * 0.5) score += 35;
      if (r.left >= promptRect.right - 90) score += 20;

      if (score > bestScore) {
        bestScore = score;
        bestBtn = btn;
      }
    }

    return bestScore >= 65 ? bestBtn : null;
  }

  async function injectPromptIntoFlowPage(promptText, autoSubmit = false, silent = false) {
    navigator.clipboard.writeText(promptText).catch(() => {});

    const target = findPrimaryPromptElement();
    if (!target) {
      if (!silent) {
        showMsg('📋 Prompt di-copy! Klik kotak prompt Google Flow lalu tekan Ctrl+V.', true);
      }
      return { injected: false, clickedGenerate: false };
    }

    target.focus();

    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const proto =
        target.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(target, promptText);
      } else {
        target.value = promptText;
      }
      target.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: promptText })
      );
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, promptText);
      if ((target.textContent || '').trim().length < Math.min(12, promptText.length)) {
        target.textContent = promptText;
      }
      target.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: promptText })
      );
    }

    if (!autoSubmit) {
      if (!silent) {
        showMsg('⚡ Prompt Anti-Bug otomatis diisi ke kotak Flow!', true);
      }
      return { injected: true, clickedGenerate: false };
    }

    await sleep(550);
    const genBtn = findFlowGenerateButton(target);
    if (genBtn) {
      genBtn.click();
      if (!silent) {
        showMsg('🚀 Prompt diisi & tombol Generate Google Flow otomatis diklik!', true);
      }
      return { injected: true, clickedGenerate: true };
    }

    if (!silent) {
      showMsg(
        '⚡ Prompt sudah diisi ke kotak Flow! Klik panah Generate di kanan kotak prompt.',
        true
      );
    }
    return { injected: true, clickedGenerate: false };
  }

  function collectPageVideos() {
    const map = new Map();
    const tiles = Array.from(document.querySelectorAll('flow-video-tile')).reverse();
    for (const tile of tiles) {
      const r = tile.getBoundingClientRect();
      if (r.width < 60 && r.height < 60) continue;
      const vChild = tile.querySelector('video');
      const thumbImg = tile.querySelector('img.thumbnail');
      const src =
        (vChild && (vChild.currentSrc || vChild.src)) ||
        (thumbImg && thumbImg.src ? thumbImg.src.replace(/=.*$/, '') + '=mm,22,15' : '');
      if (src) map.set(src, vChild || tile);
    }
    const videos = Array.from(document.querySelectorAll('video'));
    for (const v of videos) {
      if (host.contains(v)) continue;
      const src =
        v.currentSrc ||
        v.src ||
        v.querySelector('source')?.getAttribute('src') ||
        '';
      if (!src || src.startsWith('data:')) continue;
      const r = v.getBoundingClientRect();
      if (r.width < 40 && r.height < 40) continue;
      if (!map.has(src)) map.set(src, v);
    }
    return map;
  }

  async function tryCaptureVideoElementAndUpload(projId, sceneId, videoUrl, videoEl) {
    // 1. Try direct Blob fetch in content script (works for blob: URLs & CORS-allowed URLs)
    if (videoUrl.startsWith('blob:') || videoUrl.startsWith(window.location.origin)) {
      try {
        const resp = await fetch(videoUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob.size > 15 * 1024) {
            const dataUrl = await blobToDataUrl(blob);
            const up = await apiCall(
              `/api/projects/${projId}/scenes/${sceneId}/upload-captured-video`,
              'POST',
              { dataUrl, autoStitchIfComplete: true }
            );
            if (up.ok && up.data?.ok) return up.data;
          }
        }
      } catch {
        // Fallback to background worker
      }
    }

    // 2. Try cross-origin fetch via background service worker (storage.googleapis.com, etc.)
    if (videoUrl.startsWith('http')) {
      const bgRes = await fetchRemoteVideoAsDataUrl(videoUrl);
      if (bgRes.ok && bgRes.dataUrl) {
        const up = await apiCall(
          `/api/projects/${projId}/scenes/${sceneId}/upload-captured-video`,
          'POST',
          { dataUrl: bgRes.dataUrl, autoStitchIfComplete: true }
        );
        if (up.ok && up.data?.ok) return up.data;
      }
    }

    // 3. Fallback: Find & click Google Flow's native Download button near this video element
    if (videoEl) {
      let card = videoEl.parentElement;
      for (let d = 0; d < 5 && card && card !== document.body; d++) {
        const dlBtn = Array.from(card.querySelectorAll('button, a, [role="button"]')).find((b) => {
          const t = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${
            b.textContent || ''
          }`.toLowerCase();
          return t.includes('download') || t.includes('unduh');
        });
        if (dlBtn) {
          dlBtn.click();
          await sleep(3800);
          const pull = await apiCall(
            `/api/projects/${projId}/scenes/${sceneId}/attach-video`,
            'POST',
            { grabLatestFromDownloads: true }
          );
          if (pull.ok && pull.data?.ok) return pull.data;
          break;
        }
        card = card.parentElement;
      }
    }

    return null;
  }

  /**
   * FULL END-TO-END RUNNER:
   * waitAndCapture = true  -> Auto-paste images, Generate S1 -> wait & auto-capture MP4 -> Generate S2 -> wait & auto-capture -> Auto-Stitch!
   * waitAndCapture = false -> Rapid-queue S1, S2, S3 prompts every 12s (manual Download + Batch Pull at the end)
   */
  async function runAutoQueue(scenesToRun, modeLabel = 'Auto-Run Semua Scene', waitAndCapture = true) {
    if (isQueueRunning || !scenesToRun?.length) return;

    const projId = bridgeData?.activeProject?.id;
    const allQueue = bridgeData?.queueScenes || [];
    if (!projId) return;

    isMinimized = false;
    isQueueRunning = true;
    queueAbortRequested = false;
    skipCurrentWaitRequested = false;
    const attachedCache = new Set();

    await reportAutoRunProgress(
      'running',
      `🚀 Menyiapkan ruang kerja Google Flow (${scenesToRun.length} scene)...`,
      scenesToRun[0]?.sceneNumber
    );

    try {
      const workspaceInput = await ensureFlowWorkspaceReady();
      if (!workspaceInput) {
        await reportAutoRunProgress(
          'paused',
          '⚠️ Buka/klik "+ New project" di Google Flow dulu agar kotak prompt muncul, lalu klik tombol Run lagi!'
        );
        showMsg(
          '⚠️ Klik "+ New project" di Google Flow dulu agar kotak prompt terbuka, lalu klik Run lagi!',
          false,
          7500
        );
        return;
      }

      let capturedCount = 0;
      let finalStitchedSec = 0;

      for (let i = 0; i < scenesToRun.length; i++) {
        if (queueAbortRequested) break;
        skipCurrentWaitRequested = false;

        // Refresh latest state (important if Frame-Chain generated a new lastFrameUrl on previous scene!)
        await refreshState(true);
        const freshQueue = bridgeData?.queueScenes || allQueue;
        const sc = freshQueue.find((x) => x.id === scenesToRun[i].id) || scenesToRun[i];

        await apiCall('/api/bridge', 'POST', { activeSceneId: sc.id });

        // 1. Auto-paste Character / Product / Last-Frame Ingredients
        if (sc.requiredAttachments?.length) {
          await reportAutoRunProgress(
            'running',
            `🖼️ Menempelkan gambar referensi Scene ${sc.sceneNumber}/${freshQueue.length}...`,
            sc.sceneNumber
          );
          await autoAttachSceneIngredients(sc.requiredAttachments, attachedCache);
        }

        if (queueAbortRequested) break;

        // Snapshot existing <video> elements BEFORE clicking Generate
        const knownVideosBefore = new Set(collectPageVideos().keys());

        await reportAutoRunProgress(
          'running',
          `✍️ Mengisi prompt Anti-Bug & menekan Generate untuk Scene ${sc.sceneNumber}/${freshQueue.length} (${sc.beatLabel})...`,
          sc.sceneNumber
        );

        let result = await injectPromptIntoFlowPage(sc.prompt, true, true);

        // Wait up to 40s if Generate button is still enabling (e.g. ingredient upload finishing)
        if (result.injected && !result.clickedGenerate) {
          for (let waitBtn = 40; waitBtn > 0 && !queueAbortRequested; waitBtn--) {
            await reportAutoRunProgress(
              'running',
              `⏳ Menunggu tombol Generate Google Flow siap untuk Scene ${sc.sceneNumber} (${waitBtn}d)...`,
              sc.sceneNumber
            );
            await sleep(1000);
            const target = findPrimaryPromptElement();
            const btn = findFlowGenerateButton(target);
            if (btn) {
              btn.click();
              result.clickedGenerate = true;
              break;
            }
          }
        }

        if (!result.clickedGenerate) {
          await reportAutoRunProgress(
            'paused',
            `⏸️ Prompt Scene ${sc.sceneNumber} sudah siap di kotak Flow. Klik tombol panah Generate di Google Flow!`
          );
          showMsg(
            `⏸️ Prompt Scene ${sc.sceneNumber} sudah terisi! Klik panah Generate di Google Flow.`,
            false,
            6500
          );
          return;
        }

        // 2. Either Wait & Auto-Capture Rendered Video OR Fast-Cooldown to Next Scene
        if (waitAndCapture) {
          let capturedData = null;
          const maxWaitSec = 170;

          for (let elapsed = 0; elapsed < maxWaitSec && !queueAbortRequested && !skipCurrentWaitRequested; elapsed += 2) {
            await reportAutoRunProgress(
              'running',
              `🎬 Google Flow sedang merender Video Scene ${sc.sceneNumber}/${freshQueue.length}... (${elapsed}d) — Otomatis ditarik begitu selesai!`,
              sc.sceneNumber
            );
            await sleep(2000);

            if (elapsed < 6) continue; // Ignore first 6s UI transitions

            const currentVideos = collectPageVideos();
            for (const [vUrl, vEl] of currentVideos.entries()) {
              if (!knownVideosBefore.has(vUrl)) {
                await reportAutoRunProgress(
                  'running',
                  `📥 Video Scene ${sc.sceneNumber} terdeteksi selesai! Menarik otomatis ke Flow Studio OS...`,
                  sc.sceneNumber
                );
                await sleep(1500);
                capturedData = await tryCaptureVideoElementAndUpload(projId, sc.id, vUrl, vEl);
                knownVideosBefore.add(vUrl);
                if (capturedData) break;
              }
            }

            if (capturedData) break;
          }

          if (capturedData) {
            capturedCount++;
            if (capturedData.stitched) {
              finalStitchedSec = capturedData.finalDurationSec || 0;
            }
            // Brief 3s breather before starting next scene
            if (i < scenesToRun.length - 1 && !queueAbortRequested) {
              await sleep(3000);
            }
          } else if (!queueAbortRequested && i < scenesToRun.length - 1) {
            // If user clicked Skip Wait or video didn't expose <video> tag yet, continue queueing next scene!
            for (let cd = 5; cd > 0 && !queueAbortRequested; cd--) {
              await reportAutoRunProgress(
                'running',
                `⏭️ Lanjut mengirim Scene ${scenesToRun[i + 1].sceneNumber} dalam ${cd}d...`,
                scenesToRun[i + 1].sceneNumber
              );
              await sleep(1000);
            }
          }
        } else if (i < scenesToRun.length - 1 && !queueAbortRequested) {
          const nextSc = scenesToRun[i + 1];
          for (let cd = 11; cd > 0 && !queueAbortRequested; cd--) {
            await reportAutoRunProgress(
              'running',
              `✅ Scene ${sc.sceneNumber} terkirim! Jeda aman ${cd}d sebelum kirim Scene ${nextSc.sceneNumber}...`,
              sc.sceneNumber
            );
            await sleep(1000);
          }
        }
      }

      if (queueAbortRequested) {
        await reportAutoRunProgress('cancelled', '⏹ Auto-Run dihentikan oleh pengguna.');
        showMsg('⏹ Auto-Run dihentikan.', false);
      } else if (finalStitchedSec > 0) {
        await reportAutoRunProgress(
          'done',
          `🎉 BERES TOTAL! ${capturedCount} Scene berhasil di-generate, ditarik & langsung digabung jadi 1 Video Utuh (${finalStitchedSec} detik)!`
        );
        showMsg(
          `🎉 BERES TOTAL! Video akhir (${finalStitchedSec} detik) sudah jadi di Flow Studio OS & folder HASIL UGC!`,
          true,
          9000
        );
      } else if (capturedCount > 0) {
        // Trigger final stitch just in case earlier scenes already had videos
        const stRes = await apiCall(`/api/projects/${projId}/stitch`, 'POST', {});
        if (stRes.ok && stRes.data?.finalDurationSec) {
          await reportAutoRunProgress(
            'done',
            `🎉 BERES TOTAL! Semua klip berhasil digabung jadi 1 Video Utuh (${stRes.data.finalDurationSec} detik)!`
          );
          showMsg(
            `🎉 BERES TOTAL! Video utuh (${stRes.data.finalDurationSec} detik) siap ditonton di Flow Studio OS!`,
            true,
            9000
          );
        } else {
          await reportAutoRunProgress(
            'done',
            `✅ ${capturedCount} klip berhasil otomatis masuk ke Flow Studio OS!`
          );
        }
      } else {
        await reportAutoRunProgress(
          'done',
          `✅ Semua ${scenesToRun.length} prompt sudah dikirim ke Google Flow! Setelah selesai render, klik Download tiap klip lalu klik "Tarik Batch MP4 & Auto-Gabung".`
        );
        showMsg(
          `✅ Semua scene terkirim! Setelah selesai render, klik Download lalu "Tarik Batch MP4 & Auto-Gabung".`,
          true,
          8000
        );
      }
    } finally {
      isQueueRunning = false;
      queueAbortRequested = false;
      skipCurrentWaitRequested = false;
      queueStatusText = '';
      await refreshState(true);
    }
  }

  async function batchPullAndStitch() {
    const projId = bridgeData?.activeProject?.id;
    if (!projId || isBatchPulling) return;

    isBatchPulling = true;
    render();
    showMsg('📥 Menarik semua MP4 baru dari Downloads & menggabungkan dengan FFmpeg...', true, 12000);

    try {
      const res = await apiCall(`/api/projects/${projId}/batch-pull-and-stitch`, 'POST', {
        autoStitch: true,
      });
      if (!res.ok || !res.data?.ok) {
        showMsg(
          res.data?.error || res.error || 'Gagal tarik batch MP4 dari Downloads.',
          false,
          6000
        );
        return;
      }

      const d = res.data;
      if (d.stitched) {
        await reportAutoRunProgress(
          'done',
          `🎉 BERES! ${d.attachedCount} MP4 ditarik & langsung digabung jadi 1 Video Utuh (${d.finalDurationSec} detik)!`
        );
        showMsg(
          `🎬 MANTAP! ${d.attachedCount} MP4 ditarik & langsung digabung jadi 1 Video Utuh (${d.finalDurationSec} detik)!`,
          true,
          8000
        );
      } else {
        showMsg(`✅ ${d.attachedCount} MP4 baru berhasil masuk ke scene kosong!`, true, 5500);
      }
    } finally {
      isBatchPulling = false;
      await refreshState(true);
    }
  }

  async function refreshState(skipAutoPickup = false) {
    const res = await apiCall('/api/bridge/state?source=ext');
    if (res.ok && res.data) {
      bridgeData = res.data;

      // Check if localhost:5180 triggered a 1-Click Auto-Run job!
      const job = bridgeData.autoRunJob;
      if (
        !skipAutoPickup &&
        !isQueueRunning &&
        job &&
        job.runner !== 'cdp' &&
        job.state === 'queued' &&
        job.id !== lastHandledAutoRunId
      ) {
        lastHandledAutoRunId = job.id;
        const qScenes = bridgeData.queueScenes || [];
        const pendingAll = qScenes.filter((s) => !s.hasVideo);
        const targets =
          job.mode === 'pilot_s1'
            ? qScenes.slice(0, 1)
            : job.mode === 'rest'
            ? qScenes.slice(1).filter((s) => !s.hasVideo)
            : pendingAll.length > 0
            ? pendingAll
            : qScenes;

        if (targets.length > 0) {
          setTimeout(() => {
            runAutoQueue(targets, 'Auto-Run 1-Klik dari Studio', true);
          }, 250);
        }
      }
    } else {
      bridgeData = { offlineError: res.error || 'Server Flow Studio belum jalan.' };
    }
    render();
  }

  async function selectScene(sceneId) {
    if (bridgeData?.bridgeMode === 'motion') {
      await apiCall('/api/bridge', 'POST', { activeMotionSegmentId: sceneId });
    } else {
      await apiCall('/api/bridge', 'POST', { activeSceneId: sceneId });
    }
    await refreshState(true);
  }

  async function rotateAccount() {
    showMsg('Merotasi ke akun berikutnya & membuka Chrome baru...', true);
    const res = await apiCall('/api/accounts/rotate', 'POST', {
      currentAccountId: bridgeData?.activeAccount?.id,
      launchChrome: true,
    });
    if (!res.ok) {
      showMsg(res.data?.error || res.error || 'Gagal rotasi akun.', false);
      return;
    }
    showMsg(`🚀 Pindah ke ${res.data.rotatedTo.name}! Jendela Chrome baru telah dibuka.`, true);
    await refreshState(true);
  }

  async function grabLatestDownload() {
    const projId = bridgeData?.activeProject?.id;
    const scId = bridgeData?.activeScene?.id;
    if (!projId || !scId) return;

    const endpoint =
      bridgeData?.bridgeMode === 'motion'
        ? `/api/motion-jobs/${projId}/segments/${scId}/attach-output`
        : `/api/projects/${projId}/scenes/${scId}/attach-video`;

    showMsg('Menarik 1 MP4 terbaru dari Downloads...', true);
    const res = await apiCall(endpoint, 'POST', { grabLatestFromDownloads: true });
    if (!res.ok) {
      showMsg(res.data?.error || res.error || 'Gagal menarik MP4 dari Downloads.', false);
      return;
    }
    showMsg('✅ Klip masuk! Otomatis lanjut ke segmen/scene berikutnya.', true);
    await refreshState(true);
  }

  function render() {
    const acc = bridgeData?.activeAccount;
    const proj = bridgeData?.activeProject;
    const scene = bridgeData?.activeScene;
    const compiled = bridgeData?.compiled;
    const queueScenes = bridgeData?.queueScenes || [];
    const isMotion = bridgeData?.bridgeMode === 'motion';

    const style = `
      <style>
        * { box-sizing: border-box; }
        .pill {
          background: #171310;
          color: #F3ECE1;
          border: 1.5px solid #EE9F27;
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 8px 28px rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .card {
          width: 376px;
          max-height: 86vh;
          overflow-y: auto;
          background: #16120E;
          color: #F3ECE1;
          border: 1px solid #3A2F23;
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.75);
          padding: 13px;
          font-size: 12px;
        }
        .hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 9px;
          border-bottom: 1px solid #2D241C;
          margin-bottom: 9px;
        }
        .brand { font-weight: 700; color: #EE9F27; font-size: 13px; letter-spacing: 0.3px; }
        .min-btn {
          background: #251E17; color: #A39583; border: 1px solid #3A2F23;
          border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 11px;
        }
        .acc-bar {
          background: #211B15; border: 1px solid #352B20; border-radius: 9px;
          padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 9px;
        }
        .rotate-btn {
          background: #3A1D16; color: #FFB4A2; border: 1px solid #7C3626;
          border-radius: 7px; padding: 5px 8px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .rotate-btn:hover { background: #52261C; }
        .scenes-row { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0 9px; }
        .sc-chip {
          padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer;
          border: 1px solid #352B20; background: #201A14; color: #C9BBAE;
        }
        .sc-chip.active { background: #EE9F27; color: #14100C; border-color: #EE9F27; font-weight: 700; }
        .sc-chip.done { border-color: #4D7C3F; color: #A7F3A0; }
        .sc-chip.active.done { color: #14100C; }
        .att-box { background: #1F1913; border: 1px solid #33291F; border-radius: 8px; padding: 7px; margin-bottom: 8px; }
        .att-item { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 4px 0; }
        .autorun-box {
          background: linear-gradient(180deg, #241B10 0%, #17120C 100%);
          border: 1.5px solid #EE9F27;
          border-radius: 11px;
          padding: 10px;
          margin-bottom: 9px;
        }
        .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
        .btn {
          width: 100%; padding: 8.5px 10px; border-radius: 8px; border: none;
          font-weight: 700; font-size: 11.5px; cursor: pointer; margin-top: 6px;
        }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-amber { background: #EE9F27; color: #14100C; font-weight: 800; }
        .btn-amber:hover { background: #F7BE59; }
        .btn-outline { background: #241D16; color: #F7BE59; border: 1px solid #594329; }
        .btn-outline:hover { background: #31271D; }
        .btn-green { background: #233B22; color: #A7F3A0; border: 1px solid #3D6B3B; }
        .btn-green:hover { background: #2D4D2B; }
        .btn-emerald-solid { background: #10B981; color: #08120E; font-weight: 800; }
        .btn-emerald-solid:hover { background: #34D399; }
        .btn-red { background: #4B1D19; color: #FECACA; border: 1px solid #8B342C; }
        .btn-sm {
          background: #2C231B; color: #F7BE59; border: 1px solid #4A3B2C;
          border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .prompt-pre {
          background: #100D0A; border: 1px solid #2C241B; border-radius: 7px;
          padding: 7px; font-family: monospace; font-size: 10.5px; max-height: 95px;
          overflow-y: auto; white-space: pre-wrap; color: #DDD3C4; margin: 5px 0;
        }
        .status {
          padding: 7px 9px; border-radius: 7px; font-size: 11px; margin-bottom: 8px; line-height: 1.4;
          background: ${statusOk ? '#1D331E' : '#3B1B18'};
          color: ${statusOk ? '#A9F5A5' : '#FFB3A7'};
          border: 1px solid ${statusOk ? '#376339' : '#733029'};
        }
        .badge {
          display: inline-block; padding: 2px 7px; border-radius: 99px;
          font-size: 10px; font-weight: 600; background: #2D2318; color: #F7BE59; border: 1px solid #4B3A26;
        }
      </style>
    `;

    if (isMinimized) {
      shadow.innerHTML = `
        ${style}
        <div class="pill" id="expandBtn">
          <span>⚡ Flow Studio</span>
          ${scene ? `<span>• S${scene.sceneNumber}/${proj?.totalScenes || 1}</span>` : ''}
          ${acc ? `<span style="color:#F7BE59">(${acc.creditsRemaining} tkn)</span>` : ''}
        </div>
      `;
      shadow.getElementById('expandBtn')?.addEventListener('click', () => {
        isMinimized = false;
        refreshState(true);
      });
      return;
    }

    if (!bridgeData || bridgeData.offlineError) {
      shadow.innerHTML = `
        ${style}
        <div class="card">
          <div class="hdr">
            <span class="brand">⚡ FLOW STUDIO OS</span>
            <button class="min-btn" id="minBtn">Minimize</button>
          </div>
          <div style="color:#FFB3A7;line-height:1.45;margin-bottom:8px;">
            ${bridgeData?.offlineError || 'Menghubungkan ke server lokal...'}
          </div>
          <button class="btn btn-amber" id="retryBtn">🔄 Coba Hubungkan Lagi</button>
        </div>
      `;
      shadow.getElementById('minBtn')?.addEventListener('click', () => {
        isMinimized = true;
        render();
      });
      shadow.getElementById('retryBtn')?.addEventListener('click', () => refreshState(true));
      return;
    }

    const attachmentsHtml = (compiled?.requiredAttachments || [])
      .map(
        (att, idx) => `
        <div class="att-item">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:195px;" title="${att.label}">
            ${att.type === 'ref_video' ? '🎞️' : '🖼️'} ${att.label}
          </span>
          ${
            att.type === 'ref_video' && att.filePath
              ? `<button class="btn-sm reveal-att-btn" data-idx="${idx}">📂 Buka Klip (Drag)</button>`
              : att.imageUrl
              ? `<button class="btn-sm copy-att-btn" data-idx="${idx}">📋 Copy (Ctrl+V)</button>`
              : `<span style="color:#8C7D6B;font-size:10px;">Belum ada file</span>`
          }
        </div>
      `
      )
      .join('');

    const scenesHtml = (proj?.scenesBrief || [])
      .map(
        (s) => `
        <button class="sc-chip ${scene?.id === s.id ? 'active' : ''} ${s.hasVideo ? 'done' : ''}" data-sc="${s.id}">
          S${s.sceneNumber}${s.hasVideo ? ' ✓' : ''}
        </button>
      `
      )
      .join('');

    const scene1 = queueScenes[0];
    const pendingAll = queueScenes.filter((s) => !s.hasVideo);
    const runTargets = pendingAll.length > 0 ? pendingAll : queueScenes;
    const showMultiSceneRunner = !isMotion && queueScenes.length >= 1;

    const remoteCdpRunning =
      bridgeData?.autoRunJob &&
      bridgeData.autoRunJob.runner === 'cdp' &&
      (bridgeData.autoRunJob.state === 'running' || bridgeData.autoRunJob.state === 'queued');
    const activeAutoRun = isQueueRunning || remoteCdpRunning;
    const liveStatusText = remoteCdpRunning
      ? bridgeData.autoRunJob.stepText
      : queueStatusText;

    let autoRunHtml = '';
    if (showMultiSceneRunner) {
      if (activeAutoRun) {
        autoRunHtml = `
          <div class="autorun-box">
            <div style="font-size:10.5px;font-weight:800;color:#F7BE59;margin-bottom:4px;">
              🚀 AUTO-RUN SEDANG BERJALAN OTOMATIS...
            </div>
            <div style="font-size:11px;color:#E5D9C8;line-height:1.45;margin-bottom:6px;">
              ${liveStatusText}
            </div>
            <div class="row-2">
              <button class="btn btn-outline" style="margin-top:0;" id="skipWaitBtn" title="Jangan tunggu video selesai, langsung kirim prompt scene berikutnya">
                ⏭️ Lanjut Scene Berikut
              </button>
              <button class="btn btn-red" style="margin-top:0;" id="abortQueueBtn">
                ⏹ Hentikan
              </button>
            </div>
          </div>
        `;
      } else {
        autoRunHtml = `
          <div class="autorun-box">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:10.5px;font-weight:800;color:#F7BE59;text-transform:uppercase;">
                🚀 1-Klik Langsung Beres Semua Scene
              </span>
              <span style="font-size:10px;color:#A7F3A0;font-weight:700;">
                ${proj.completedScenes || 0}/${proj.totalScenes} Klip Siap
              </span>
            </div>
            <button class="btn btn-amber" style="margin-top:2px;font-size:12px;padding:10px;" id="fullAutoAllBtn">
              🚀 GAS RUN SEMUA (${runTargets.length} SCENE) SAMPAI JADI MP4!
            </button>
            <div class="row-2">
              <button class="btn btn-outline" style="margin-top:0;font-size:10.5px;" id="fastQueueBtn" title="Kirim semua prompt berurutan tiap 11 detik tanpa menunggu auto-capture">
                ⚡ Kirim Antrean Cepat
              </button>
              <button class="btn btn-outline" style="margin-top:0;font-size:10.5px;" id="pilotS1Btn" title="Opsional jika mau tes Scene 1 saja dulu">
                🛡️ Tes Scene 1 Saja
              </button>
            </div>
            <button class="btn btn-emerald-solid" id="batchPullBtn" ${
              isBatchPulling ? 'disabled' : ''
            } title="Cadangan manual jika lu klik Download sendiri di Google Flow">
              ${
                isBatchPulling
                  ? '⏳ Menarik & Menggabungkan MP4...'
                  : `📥 Tarik Batch Downloads & Auto-Gabung`
              }
            </button>
          </div>
        `;
      }
    }

    shadow.innerHTML = `
      ${style}
      <div class="card">
        <div class="hdr">
          <span class="brand">⚡ FLOW STUDIO DOCK v1.2</span>
          <div style="display:flex;gap:5px;">
            <button class="min-btn" id="refreshBtn" title="Sinkron ulang">🔄</button>
            <button class="min-btn" id="minBtn">—</button>
          </div>
        </div>

        ${statusBanner ? `<div class="status">${statusBanner}</div>` : ''}

        ${
          acc
            ? `
          <div class="acc-bar">
            <div>
              <div style="font-weight:700;font-size:12px;">${acc.name}</div>
              <div style="color:#A39583;font-size:10.5px;">Sisa Token: <strong style="color:#F7BE59">${acc.creditsRemaining}</strong> / ${acc.creditsMax}</div>
            </div>
            <button class="rotate-btn" id="rotateBtn">
              ⚡ Token Habis → Ganti
            </button>
          </div>
        `
            : ''
        }

        ${
          proj && scene
            ? `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:215px;">
              🎬 ${proj.title}
            </div>
            <span class="badge">${compiled?.flowModeBadge || 'Flow'}</span>
          </div>

          <div class="scenes-row">${scenesHtml}</div>

          ${autoRunHtml}

          <div style="color:#C9BBAE;font-size:11px;margin-bottom:6px;">
            <strong>Scene ${scene.sceneNumber} (${scene.beatLabel})</strong> • ${scene.durationSec} dtk
          </div>

          ${
            attachmentsHtml
              ? `<div class="att-box">
                  <div style="font-size:10px;color:#A39583;margin-bottom:3px;text-transform:uppercase;font-weight:700;">${
                    isMotion
                      ? '1. Video Referensi (Drag) + Gambar Lu (Ctrl+V):'
                      : '1. Gambar Referensi (Otomatis Ditempel saat Auto-Run):'
                  }</div>
                  ${attachmentsHtml}
                </div>`
              : ''
          }

          <div style="font-size:10px;color:#A39583;text-transform:uppercase;font-weight:700;">
            2. Prompt Anti-Bug Scene ${scene.sceneNumber}:
          </div>
          <div class="prompt-pre">${(compiled?.prompt || '').replace(/</g, '&lt;')}</div>

          <div class="row-2">
            <button class="btn btn-outline" style="margin-top:0;" id="fillPromptBtn" ${
              isQueueRunning ? 'disabled' : ''
            }>
              📋 Isi Prompt S${scene.sceneNumber}
            </button>
            <button class="btn btn-amber" style="margin-top:0;" id="fillAndGenBtn" ${
              isQueueRunning ? 'disabled' : ''
            }>
              ▶️ Isi &amp; Generate S${scene.sceneNumber}
            </button>
          </div>
          <button class="btn btn-green" id="grabMp4Btn" ${isQueueRunning ? 'disabled' : ''}>
            📥 Tarik 1 MP4 Terbaru → Scene ${scene.sceneNumber}
          </button>
        `
            : `<div style="color:#A39583;padding:12px 0;">Belum ada scene aktif. Buat/pecah script di aplikasi Flow Studio OS dulu.</div>`
        }
      </div>
    `;

    shadow.getElementById('minBtn')?.addEventListener('click', () => {
      isMinimized = true;
      render();
    });
    shadow.getElementById('refreshBtn')?.addEventListener('click', () => refreshState(true));
    shadow.getElementById('rotateBtn')?.addEventListener('click', rotateAccount);

    shadow.getElementById('fillPromptBtn')?.addEventListener('click', () => {
      if (compiled?.prompt) injectPromptIntoFlowPage(compiled.prompt, false);
    });
    shadow.getElementById('fillAndGenBtn')?.addEventListener('click', () => {
      if (compiled?.prompt) injectPromptIntoFlowPage(compiled.prompt, true);
    });
    shadow.getElementById('grabMp4Btn')?.addEventListener('click', grabLatestDownload);

    // 1-Click Full Auto-Run (Uses Server Native CDP when available so file uploads & settings are 100% automatic!)
    shadow.getElementById('fullAutoAllBtn')?.addEventListener('click', async () => {
      if (proj?.id) {
        const res = await apiCall(`/api/projects/${proj.id}/start-autorun`, 'POST', {
          mode: 'all',
        });
        if (res.ok && res.data?.cdpOnline) {
          await refreshState(true);
          return;
        }
      }
      if (runTargets.length > 0) {
        runAutoQueue(runTargets, `Auto-Run ${runTargets.length} Scene`, true);
      }
    });
    shadow.getElementById('fastQueueBtn')?.addEventListener('click', () => {
      if (runTargets.length > 0) {
        runAutoQueue(runTargets, `Antrean Cepat ${runTargets.length} Scene`, false);
      }
    });
    shadow.getElementById('pilotS1Btn')?.addEventListener('click', async () => {
      if (proj?.id) {
        const res = await apiCall(`/api/projects/${proj.id}/start-autorun`, 'POST', {
          mode: 'pilot_s1',
        });
        if (res.ok && res.data?.cdpOnline) {
          await refreshState(true);
          return;
        }
      }
      if (scene1) runAutoQueue([scene1], 'Tes Scene 1', true);
    });
    shadow.getElementById('skipWaitBtn')?.addEventListener('click', () => {
      skipCurrentWaitRequested = true;
    });
    shadow.getElementById('abortQueueBtn')?.addEventListener('click', async () => {
      queueAbortRequested = true;
      queueStatusText = 'Menghentikan proses...';
      await apiCall('/api/bridge/autorun-progress', 'POST', { clear: true }).catch(() => {});
      await refreshState(true);
    });
    shadow.getElementById('batchPullBtn')?.addEventListener('click', batchPullAndStitch);

    shadow.querySelectorAll('.sc-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (isQueueRunning) return;
        const scId = btn.getAttribute('data-sc');
        if (scId) selectScene(scId);
      });
    });

    shadow.querySelectorAll('.copy-att-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        const att = compiled?.requiredAttachments?.[idx];
        if (att?.imageUrl) copyAttachmentToClipboard(att.imageUrl, att.label);
      });
    });

    shadow.querySelectorAll('.reveal-att-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-idx'));
        const att = compiled?.requiredAttachments?.[idx];
        if (att?.filePath) {
          await apiCall('/api/system/reveal', 'POST', { targetPath: att.filePath });
          showMsg('📂 File Klip Referensi disorot di Explorer! Tinggal drag ke Google Flow.', true);
        }
      });
    });
  }

  refreshState(false);
  // Poll every 2.5s (even when tab is in background!) so clicking "GAS RUN SEMUA" on localhost:5180 starts immediately!
  window.__FLOW_STUDIO_DOCK_TIMER__ = setInterval(() => {
    if (!isQueueRunning) {
      refreshState(false);
    }
  }, 2500);
})();
