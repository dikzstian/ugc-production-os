(() => {
  if (window.__DIKA_FLOW_CDP__ && window.__DIKA_FLOW_CDP__.version === 10) {
    return true;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function queryAllDeep(root = document.documentElement) {
    const out = [];
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      if (node.nodeType === 1) {
        if (node.id === 'dika-cdp-hud-host' || node.id === 'dika-flow-studio-dock-host') continue;
        out.push(node);
        if (node.shadowRoot) {
          const srChildren = node.shadowRoot.children;
          for (let i = srChildren.length - 1; i >= 0; i--) {
            stack.push(srChildren[i]);
          }
        }
      }
      const children = node.children;
      if (children) {
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push(children[i]);
        }
      }
    }
    return out;
  }

  function isVisibleRect(r, minW = 14, minH = 12) {
    return (
      r &&
      r.width >= minW &&
      r.height >= minH &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < window.innerHeight + 80 &&
      r.left < window.innerWidth + 80
    );
  }

  function updateHud(stepText, state = 'running') {
    let host = document.getElementById('dika-cdp-hud-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dika-cdp-hud-host';
      host.style.cssText =
        'position:fixed;bottom:16px;left:16px;z-index:2147483647;pointer-events:none;font-family:Inter,system-ui,sans-serif;max-width:410px;';
      const card = document.createElement('div');
      card.id = 'dika-cdp-hud-card';
      const title = document.createElement('div');
      title.id = 'dika-cdp-hud-title';
      title.style.cssText =
        'font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;color:#fbbf24;';
      title.textContent = '⚡ FLOW STUDIO AUTO-PILOT';
      const body = document.createElement('div');
      body.id = 'dika-cdp-hud-body';
      body.style.cssText = 'font-size:12px;line-height:1.4;color:#fffbeb;font-weight:600;';
      card.appendChild(title);
      card.appendChild(body);
      host.appendChild(card);
      document.documentElement.appendChild(host);
    }
    const borderCol =
      state === 'done'
        ? '#10b981'
        : state === 'paused' || state === 'error'
        ? '#f59e0b'
        : '#f5b942';
    const card = document.getElementById('dika-cdp-hud-card');
    if (card) {
      card.style.cssText =
        'background:rgba(12,11,9,0.95);border:2px solid ' +
        borderCol +
        ';border-radius:14px;padding:10px 14px;box-shadow:0 12px 32px rgba(0,0,0,0.65);color:#fef3c7;';
    }
    const body = document.getElementById('dika-cdp-hud-body');
    if (body) {
      body.textContent = String(stepText || '');
    }
  }

  function closeAllOverlays() {
    document.querySelectorAll('.cdk-overlay-backdrop').forEach((b) => b.click());
    if (document.querySelector('flow-prompt-box-settings')) {
      const settingsBtn = document.querySelector('button.settings-trigger-button');
      if (settingsBtn) settingsBtn.click();
    }
    const addTrig = document.querySelector('button.add-menu-trigger');
    if (addTrig && addTrig.classList.contains('add-menu-trigger-active')) {
      addTrig.click();
    }
  }

  function findPromptElement(allNodes) {
    const directPm = document.querySelector(
      'flow-rich-text-editor .ProseMirror[role="textbox"], .ProseMirror[contenteditable="true"], flow-prompt-box [role="textbox"]'
    );
    if (directPm) {
      const r = directPm.getBoundingClientRect();
      if (isVisibleRect(r, 80, 12)) return directPm;
    }

    const candidates = allNodes.filter((el) => {
      const tag = el.tagName;
      const ce = el.getAttribute && el.getAttribute('contenteditable');
      const role = el.getAttribute && el.getAttribute('role');
      const isEditable =
        tag === 'TEXTAREA' ||
        ce === 'true' ||
        ce === 'plaintext-only' ||
        role === 'textbox';
      if (!isEditable) return false;
      const r = el.getBoundingClientRect();
      if (r.top < 52 && r.height < 46) return false;
      return isVisibleRect(r, 100, 12);
    });

    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    return candidates[0];
  }

  function findGenerateButton(allNodes, promptEl) {
    const directGen = document.querySelector(
      'flow-generate-icon-button button.generate-icon-button, button.generate-icon-button[type="submit"], button[aria-label="Start generation"]'
    );
    if (directGen) {
      const r = directGen.getBoundingClientRect();
      if (isVisibleRect(r, 18, 18)) {
        const isDisabled =
          Boolean(directGen.disabled) ||
          directGen.classList.contains('mat-mdc-button-disabled') ||
          directGen.getAttribute('aria-disabled') === 'true';
        window.__DIKA_LAST_GEN_BTN__ = directGen;
        return {
          found: true,
          enabled: !isDisabled,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          label: 'Start generation',
        };
      }
    }

    if (!promptEl) return { found: false, enabled: false };
    const pr = promptEl.getBoundingClientRect();

    const excludeRe =
      /\b(add|attach|upload|ingredient|photo|frame|settings|tune|config|aspect|ratio|output|count|model|veo|omni|banana|close|clear|delete|remove|cancel|stop|expand|collapse|dropdown|menu|history|back|download|share|edit|extend|upscale|mic|voice|audio|music|tv|discord|agent)\b/i;
    const posRe = /\b(generate|create|buat|submit|send|run|start generation)\b/i;
    const iconRe =
      /^(arrow_forward|arrow_upward|north|east|send|auto_awesome|spark|sparkles|play_arrow)$/i;

    for (const el of allNodes) {
      if (el.tagName !== 'BUTTON' && (!el.getAttribute || el.getAttribute('role') !== 'button')) continue;
      const r = el.getBoundingClientRect();
      if (!isVisibleRect(r, 18, 18) || r.width > 260) continue;
      if (Math.abs(r.bottom - pr.bottom) > 160 && Math.abs(r.top - pr.top) > 160) continue;

      const aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').trim();
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      const comb = (aria + ' ' + text).trim();
      if (excludeRe.test(comb)) continue;

      if (posRe.test(comb) || iconRe.test(text) || el.getAttribute('type') === 'submit') {
        const isDisabled =
          Boolean(el.disabled) ||
          el.classList.contains('mat-mdc-button-disabled') ||
          el.getAttribute('aria-disabled') === 'true';
        window.__DIKA_LAST_GEN_BTN__ = el;
        return {
          found: true,
          enabled: !isDisabled,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          label: comb.slice(0, 40),
        };
      }
    }

    return { found: false, enabled: false };
  }

  function inspectFlowPage() {
    const allNodes = queryAllDeep(document.documentElement);
    const promptEl = findPromptElement(allNodes);

    let newProjectBtn = { found: false, x: 0, y: 0, label: '' };
    let tryItBtn = { found: false, x: 0, y: 0, label: '' };
    let signInHeaderBtn = false;

    for (const el of allNodes) {
      const tag = el.tagName;
      const role = el.getAttribute && el.getAttribute('role');
      if (tag !== 'BUTTON' && tag !== 'A' && role !== 'button') continue;
      const r = el.getBoundingClientRect();
      if (!isVisibleRect(r, 36, 20)) continue;
      const txt = (
        ((el.getAttribute && el.getAttribute('aria-label')) || '') +
        ' ' +
        (el.textContent || '')
      )
        .trim()
        .replace(/\s+/g, ' ');

      if (!newProjectBtn.found && /(\+\s*)?(new project|create project|buat proyek|proyek baru)/i.test(txt)) {
        newProjectBtn = {
          found: true,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          label: txt.slice(0, 40),
        };
      } else if (!tryItBtn.found && /\b(try it now|get started|start creating|mulai)\b/i.test(txt)) {
        tryItBtn = {
          found: true,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          label: txt.slice(0, 40),
        };
      }

      if (r.top < 90 && /^\s*(sign in|masuk|log in)\s*$/i.test(txt)) {
        signInHeaderBtn = true;
      }
    }

    if (!newProjectBtn.found && tryItBtn.found) {
      newProjectBtn = tryItBtn;
    }

    const chipBtns = Array.from(
      document.querySelectorAll('flow-ingredient-chip button.chip-container')
    );
    const settledChipCount = chipBtns.filter(
      (b) => b.getAttribute('aria-busy') !== 'true' && Boolean(b.querySelector('img.chip-image'))
    ).length;

    const videos = [];
    const seenVideoSrcs = new Set();

    // 1. Detect completed <flow-video-tile> cards (reversed so newest top-left tile is last!)
    const videoTiles = Array.from(document.querySelectorAll('flow-video-tile')).reverse();
    for (const tile of videoTiles) {
      const r = tile.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) continue;
      const tileTxt = (tile.innerText || '').trim();
      if (/\b\d{1,2}%\b/.test(tileTxt)) continue;
      const container = tile.querySelector('.container') || tile;
      container.dispatchEvent(
        new MouseEvent('mouseenter', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 })
      );
      container.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 })
      );
      const vChild = tile.querySelector('video');
      const thumbImg = tile.querySelector('img.thumbnail');
      let src =
        (vChild && (vChild.currentSrc || vChild.src)) ||
        (thumbImg && thumbImg.src && thumbImg.src.includes('/asb/')
          ? thumbImg.src.replace(/=.*$/, '') + '=mm,22,15'
          : '');
      if (!src || seenVideoSrcs.has(src)) continue;
      seenVideoSrcs.add(src);
      videos.push({
        src,
        readyState: 4,
        duration: 12,
        width: Math.round(r.width),
        height: Math.round(r.height),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      });
    }

    // 2. Fallback: any standalone <video> elements
    for (const el of allNodes) {
      if (el.tagName !== 'VIDEO') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 80) continue;
      const sourceChild = el.querySelector && el.querySelector('source');
      const src = el.currentSrc || el.src || (sourceChild && sourceChild.src) || '';
      if (!src || seenVideoSrcs.has(src)) continue;
      seenVideoSrcs.add(src);
      videos.push({
        src,
        readyState: el.readyState || 0,
        duration: Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : 0,
        width: Math.round(r.width),
        height: Math.round(r.height),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      });
    }

    let errorBanner = '';
    for (const el of allNodes) {
      const role = el.getAttribute && el.getAttribute('role');
      const cls = String(el.className || '');
      if (role === 'alert' || role === 'status' || /snack|toast|alert|error/i.test(cls)) {
        const r = el.getBoundingClientRect();
        if (!isVisibleRect(r, 60, 14)) continue;
        const txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
        if (
          /\b(not enough credits|insufficient credits|out of credits|quota exceeded|couldn't generate|unable to generate|failed to generate|violates|something went wrong)\b/i.test(
            txt
          )
        ) {
          errorBanner = txt.slice(0, 180);
          break;
        }
      }
    }

    let promptInfo = {
      found: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      tagName: '',
      isContentEditable: false,
      textLength: 0,
    };
    if (promptEl) {
      const pr = promptEl.getBoundingClientRect();
      const val =
        promptEl.tagName === 'TEXTAREA' || promptEl.tagName === 'INPUT'
          ? promptEl.value || ''
          : promptEl.textContent || '';
      promptInfo = {
        found: true,
        x: pr.left + pr.width / 2,
        y: pr.top + pr.height / 2,
        width: Math.round(pr.width),
        height: Math.round(pr.height),
        tagName: promptEl.tagName,
        isContentEditable: promptEl.tagName !== 'TEXTAREA' && promptEl.tagName !== 'INPUT',
        textLength: val.trim().length,
      };
    }

    const settingsBtn = document.querySelector('button.settings-trigger-button');
    const settingsPillText = (settingsBtn?.textContent || '').trim().replace(/\s+/g, ' ');
    const settingsOverlayOpen = Boolean(document.querySelector('flow-prompt-box-settings'));

    const isSignInRequired =
      window.location.hostname.includes('accounts.google.com') ||
      window.location.pathname.startsWith('/about') ||
      (signInHeaderBtn && !promptInfo.found && !newProjectBtn.found);

    return {
      url: window.location.href,
      isSignInRequired,
      promptBox: promptInfo,
      newProjectBtn,
      settingsPillText,
      settingsOverlayOpen,
      totalChipCount: chipBtns.length,
      settledChipCount,
      generateBtn: findGenerateButton(allNodes, promptEl),
      videos,
      errorBanner,
    };
  }

  async function configureFlowVideoSettings(
    desiredRatio = '9:16',
    videoType = 'Ingredients',
    desiredDurationSec = 12
  ) {
    const settingsBtn = document.querySelector('button.settings-trigger-button');
    if (!settingsBtn) return { ok: false, reason: 'no_settings_btn' };

    if (!document.querySelector('flow-prompt-box-settings')) {
      settingsBtn.click();
      await sleep(480);
    }

    const clickToggle = (txtSub) => {
      const btns = Array.from(
        document.querySelectorAll('flow-prompt-box-settings button.mat-button-toggle-button')
      );
      const b = btns.find((el) => (el.textContent || '').includes(txtSub));
      if (b) {
        b.click();
        return true;
      }
      return false;
    };

    clickToggle('videocam');
    await sleep(250);
    clickToggle(videoType === 'Frames' ? 'Frames' : 'Ingredients');
    await sleep(230);
    clickToggle(desiredRatio === '9:16' ? 'crop_9_16' : 'crop_16_9');
    await sleep(230);

    const slider = document.querySelector(
      'flow-prompt-box-settings input.mdc-slider__input[aria-label="Length"]'
    );
    if (slider) {
      const targetVal = String(Math.max(0, Math.min(12, Math.round(desiredDurationSec) - 3)));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(slider, targetVal);
      else slider.value = targetVal;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(180);
    }

    clickToggle('x1');
    await sleep(220);

    document.querySelectorAll('.cdk-overlay-backdrop').forEach((b) => b.click());
    await sleep(220);
    if (document.querySelector('flow-prompt-box-settings')) {
      settingsBtn.click();
      await sleep(250);
    }

    return {
      ok: true,
      pillText: (document.querySelector('button.settings-trigger-button')?.textContent || '').trim(),
    };
  }

  function clearComposerChips() {
    const overlays = Array.from(
      document.querySelectorAll(
        'flow-ingredient-chip .hover-icon-overlay, flow-ingredient-chip mat-icon.hover-icon'
      )
    );
    let removed = 0;
    for (const el of overlays) {
      el.click();
      removed++;
    }
    return removed;
  }

  async function clickMatchedAssetItemAndAddToPrompt(matchedItem, addTrig, chipsBefore) {
    matchedItem.click();

    // Poll up to 3.5s for the detail view's "Add to prompt" button to appear
    let addToPromptBtn = null;
    for (let w = 0; w < 14; w++) {
      await sleep(250);
      addToPromptBtn = document.querySelector(
        '.cdk-overlay-container button.detail-add-to-prompt-btn'
      );
      if (addToPromptBtn && !addToPromptBtn.disabled) break;
    }

    if (!addToPromptBtn) {
      return false;
    }

    addToPromptBtn.click();

    // Poll up to 3.5s until a new <flow-ingredient-chip> actually mounts in <flow-ingredient-bar>
    let chipMounted = false;
    for (let w = 0; w < 14; w++) {
      await sleep(250);
      const nowChips = document.querySelectorAll('flow-ingredient-chip').length;
      if (nowChips > chipsBefore) {
        chipMounted = true;
        break;
      }
    }

    if (addTrig && addTrig.classList.contains('add-menu-trigger-active')) {
      addTrig.click();
      await sleep(250);
    }
    document.querySelectorAll('.cdk-overlay-backdrop').forEach((b) => b.click());

    // Wait until all mounted chips finish loading their thumbnail (aria-busy !== 'true')
    for (let w = 0; w < 24; w++) {
      const chipBtns = Array.from(
        document.querySelectorAll('flow-ingredient-chip button.chip-container')
      );
      if (
        chipBtns.length > chipsBefore &&
        chipBtns.every(
          (b) => b.getAttribute('aria-busy') !== 'true' && Boolean(b.querySelector('img.chip-image'))
        )
      ) {
        break;
      }
      await sleep(350);
    }

    return chipMounted || document.querySelectorAll('flow-ingredient-chip').length > chipsBefore;
  }

  async function tryAttachExistingAssetFromAddMenu(searchHints) {
    if (document.querySelector('flow-prompt-box-settings')) {
      const settingsBtn = document.querySelector('button.settings-trigger-button');
      if (settingsBtn) settingsBtn.click();
      await sleep(250);
    }

    const chipsBefore = document.querySelectorAll('flow-ingredient-chip').length;
    const addTrig = document.querySelector('button.add-menu-trigger');
    if (!addTrig) return { foundInLibrary: false, attached: false, uploadBtnCoords: null };

    if (!addTrig.classList.contains('add-menu-trigger-active')) {
      addTrig.click();
      await sleep(700);
    }

    Array.from(document.querySelectorAll('mat-dialog-container button'))
      .filter((b) => /agree|setuju/i.test(b.textContent || ''))
      .forEach((b) => b.click());

    // Wait up to 1.5s for asset-item list to render inside the popover
    let items = [];
    for (let w = 0; w < 6; w++) {
      items = Array.from(document.querySelectorAll('.cdk-overlay-container button.asset-item'));
      if (items.length > 0) break;
      await sleep(250);
    }

    const matchedItem = items.find((btn) => {
      const t = (btn.textContent || '').toLowerCase();
      return searchHints.some((h) => h && t.includes(String(h).toLowerCase()));
    });

    if (matchedItem) {
      const attached = await clickMatchedAssetItemAndAddToPrompt(matchedItem, addTrig, chipsBefore);
      return { foundInLibrary: true, attached, uploadBtnCoords: null };
    }

    const uploadBtn = document.querySelector('.cdk-overlay-container button.sidebar-upload-btn');
    if (!uploadBtn) {
      return { foundInLibrary: false, attached: false, uploadBtnCoords: null };
    }
    const r = uploadBtn.getBoundingClientRect();
    return {
      foundInLibrary: false,
      attached: false,
      uploadBtnCoords: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    };
  }

  async function finishAddMenuUploadAndAttach(searchHints, chipsBefore) {
    // 1. Wait for upload & "Rights to use this image" ("I agree") dialog if shown
    for (let w = 0; w < 6; w++) {
      await sleep(500);
      const agreeBtns = Array.from(document.querySelectorAll('mat-dialog-container button')).filter(
        (b) => /agree|setuju/i.test(b.textContent || '')
      );
      if (agreeBtns.length > 0) {
        agreeBtns.forEach((b) => b.click());
        await sleep(1000);
        break;
      }
    }

    const addTrig = document.querySelector('button.add-menu-trigger');

    // 2. Poll up to 12s: if Upload media closed the '+' Add Menu without mounting the chip,
    // re-open '+' Add Menu, find the newly uploaded asset in the library, and click "Add to prompt"!
    for (let w = 0; w < 20; w++) {
      const nowChips = document.querySelectorAll('flow-ingredient-chip').length;
      if (nowChips > chipsBefore) {
        break;
      }

      const agreeBtns = Array.from(document.querySelectorAll('mat-dialog-container button')).filter(
        (b) => /agree|setuju/i.test(b.textContent || '')
      );
      if (agreeBtns.length > 0) {
        agreeBtns.forEach((b) => b.click());
        await sleep(900);
      }

      let items = Array.from(
        document.querySelectorAll('.cdk-overlay-container button.asset-item')
      );

      // Crucial fix: clicking "Upload media" closes the '+' popover! Re-open it once the upload settles.
      if (items.length === 0 && addTrig && w >= 2) {
        if (!addTrig.classList.contains('add-menu-trigger-active')) {
          addTrig.click();
          await sleep(750);
          items = Array.from(
            document.querySelectorAll('.cdk-overlay-container button.asset-item')
          );
        }
      }

      const matchedItem = items.find((btn) => {
        const t = (btn.textContent || '').toLowerCase();
        return searchHints.some((h) => h && t.includes(String(h).toLowerCase()));
      });

      if (matchedItem) {
        const attached = await clickMatchedAssetItemAndAddToPrompt(
          matchedItem,
          addTrig,
          chipsBefore
        );
        if (attached) break;
      }

      await sleep(600);
    }

    if (addTrig && addTrig.classList.contains('add-menu-trigger-active')) {
      addTrig.click();
      await sleep(300);
    }
    document.querySelectorAll('.cdk-overlay-backdrop').forEach((b) => b.click());

    for (let w = 0; w < 24; w++) {
      const chipBtns = Array.from(
        document.querySelectorAll('flow-ingredient-chip button.chip-container')
      );
      if (
        chipBtns.length > chipsBefore &&
        chipBtns.every(
          (b) => b.getAttribute('aria-busy') !== 'true' && Boolean(b.querySelector('img.chip-image'))
        )
      ) {
        return { ok: true, chipCount: chipBtns.length };
      }
      await sleep(400);
    }

    return { ok: true, chipCount: document.querySelectorAll('flow-ingredient-chip').length };
  }

  function preparePromptBoxForInsert() {
    closeAllOverlays();

    const allNodes = queryAllDeep(document.documentElement);
    const target = findPromptElement(allNodes);
    if (!target) return { ok: false };

    target.focus();

    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const proto =
        target.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(target, '');
      else target.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true, mode: 'textarea' };
    }

    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    return { ok: true, mode: 'prosemirror' };
  }

  function clickLastGenBtnFallback() {
    const directGen =
      document.querySelector(
        'flow-generate-icon-button button.generate-icon-button, button.generate-icon-button[type="submit"]'
      ) || window.__DIKA_LAST_GEN_BTN__;
    if (directGen) {
      directGen.click();
      return true;
    }
    return false;
  }

  async function fetchVideoAsDataUrl(targetSrc) {
    try {
      const res = await fetch(targetSrc, { credentials: 'include' });
      if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
      const blob = await res.blob();
      if (!blob || blob.size < 15000) return { ok: false, error: 'Blob too small' };
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
      return { ok: true, dataUrl };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  function findDownloadButtonForVideo(targetSrc) {
    const allNodes = queryAllDeep(document.documentElement);
    const vEl = allNodes.find(
      (n) => n.tagName === 'VIDEO' && (n.currentSrc === targetSrc || n.src === targetSrc)
    );
    if (!vEl) return { found: false };
    const vr = vEl.getBoundingClientRect();

    for (const el of allNodes) {
      const tag = el.tagName;
      const role = el.getAttribute && el.getAttribute('role');
      if (tag !== 'BUTTON' && tag !== 'A' && role !== 'button') continue;
      const r = el.getBoundingClientRect();
      if (!isVisibleRect(r, 18, 18)) continue;
      if (
        r.left < vr.left - 120 ||
        r.right > vr.right + 160 ||
        r.top < vr.top - 120 ||
        r.bottom > vr.bottom + 160
      ) {
        continue;
      }
      const aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').trim();
      const title = ((el.getAttribute && el.getAttribute('title')) || '').trim();
      const txt = (el.textContent || '').trim();
      const comb = (aria + ' ' + title + ' ' + txt).trim();
      if (/\b(download|unduh|save_alt|file_download)\b/i.test(comb)) {
        return {
          found: true,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        };
      }
    }
    return { found: false };
  }

  window.__DIKA_FLOW_CDP__ = {
    version: 10,
    updateHud,
    closeAllOverlays,
    inspectFlowPage,
    configureFlowVideoSettings,
    clearComposerChips,
    tryAttachExistingAssetFromAddMenu,
    finishAddMenuUploadAndAttach,
    preparePromptBoxForInsert,
    clickLastGenBtnFallback,
    fetchVideoAsDataUrl,
    findDownloadButtonForVideo,
  };
  return true;
})();
