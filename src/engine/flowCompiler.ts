import {
  CharacterAsset,
  ContinuityMode,
  FlowModelMode,
  ProductAsset,
  SceneClip,
  StudioProject,
} from '../types/studio';
import {
  CAMERA_STYLES,
  HOOK_PRESETS,
  INGREDIENT_BINDINGS,
  LIGHTING_PRESETS,
  PERSONAS,
  REALISM_LOCKS,
  SCENE_LOCATIONS,
  SHOT_TYPES,
  STORY_ARCS,
  TONE_PRESETS,
} from './presets';
import {
  ANTI_BUG_LOCKS,
  auditSceneAntiBug,
  normalizeIndonesianForSpeech,
  ParsedScriptSegment,
  parseScriptBlock,
  sanitizeUserActionDirection,
  scrubVisualPromptTriggers,
} from './antiBugEngine';

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function countSpokenWords(text: string): number {
  if (!text.trim()) return 0;
  return countWords(normalizeIndonesianForSpeech(text));
}

export function getProjectMaxClipSec(
  project?: Pick<StudioProject, 'flowModel' | 'maxClipDurationSec'>
): number {
  if (project?.maxClipDurationSec && project.maxClipDurationSec >= 3) {
    return Math.min(15, project.maxClipDurationSec);
  }
  if (project?.flowModel === 'veo_8') return 8;
  return 15; // Default: Gemini Omni Flash (3s - 15s native)
}

export function estimateClipCountForProject(
  project: Pick<StudioProject, 'targetDurationSec' | 'flowModel' | 'maxClipDurationSec'>
): number {
  const target = Math.max(3, project.targetDurationSec || 30);
  const mode: FlowModelMode = project.flowModel || 'omni_flash_15';
  const maxClip = getProjectMaxClipSec(project);

  if (mode === 'omni_hybrid') {
    if (target <= 15) return target <= 10 ? 1 : 2; // e.g., 6s Hook + 9s Body/CTA
    const remainingAfterHook = Math.max(0, target - 6);
    return 1 + Math.ceil(remainingAfterHook / Math.min(15, maxClip));
  }

  return Math.max(1, Math.ceil(target / maxClip));
}

/**
 * Estimates spoken Indonesian duration using phonetic-expanded words (~1.85 words/sec)
 * + 1.4s calm breathing cushion at the end so speech NEVER rushes or clips at clip end!
 */
export function estimateClipSeconds(dialogue: string, maxClipSec = 15): number {
  const minSec = maxClipSec > 8 ? 5 : 5;
  const spoken = normalizeIndonesianForSpeech(dialogue);
  const words = countWords(spoken);
  if (words === 0) return Math.min(maxClipSec, 6);
  const raw = Math.ceil(words / 1.85 + 1.4);
  return Math.max(minSec, Math.min(maxClipSec, raw));
}

export function getMaxSafeWords(maxClipSec = 15): number {
  // ~25 spoken words for 15s Omni Flash (~13.5s speech + 1.5s calm end cushion), ~12 words for 8s Veo
  return Math.max(6, Math.floor((maxClipSec - 1.4) * 1.85));
}

export function getWordBudgetStatus(
  dialogue: string,
  maxClipSec = 15
): {
  words: number;
  level: 'ok' | 'warn' | 'over';
  label: string;
} {
  const spoken = normalizeIndonesianForSpeech(dialogue);
  const words = countWords(spoken);
  if (words === 0) {
    return { words: 0, level: 'ok', label: 'Visual / Tanpa Dialog' };
  }
  const safeMax = getMaxSafeWords(maxClipSec);
  const warnMax = safeMax + (maxClipSec >= 12 ? 4 : 3);
  const estSec = Math.min(99, Math.ceil(words / 1.85 + 1.4));

  if (words <= safeMax) {
    return {
      words,
      level: 'ok',
      label: `🛡️ Aman (${words} kata ucap • ~${estSec}s / maks ${maxClipSec}s)`,
    };
  }
  if (words <= warnMax) {
    return {
      words,
      level: 'warn',
      label: `⚠️ Agak Padat (${words} kata ucap • ~${estSec}s)`,
    };
  }
  return {
    words,
    level: 'over',
    label: `⛔ Rawan Kepotong (${words} kata ucap • ~${estSec}s > ${maxClipSec}s! Belah klip)`,
  };
}

/**
 * Splits any short or long script (10s single-clip up to 5+ minutes) into Google Flow scenes
 * respecting Omni Flash (up to 15s / ~30 words) or Hybrid (Hook 6s + Body 15s) or Veo (8s / ~15 words)!
 */
export function autoSplitScriptToScenes(
  rawScript: string,
  project: Pick<
    StudioProject,
    'contentMode' | 'targetDurationSec' | 'productId' | 'flowModel' | 'maxClipDurationSec'
  >
): SceneClip[] {
  const cleaned = rawScript.trim();
  if (!cleaned) return [];

  const mode: FlowModelMode = project.flowModel || 'omni_flash_15';
  const maxClipSec = getProjectMaxClipSec(project);
  const bodyMaxWords = getMaxSafeWords(maxClipSec);
  const hookMaxWords = mode === 'omni_hybrid' ? 13 : bodyMaxWords;

  const hasProduct = Boolean(project.productId);
  let chunks: { beat?: string; text: string; parsed?: ParsedScriptSegment }[] = [];

  // 1. Check if user pasted structured [SCENE 1] / Scene 1: blocks (supports Aksi: + Dialog:/VO:!)
  const sceneBlockRegex = /(?:^|\n)\s*(?:\[?\s*SCENE\s*\d+[^\n\]]*\]?|Scene\s*\d+\s*[:—-])\s*/gi;
  if (sceneBlockRegex.test(cleaned)) {
    const headers = Array.from(
      cleaned.matchAll(/(?:^|\n)\s*(\[?\s*SCENE\s*\d+[^\n\]]*\]?|Scene\s*\d+\s*[:—-][^\n]*)/gi)
    );
    const parts = cleaned
      .split(/(?:^|\n)\s*(?:\[?\s*SCENE\s*\d+[^\n\]]*\]?|Scene\s*\d+\s*[:—-][^\n]*)\s*/i)
      .filter((p) => p.trim().length > 0);

    parts.forEach((part, idx) => {
      const headerRaw = headers[idx]?.[1]?.replace(/[\[\]]/g, '').trim() || '';
      const beatPart = headerRaw.replace(/^scene\s*\d+\s*[:—-]?\s*/i, '').trim();
      const limitWords = idx === 0 ? hookMaxWords : bodyMaxWords;
      const parsed = parseScriptBlock(part.trim(), hasProduct);

      if (!parsed.rawDialogue) {
        chunks.push({
          beat: beatPart || 'Visual B-Roll',
          text: '',
          parsed,
        });
        return;
      }

      const subChunks = splitLongTextByWordBudget(parsed.rawDialogue, limitWords);
      subChunks.forEach((sc, sIdx) => {
        chunks.push({
          beat: beatPart
            ? subChunks.length > 1
              ? `${beatPart} (${sIdx + 1})`
              : beatPart
            : undefined,
          text: sc,
          parsed,
        });
      });
    });
  } else {
    // 2. Check if user wrote Inline "(Gerakan) Kalimat" or unnumbered "Aksi: / Dialog: / VO:" blocks
    const blockNormalized = cleaned
      .replace(/\n(?=\s*\([^)]{3,180}\)\s*\S)/g, '\n\n')
      .replace(/\n(?=\s*(?:[-•*]\s*)?(?:aksi|visual|gerakan|pose|model)\s*[:—-])/gi, '\n\n');

    const rawBlocks = blockNormalized
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean);

    const parsedBlocks = rawBlocks.map((b) => parseScriptBlock(b, hasProduct));
    const hasStructuredDirections = parsedBlocks.some(
      (pb) => Boolean(pb.rawAction) || Boolean(pb.speechModeOverride)
    );

    if (hasStructuredDirections) {
      parsedBlocks.forEach((pb, idx) => {
        const limitWords = idx === 0 ? hookMaxWords : bodyMaxWords;
        if (!pb.rawDialogue) {
          chunks.push({ beat: 'Visual B-Roll', text: '', parsed: pb });
          return;
        }
        const sub = splitLongTextByWordBudget(pb.rawDialogue, limitWords);
        sub.forEach((s) => chunks.push({ text: s, parsed: pb }));
      });
    } else {
      // 3. Pure Narration: plain paragraph / natural sentence splitting
      const fullText = cleaned
        .split(/\n+/)
        .map((p) => p.replace(/^[-•*\d.)]+\s*/, '').trim())
        .filter(Boolean)
        .join(' ');

      if (mode === 'omni_hybrid' && countSpokenWords(fullText) > hookMaxWords + 4) {
        const firstSplit = splitFirstHookChunk(fullText, hookMaxWords);
        chunks.push({ beat: 'Hook Cepat', text: firstSplit.hook });
        if (firstSplit.rest) {
          const bodyParts = splitLongTextByWordBudget(firstSplit.rest, bodyMaxWords);
          bodyParts.forEach((b) => chunks.push({ text: b }));
        }
      } else {
        const paragraphs = cleaned
          .split(/\n+/)
          .map((p) => p.replace(/^[-•*\d.)]+\s*/, '').trim())
          .filter(Boolean);

        for (const para of paragraphs) {
          const sub = splitLongTextByWordBudget(para, bodyMaxWords);
          sub.forEach((s) => chunks.push({ text: s }));
        }
      }
    }
  }

  const total = chunks.length;
  return chunks.map((chunk, index) => {
    const num = index + 1;
    const defaultMeta = pickSceneDefaults(index, total, project.contentMode, hasProduct);
    const parsed = chunk.parsed;
    const speechMode = parsed?.speechModeOverride || defaultMeta.speechMode;
    const shotType = parsed?.shotTypeOverride || defaultMeta.shotType;
    const estDur =
      speechMode === 'silent_broll' && !chunk.text
        ? Math.min(maxClipSec, 6)
        : estimateClipSeconds(chunk.text, maxClipSec);

    return {
      id: `sc_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      sceneNumber: num,
      beatLabel: chunk.beat || defaultMeta.beatLabel,
      durationSec: estDur,
      dialogue: chunk.text,
      speechMode,
      shotType,
      actionDirection: parsed?.sanitizedActionEn || defaultMeta.actionDirection,
      gesture: parsed?.sanitizedGestureEn || defaultMeta.gesture,
      continuityMode:
        speechMode === 'silent_broll' ? 'broll_visual' : defaultMeta.continuityMode,
      trimStartSec: 0.05,
      trimEndSec: 0.1,
    };
  });
}

function splitFirstHookChunk(text: string, maxHookWords: number): { hook: string; rest: string } {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length > 1 && countSpokenWords(sentences[0]) <= maxHookWords + 3) {
    return {
      hook: sentences[0].trim(),
      rest: sentences.slice(1).join(' ').trim(),
    };
  }
  const words = text.split(/\s+/);
  return {
    hook: words.slice(0, maxHookWords).join(' '),
    rest: words.slice(maxHookWords).join(' '),
  };
}

function splitLongTextByWordBudget(text: string, maxWords: number): string[] {
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const result: string[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim()) {
      result.push(buffer.trim());
      buffer = '';
    }
  };

  for (const sentence of sentences) {
    const sWords = countSpokenWords(sentence);
    const bWords = countSpokenWords(buffer);

    if (sWords > maxWords) {
      flush();
      const clauses = sentence.split(
        /(?<=[,;—–])\s+|\s+(?=tapi\s|karena\s|padahal\s|terus\s|sampai\s|jadinya\s|makanya\s)/i
      );
      let cBuf = '';
      for (const cl of clauses) {
        if (countSpokenWords(cBuf) + countSpokenWords(cl) <= maxWords) {
          cBuf = cBuf ? `${cBuf} ${cl}` : cl;
        } else {
          if (cBuf) result.push(cBuf.trim());
          if (countSpokenWords(cl) <= maxWords) {
            cBuf = cl;
          } else {
            const words = cl.split(/\s+/);
            const rawStep = Math.max(5, maxWords - 3);
            for (let i = 0; i < words.length; i += rawStep) {
              const slice = words.slice(i, i + rawStep).join(' ');
              if (i + rawStep >= words.length) {
                cBuf = slice;
              } else {
                result.push(slice);
              }
            }
          }
        }
      }
      if (cBuf.trim()) result.push(cBuf.trim());
    } else if (bWords + sWords <= maxWords) {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    } else {
      flush();
      buffer = sentence;
    }
  }
  flush();
  return result;
}

function pickSceneDefaults(
  index: number,
  total: number,
  mode: 'ugc' | 'storytelling',
  hasProduct: boolean
): {
  beatLabel: string;
  shotType: string;
  actionDirection: string;
  gesture: string;
  continuityMode: ContinuityMode;
  speechMode: 'lip_sync' | 'voice_over' | 'silent_broll';
} {
  if (total === 1) {
    return {
      beatLabel: mode === 'ugc' ? 'Single-Take Utuh (Anti-Bug Anchor)' : 'Single-Take Cerita Utuh',
      shotType: hasProduct ? 'show_product' : 'talking_head',
      actionDirection: hasProduct
        ? 'speaks calmly and warmly to the camera while holding the product steadily at lower-chest height from frame zero without blocking their face'
        : 'delivers the story calmly to the lens with natural facial micro-expressions and anchored posture',
      gesture: 'gentle natural head micro-nod and steady eye contact',
      continuityMode: 'ingredients',
      speechMode: 'lip_sync',
    };
  }

  if (mode === 'ugc') {
    if (index === 0) {
      return {
        beatLabel: total === 2 ? 'Pembuka + Masalah' : 'Pembuka (Safe Chest-Up)',
        shotType: 'talking_head',
        actionDirection:
          'speaks directly and naturally to the lens with expressive eyes and calm anchored chest-up posture, hands resting still below frame',
        gesture: 'subtle natural head nod while speaking',
        continuityMode: 'ingredients',
        speechMode: 'lip_sync',
      };
    }
    if (index === total - 1) {
      return {
        beatLabel: total === 2 ? 'Bukti Produk + Penutup' : 'Penutup Tenang',
        shotType: hasProduct ? 'show_product' : 'talking_head',
        actionDirection: hasProduct
          ? 'holds the product steadily with a calm static grip at lower-chest height from frame zero while delivering a relaxed closing recommendation to the lens'
          : 'delivers the closing sentence warmly and calmly to the camera with steady anchored posture',
        gesture: 'warm natural gentle smile for the final second',
        continuityMode: 'ingredients',
        speechMode: 'lip_sync',
      };
    }
    if (index === 1 && hasProduct) {
      return {
        beatLabel: 'Tampil Produk Statis (0.0s Anchor)',
        shotType: 'show_product',
        actionDirection:
          'is already holding the product steadily near lower-chest level from frame zero so its details stay clearly visible while speaking calmly to the lens',
        gesture: 'glances briefly once at the product then back to lens without spinning it',
        continuityMode: 'ingredients',
        speechMode: 'lip_sync',
      };
    }
    return {
      beatLabel: `Detail & Bukti #${index}`,
      shotType: hasProduct && index % 2 === 0 ? 'closeup_proof' : 'over_shoulder',
      actionDirection:
        hasProduct && index % 2 === 0
          ? 'holds the product steadily in frame from frame zero showing real surface texture and build quality with minimal calm hand motion'
          : 'speaks calmly from a steady three-quarter candid angle with relaxed anchored posture',
      gesture: 'calm steady posture without sudden movement',
      continuityMode: 'ingredients',
      speechMode: hasProduct && index % 2 === 0 ? 'voice_over' : 'lip_sync',
    };
  }

  // Storytelling Mode
  if (index === 0) {
    return {
      beatLabel: 'Pembuka Cerita (Setup)',
      shotType: 'talking_head',
      actionDirection:
        'speaks naturally to the lens from a calm anchored posture, drawing the viewer in with genuine facial expression',
      gesture: 'natural breathing and steady eye contact',
      continuityMode: 'ingredients',
      speechMode: 'lip_sync',
    };
  }
  if (index === total - 1) {
    return {
      beatLabel: 'Klimaks & Penutup',
      shotType: 'story_emotion',
      actionDirection:
        'delivers the final resolution calmly with genuine subtle facial micro-expressions and steady posture',
      gesture: 'holds a calm gentle expression for the final second',
      continuityMode: 'ingredients',
      speechMode: 'lip_sync',
    };
  }
  const storyShots = ['talking_head', 'over_shoulder', 'story_emotion'];
  return {
    beatLabel: `Babak Cerita #${index + 1}`,
    shotType: storyShots[index % storyShots.length],
    actionDirection: 'continues speaking naturally in the space from a calm anchored posture',
    gesture: 'expressive eyes and minimal natural head movement',
    continuityMode: 'ingredients',
    speechMode: 'lip_sync',
  };
}

/**
 * Compiles the zero-API-key Master Script Prompt dynamically adapting to
 * Omni Flash (up to 15s/clip), Omni Hybrid (6s Hook + 15s Body), or Veo (8s/clip)!
 */
export function compileMasterScriptPrompt(
  project: StudioProject,
  character?: CharacterAsset,
  product?: ProductAsset
): string {
  const mode: FlowModelMode = project.flowModel || 'omni_flash_15';
  const maxClipSec = getProjectMaxClipSec(project);
  const clipCount = estimateClipCountForProject(project);
  const maxWords = getMaxSafeWords(maxClipSec);
  const minWords = Math.max(8, Math.floor(maxWords * 0.65));

  const persona = PERSONAS.find((p) => p.id === project.personaId) || PERSONAS[0];
  const tone = TONE_PRESETS.find((t) => t.id === project.toneId) || TONE_PRESETS[0];
  const hook = HOOK_PRESETS.find((h) => h.id === project.hookId) || HOOK_PRESETS[0];
  const storyArc = STORY_ARCS.find((a) => a.id === project.storyArcId) || STORY_ARCS[0];

  const modelNameLabel =
    mode === 'veo_8'
      ? `Google Flow Veo (maks ${maxClipSec} detik/klip)`
      : mode === 'omni_hybrid'
      ? `Google Flow Omni Flash Hybrid (Hook cepat ~6 detik + Isi utuh hingga ${maxClipSec} detik/klip)`
      : `Google Flow Omni Flash (mendukung hingga ${maxClipSec} detik penuh per klip!)`;

  const sections: string[] = [];

  sections.push(
    `# PERAN UTAMA\nKamu adalah Creative Director & Scriptwriter spesialis video ${
      project.contentMode === 'ugc'
        ? 'UGC (User Generated Content) konversi tinggi'
        : 'Storytelling / Mini-Drama viral'
    } untuk produksi di **${modelNameLabel}** dengan total target durasi **${project.targetDurationSec} detik** (${clipCount} klip).`
  );

  sections.push(
    `# ATURAN ANTI-TULISAN AI (WAJIB PATUH 100%)\n` +
      `- DILARANG KERAS membuka dengan kalimat klise AI ("Di era sekarang...", "Pernahkah Anda merasa...", "Halo teman-teman semuanya!").\n` +
      `- DILARANG KERAS menutup dengan simpulan kaku ("Jadi kesimpulannya...", "Dengan demikian..."). Tutup langsung dengan kalimat terakhir yang nempel atau CTA natural.\n` +
      `- Gunakan Bahasa Indonesia lisan sehari-hari yang enak diucapkan mulut manusia asli.\n` +
      `- Variasikan ritme kalimat. Boleh sisipkan partikel lisan wajar ("sih", "kan", "tuh", "nih") secukupnya.`
  );

  sections.push(
    `# KARAKTER & TONE SUARA\n` +
      `- Karakter Pembawa: ${
        character
          ? `${character.name} (${character.demographic}, gaya bicara: ${character.speakingStyle || 'natural santai'})`
          : 'Kreator Indonesia natural'
      }\n` +
      `- Persona Audiens: ${
        persona.id === 'custom'
          ? project.customPersona || 'Audiens umum Indonesia'
          : `${persona.label} — ${persona.note}`
      }\n` +
      `- Tone Bahasa: ${tone.label} — ${tone.rule}`
  );

  if (project.contentMode === 'ugc') {
    sections.push(
      `# DATA PRODUK & ANTI-HALUSINASI (PRINSIP: BUKTI DULU, KLAIM BELAKANGAN)\n` +
        `- Nama Produk: ${product?.name || '(Sesuaikan dengan topik)'}\n` +
        `- Kategori: ${product?.category || '-'}\n` +
        `- Fakta / Spek Valid (BOLEH DISEBUT): ${
          product?.verifiedSpecs ||
          '(Hanya sebut manfaat logis dari pain point, jangan mengarang angka/garansi/harga)'
        }\n` +
        `- Klaim Terlarang (JANGAN DIUCAPKAN): ${
          product?.bannedClaims ||
          'Jangan klaim "paling murah", "nomor 1", "anti rusak selamanya", atau mengarang angka uji yang tidak ada datanya.'
        }\n` +
        `- Masalah Utama (Pain Point): ${
          project.painPointOrPremise || 'Masalah nyata yang dialami pengguna sebelum pakai produk ini'
        }\n` +
        `- Gaya Hook Awal: ${hook.label} — ${hook.rule}\n` +
        `- Arah CTA Akhir: ${project.ctaText || 'Cek keranjang / detail produknya dulu sebelum kehabisan'}`
    );
  } else {
    sections.push(
      `# PREMIS & STRUKTUR STORYTELLING\n` +
        `- Premis / Ide Cerita: ${project.painPointOrPremise || 'Cerita kejadian menarik dan relatable'}\n` +
        `- Struktur Alur: ${storyArc.label} — ${storyArc.structure}\n` +
        `- Gaya Hook Pembuka: ${hook.label} — ${hook.rule}\n` +
        `- Kalimat Penutup / Pancingan Komentar: ${
          project.ctaText || 'Kalau lu di posisi itu, lu bakal gimana?'
        }`
    );
  }

  if (mode === 'omni_hybrid' && clipCount >= 2) {
    sections.push(
      `# ATURAN DURASI OMNI FLASH HYBRID (KRUSIAL!)\n` +
        `- Pecah naskah menjadi TEPAT **${clipCount} SCENE**.\n` +
        `- **SCENE 1 (Hook Cepat ~5-6 detik)**: WAJIB singkat & nendang, hanya **10–13 kata** agar visual cepat pindah sebelum penonton scroll.\n` +
        `- **SCENE 2 s/d SCENE ${clipCount} (Omni Flash hingga ${maxClipSec} detik)**: Manfaatkan durasi panjang Omni Flash (${minWords}–${maxWords} kata Bahasa Indonesia per scene) supaya penjelasan produk/cerita mengalir utuh tanpa terpotong-potong!`
    );
  } else {
    sections.push(
      `# ATURAN DURASI KLIP (${maxClipSec} DETIK PER SCENE — KRUSIAL!)\n` +
        `- Pecah naskah menjadi TEPAT **${clipCount} SCENE**.\n` +
        `- Setiap scene berdurasi hingga **${maxClipSec} detik**, jadi tulis sekitar **${minWords} sampai maksimal ${maxWords} kata Bahasa Indonesia per scene** agar pengucapan natural selesai pas dan tidak terpotong di ujung klip.`
    );
  }

  const exampleLines = Array.from({ length: Math.min(clipCount, 4) }, (_, idx) => {
    const label =
      clipCount === 1
        ? 'Full 15s Single-Take (Hook + Isi + CTA)'
        : project.contentMode === 'ugc'
        ? ['Hook & Masalah', 'Tampil Produk Statis', 'Detail & Bukti', 'Penutup / CTA'][idx] ||
          `Scene ${idx + 1}`
        : ['Setup', 'Konflik', 'Klimaks', 'Resolusi'][idx] || `Scene ${idx + 1}`;
    const wordHint =
      mode === 'omni_hybrid' && idx === 0
        ? '10-13 kata hook tajam'
        : `${minWords}-${maxWords} kata lisan natural`;
    const safeActionHint =
      idx === 0
        ? 'Duduk santai ngobrol ke kamera, ekspresi relatable, tangan diam di bawah frame'
        : idx === 1 && project.contentMode === 'ugc'
        ? 'Sudah memegang produk dengan tenang di depan dada sejak awal klip sambil bicara ke kamera'
        : idx === 2 && project.contentMode === 'ugc'
        ? 'Close-up tangan memegang produk dengan tenang menunjukkan tekstur asli kemasan'
        : 'Pegang produk tenang di depan dada sambil senyum hangat ke kamera';
    const audioTag = idx === 2 && clipCount >= 4 && project.contentMode === 'ugc' ? 'VO' : 'Dialog';
    return `[SCENE ${idx + 1} - ${label}]\nAksi: ${safeActionHint}\n${audioTag}: (Tulis kalimat lisan ${wordHint} di sini)`;
  }).join('\n\n');

  sections.push(
    `# ATURAN GERAKAN MODEL ANTI-BUG GOOGLE FLOW (WAJIB PATUH!)\n` +
      `- Di baris "Aksi:", tulis 1 pose/gerakan yang TENANG & REALISTIS (seperti duduk/berdiri santai, ekspresi wajah, atau sudah memegang produk di depan dada sejak detik pertama).\n` +
      `- DILARANG menulis gerakan rawan glitch AI: jangan suruh model mengambil barang dari luar layar di tengah klip, membuka tutup botol, menyemprot cairan, atau mengoles krim ke wajah.\n` +
      `- Gunakan label "Dialog:" jika model berbicara langsung ke kamera (Lip-Sync), atau "VO:" jika adegan berupa Close-Up produk (Voice-Over).`
  );

  sections.push(
    `# FORMAT OUTPUT WAJIB (${clipCount} SCENE — TANPA TEKS PEMBUKA/PENUTUP LAIN)\n${exampleLines}${
      clipCount > 4 ? `\n\n...lanjutkan sampai [SCENE ${clipCount}]` : ''
    }`
  );

  return sections.join('\n\n');
}

/**
 * Builds an ironclad, zero-spawn, single-anchored-pose action line (NO bracketed timestamps like [0s-5s]
 * which cause text leakage, and NO mid-clip object spawning which causes floating/morphing glitches!).
 */
function buildDynamicActionLine(
  baseAction: string,
  gesture: string,
  _durationSec: number,
  productName?: string,
  productVisiblyHeld?: boolean,
  speechMode: 'lip_sync' | 'voice_over' | 'silent_broll' = 'lip_sync'
): string {
  const sanitized = sanitizeUserActionDirection(
    baseAction,
    Boolean(productName && productVisiblyHeld),
    productName,
    speechMode
  );
  const cleanAction =
    sanitized.actionEn ||
    scrubVisualPromptTriggers(baseAction) ||
    'speaks calmly and naturally to the lens from a relaxed anchored posture';
  const cleanGesture = scrubVisualPromptTriggers(gesture || sanitized.gestureEn);
  const gesturePart =
    cleanGesture && !cleanAction.toLowerCase().includes(cleanGesture.toLowerCase())
      ? `, ${cleanGesture}`
      : '';

  if (productName && productVisiblyHeld) {
    const alreadyMentionsZero = /0\.0s|frame zero/i.test(cleanAction);
    const holdAnchor = alreadyMentionsZero
      ? ''
      : ` while keeping the ${productName} steadily held in frame from 0.0s without spinning or tossing it`;
    return (
      `${cleanAction}${holdAnchor}${gesturePart}, ` +
      'then holds a calm natural gentle expression for the final 1 second after finishing the sentence.'
    );
  }

  return (
    `${cleanAction}${gesturePart}, keeping body and hands calm and grounded throughout, ` +
    'and holding a relaxed gentle expression for the final 1 second after finishing the sentence.'
  );
}

export function compileFlowScenePrompt(
  project: StudioProject,
  scene: SceneClip,
  prevScene: SceneClip | undefined,
  character?: CharacterAsset,
  product?: ProductAsset
): {
  prompt: string;
  spokenDialogue: string;
  antiBugWarnings: string[];
  flowModeBadge: string;
  requiredAttachments: {
    label: string;
    type: 'character' | 'product' | 'location' | 'last_frame';
    imageUrl?: string;
    filePath?: string;
  }[];
} {
  const locPreset =
    SCENE_LOCATIONS.find((s) => s.id === project.scenePresetId) || SCENE_LOCATIONS[0];
  const camPreset =
    CAMERA_STYLES.find((c) => c.id === project.cameraPresetId) || CAMERA_STYLES[0];
  const lightPreset =
    LIGHTING_PRESETS.find((l) => l.id === project.lightingPresetId) || LIGHTING_PRESETS[0];
  const shotPreset = SHOT_TYPES.find((s) => s.id === scene.shotType) || SHOT_TYPES[0];

  const isOmni = (project.flowModel || 'omni_flash_15') !== 'veo_8';
  const engineTag = isOmni ? `Omni Flash ${scene.durationSec}s` : `Veo ${scene.durationSec}s`;

  const locationDesc = scrubVisualPromptTriggers(
    scene.customLocationOverride?.trim() || project.customLocation?.trim() || locPreset.location
  );
  const lightingDesc =
    lightPreset.id === 'auto_scene' || !lightPreset.desc ? locPreset.lighting : lightPreset.desc;
  const ratioDesc =
    project.aspectRatio === '16:9'
      ? 'Horizontal 16:9 widescreen raw camera video'
      : project.aspectRatio === '9:16'
      ? 'Vertical 9:16 raw smartphone camera video'
      : `Aspect ratio ${project.aspectRatio} raw smartphone camera video`;

  const attachments: {
    label: string;
    type: 'character' | 'product' | 'location' | 'last_frame';
    imageUrl?: string;
    filePath?: string;
  }[] = [];

  const isFrameChain = scene.continuityMode === 'frame_chain' && scene.sceneNumber > 1;
  const isBroll = scene.continuityMode === 'broll_visual' || scene.speechMode === 'silent_broll';

  const isProductShot =
    scene.shotType === 'show_product' ||
    scene.shotType === 'hands_demo' ||
    scene.shotType === 'closeup_proof';

  const sceneMentionsProduct = Boolean(product) && (isProductShot || project.contentMode === 'ugc');

  const spokenDialogue = normalizeIndonesianForSpeech(scene.dialogue);
  const antiBugWarnings = isBroll
    ? []
    : auditSceneAntiBug(scene.dialogue, scene.durationSec, getProjectMaxClipSec(project)).warnings;

  const hasCharImage = Boolean(character?.imageUrl);
  const hasProdImage = Boolean(product?.imageUrl);
  const prodVisualRef = hasProdImage
    ? 'exact product shown in the attached product reference image'
    : product?.name || 'product';

  const dynamicAction = buildDynamicActionLine(
    scene.actionDirection,
    scene.gesture,
    scene.durationSec,
    prodVisualRef,
    Boolean(product) && isProductShot,
    scene.speechMode
  );

  if (isFrameChain) {
    attachments.push({
      label: `First Frame (Dari Frame Terakhir Scene ${scene.sceneNumber - 1})`,
      type: 'last_frame',
      imageUrl: prevScene?.lastFrameUrl,
      filePath: prevScene?.lastFramePath,
    });

    const lines: string[] = [
      `${ratioDesc}, Duration: ${scene.durationSec} seconds. Seamless direct single-take continuation from the attached starting frame image.`,
      '',
      'CONTINUITY LOCK (FRAMES-TO-VIDEO):',
      '- Use the attached image as the exact First Frame. Maintain 100% continuity of the person’s face, facial structure, skin texture, hair, outfit, lighting direction, and background space from frame 0.0s.',
      product && isProductShot
        ? `- ${ANTI_BUG_LOCKS.staticObjectAnchor(prodVisualRef)}`
        : '- Do not spawn any new objects, props, or people into the frame.',
      '',
      `CAMERA & FRAMING: ${shotPreset.prompt}. ${camPreset.desc}. Steady natural framing without sudden zoom or jump.`,
      '',
      `ACTION (${scene.durationSec}s): Continuing smoothly from the opening frame — ${dynamicAction}`,
      '',
      ANTI_BUG_LOCKS.stillBody,
      ANTI_BUG_LOCKS.cleanFrame,
      `Lighting: ${lightingDesc}.`,
      REALISM_LOCKS.videoRealism,
    ];

    if (spokenDialogue && scene.speechMode === 'lip_sync') {
      lines.push(
        '',
        ANTI_BUG_LOCKS.dryVoice,
        `DIALOGUE (spoken clearly in natural everyday Indonesian, steady unhurried native lip-sync): "${spokenDialogue}"`
      );
    } else if (spokenDialogue && scene.speechMode === 'voice_over') {
      lines.push(
        '',
        ANTI_BUG_LOCKS.dryVoice,
        `VOICEOVER (Indonesian natural off-camera voiceover — mouth stays naturally closed/relaxed while performing the action): "${spokenDialogue}"`
      );
    } else {
      lines.push('', ANTI_BUG_LOCKS.silentBrollAudio);
    }

    return {
      prompt: lines.join('\n'),
      spokenDialogue,
      antiBugWarnings,
      flowModeBadge: `${engineTag} • Frame-Chain🛡️`,
      requiredAttachments: attachments,
    };
  }

  // INGREDIENTS / REFERENCE MODE (Strict RAW Studio v3 rule: Image = Identity, Text = Action)
  const ingLines: string[] = [];
  const textConsistencyLines: string[] = [];
  const showCharInScene = Boolean(character) && !(isBroll && scene.shotType === 'closeup_proof');

  if (character && showCharInScene) {
    attachments.push({
      label: `Ingredient Karakter: ${character.name}`,
      type: 'character',
      imageUrl: character.imageUrl,
      filePath: character.filePath,
    });

    if (hasCharImage) {
      ingLines.push(`- ${INGREDIENT_BINDINGS.character}`);
      if (project.useOutfitIngredient) {
        ingLines.push(`- ${INGREDIENT_BINDINGS.outfit}`);
      } else if (character.defaultOutfit?.trim()) {
        textConsistencyLines.push(
          `WARDROBE: wearing ${character.defaultOutfit.trim()} consistently across scenes.`
        );
      }
    } else {
      textConsistencyLines.push(
        `CHARACTER DESIGN (keep consistent across scenes): ${[
          character.demographic,
          character.appearance,
          character.defaultOutfit ? `wearing ${character.defaultOutfit}` : '',
        ]
          .filter(Boolean)
          .join(', ')}.`
      );
    }
  }

  if (product && sceneMentionsProduct) {
    if (isProductShot) {
      attachments.push({
        label: `Ingredient Produk: ${product.name}`,
        type: 'product',
        imageUrl: product.imageUrl,
        filePath: product.filePath,
      });
    }

    if (hasProdImage) {
      if (isProductShot) {
        ingLines.push(`- ${INGREDIENT_BINDINGS.product.replace('{PRODUCT}', prodVisualRef)}`);
      } else {
        // Safe rule when user keeps Product image attached in Flow composer during 3-scene Auto-Queue:
        ingLines.push(
          `- OPTIONAL BACKGROUND PROP: if the attached product ingredient image is active in the project tray, keep it resting completely untouched on a nearby table surface or out of focus — do NOT float it or spawn it in the hands during this talking-head shot.`
        );
      }
    } else if (isProductShot) {
      textConsistencyLines.push(
        `OBJECT DETAILS: ${product.name}${
          product.visualDetails ? ` (${product.visualDetails})` : ''
        }.`
      );
    }
  }

  if (project.useLocationIngredient && project.locationImageUrl) {
    attachments.push({
      label: 'Ingredient Lokasi / Ruangan',
      type: 'location',
      imageUrl: project.locationImageUrl,
      filePath: project.locationImagePath,
    });
    ingLines.push(`- ${INGREDIENT_BINDINGS.location}`);
  }

  const subjectRef =
    character && showCharInScene
      ? hasCharImage
        ? 'the person from the character ingredient'
        : character.demographic || 'the subject'
      : 'a natural Indonesian person in casual everyday attire';

  const lines: string[] = [
    `${ratioDesc}, Duration: ${scene.durationSec} seconds. ${shotPreset.prompt}, ${camPreset.desc}.`,
  ];

  if (ingLines.length > 0) {
    lines.push('', 'INGREDIENTS (attached reference images):', ...ingLines, '', REALISM_LOCKS.ingRule);
  }
  if (textConsistencyLines.length > 0) {
    lines.push('', ...textConsistencyLines);
  }

  lines.push(
    '',
    `LOCATION: ${
      project.useLocationIngredient && project.locationImageUrl
        ? 'inside the exact space shown in the location ingredient'
        : locationDesc
    }.`,
    `ACTION (${scene.durationSec}s): ${
      scene.shotType === 'closeup_proof' && product
        ? `Steady close-up on the ${prodVisualRef} already held calmly in frame from 0.0s, ${dynamicAction}`
        : `${subjectRef} — ${dynamicAction}`
    }`
  );

  if (product && isProductShot) {
    lines.push('', ANTI_BUG_LOCKS.staticObjectAnchor(prodVisualRef));
  }
  lines.push(
    '',
    ANTI_BUG_LOCKS.stillBody,
    ANTI_BUG_LOCKS.cleanFrame,
    `Lighting: ${lightingDesc}.`,
    REALISM_LOCKS.videoRealism
  );

  const isDefaultSeedStyleWithCustomPhoto =
    hasCharImage &&
    (character?.id === 'char_budi' || character?.id === 'char_nadia') &&
    /tukang\/praktisi|bestie/i.test(character?.speakingStyle || '');

  const customSpeakingStyle =
    character?.speakingStyle && !isDefaultSeedStyleWithCustomPhoto
      ? `, ${scrubVisualPromptTriggers(character.speakingStyle)}`
      : '';

  if (!isBroll && spokenDialogue && scene.speechMode === 'lip_sync') {
    lines.push(
      '',
      ANTI_BUG_LOCKS.dryVoice,
      `DIALOGUE (spoken clearly in natural everyday Indonesian${customSpeakingStyle}, accurate relaxed native lip-sync across ${scene.durationSec}s): "${spokenDialogue}"`
    );
  } else if (spokenDialogue && scene.speechMode === 'voice_over') {
    lines.push(
      '',
      ANTI_BUG_LOCKS.dryVoice,
      `VOICEOVER (Indonesian natural off-camera voiceover — subject’s mouth stays naturally closed/relaxed while holding the pose): "${spokenDialogue}"`
    );
  } else {
    lines.push('', ANTI_BUG_LOCKS.silentBrollAudio);
  }

  return {
    prompt: lines.join('\n'),
    spokenDialogue,
    antiBugWarnings,
    flowModeBadge: `${engineTag} • Anti-Bug🛡️`,
    requiredAttachments: attachments,
  };
}

export function compileCharacterLabPrompt(
  mode: 'casting' | 'sheet18' | 'repair',
  params: {
    demographic?: string;
    face?: string;
    hair?: string;
    skinTone?: string;
    distinctive?: string;
    outfit?: string;
    vibe?: string;
  }
): string {
  if (mode === 'casting') {
    return JSON.stringify(
      {
        prompt_type: 'character_casting_master_portrait',
        output: 'Single frontal portrait, chest-up, eye-level smartphone camera, aspect ratio 3:4',
        character_design: {
          demographic: params.demographic || 'young Indonesian adult, mid 20s',
          face: params.face || 'natural relatable Indonesian facial features, warm approachable expression',
          hair: params.hair || 'natural dark hair with a few loose strands',
          skin_tone:
            (params.skinTone || 'natural Indonesian warm tan/olive skin') + ', ' + REALISM_LOCKS.skin,
          distinctive_feature:
            params.distinctive || 'subtle natural mole near cheek or distinctive friendly eyebrows',
          wardrobe: params.outfit || 'plain casual everyday t-shirt/shirt with real fabric texture',
          vibe: params.vibe || 'authentic relatable creator, NOT a polished runway model',
        },
        realism_lock: {
          face_details: REALISM_LOCKS.subject,
          camera: REALISM_LOCKS.cameraPhoto,
          lighting: 'soft natural side window daylight, gentle uneven falloff across face',
          background: 'softly blurred lived-in Indonesian room',
        },
        negative_prompt: REALISM_LOCKS.negPhoto,
      },
      null,
      2
    );
  }

  if (mode === 'sheet18') {
    return JSON.stringify(
      {
        image_generation_prompt: {
          composition: {
            type: '18-panel facial & angle consistency sheet',
            layout: 'Grid layout with 18 clean panels (3 columns x 6 rows), NO text or labels anywhere',
          },
          identity_lock: REALISM_LOCKS.identity + ' 100% identical person across all 18 panels.',
          skin_and_texture: REALISM_LOCKS.skin,
          wardrobe: params.outfit || 'simple plain crew-neck top, consistent across all panels',
          panels: [
            '1 Frontal neutral relaxed',
            '2 Frontal friendly smile',
            '3 Frontal talking mid-sentence',
            '4 45-degree three-quarter left',
            '5 90-degree profile left',
            '6 45-degree three-quarter right',
            '7 90-degree profile right',
            '8 Slight high-angle selfie look',
            '9 Slight low-angle candid look',
            '10 Surprised / curious hook expression',
            '11 Empathetic / relatable problem expression',
            '12 Confident nodding recommendation expression',
            '13 Waist-up holding invisible small object space',
            '14 Over-the-shoulder glance back',
            '15 Close-up eyes and eyebrows natural detail',
            '16 Close-up natural skin texture & cheek',
            '17 Side window warm lighting test',
            '18 Cozy warm night lamp lighting test',
          ],
          negative_prompt: REALISM_LOCKS.negPhoto + ', any text labels, inconsistent face between panels',
        },
      },
      null,
      2
    );
  }

  return (
    'Use the person in the attached image as the exact same character — preserve 100% of their face shape, eyes, nose, lips, hair, and identity.\n\n' +
    'Re-render as an authentic unedited smartphone photograph:\n' +
    '- Skin: ' +
    REALISM_LOCKS.skin +
    '\n' +
    '- Details: ' +
    REALISM_LOCKS.subject +
    '\n' +
    '- Camera: ' +
    REALISM_LOCKS.cameraPhoto +
    '\n' +
    '- Background: ' +
    REALISM_LOCKS.bg +
    '\n\nNegative: ' +
    REALISM_LOCKS.negPhoto
  );
}
