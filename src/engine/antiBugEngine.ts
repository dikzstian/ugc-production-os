// Ironclad Anti-Bug & Phonetic Speech Engine for Google Flow (Omni Flash & Veo)
// Eliminates: mid-clip object spawning, 6-finger pantomime gestures, leaked TikTok UI/text/timestamps,
// background music bleed, cut-off sentences, and English/robotic mispronunciation of Indonesian numbers & slang.

const SLANG_MAP: [RegExp, string][] = [
  [/\byg\b/gi, 'yang'],
  [/\bdgn\b/gi, 'dengan'],
  [/\bdg\b/gi, 'dengan'],
  [/\butk\b/gi, 'untuk'],
  [/\bbgt\b/gi, 'banget'],
  [/\bbngt\b/gi, 'banget'],
  [/\bgk\b/gi, 'nggak'],
  [/\bga\b/gi, 'nggak'],
  [/\bngga\b/gi, 'nggak'],
  [/\bgak\b/gi, 'nggak'],
  [/\bgw\b/gi, 'gue'],
  [/\bgua\b/gi, 'gue'],
  [/\bkrn\b/gi, 'karena'],
  [/\bkarna\b/gi, 'karena'],
  [/\btp\b/gi, 'tapi'],
  [/\bsdh\b/gi, 'udah'],
  [/\budh\b/gi, 'udah'],
  [/\bblm\b/gi, 'belum'],
  [/\bdlm\b/gi, 'dalam'],
  [/\bdr\b/gi, 'dari'],
  [/\bspt\b/gi, 'seperti'],
  [/\bjgn\b/gi, 'jangan'],
  [/\bklo\b/gi, 'kalau'],
  [/\bkl\b/gi, 'kalau'],
  [/\bsm\b/gi, 'sama'],
  [/\borg\b/gi, 'orang'],
  [/\bbrg\b/gi, 'barang'],
  [/\bdpt\b/gi, 'dapet'],
  [/\bpke\b/gi, 'pakai'],
  [/\bbkn\b/gi, 'bukan'],
  [/\bjd\b/gi, 'jadi'],
  [/\btrs\b/gi, 'terus'],
  [/\blgsg\b/gi, 'langsung'],
  [/\bmsh\b/gi, 'masih'],
  [/\baja\b/gi, 'aja'],
  [/\bcm\b/gi, 'cuma'],
  [/\bcma\b/gi, 'cuma'],
  [/\bhri\b/gi, 'hari'],
  [/\bthn\b/gi, 'tahun'],
  [/\bbln\b/gi, 'bulan'],
  [/\bdtk\b/gi, 'detik'],
  [/\bmnt\b/gi, 'menit'],
];

const BASIC_NUM_WORDS: Record<number, string> = {
  0: 'nol',
  1: 'satu',
  2: 'dua',
  3: 'tiga',
  4: 'empat',
  5: 'lima',
  6: 'enam',
  7: 'tujuh',
  8: 'delapan',
  9: 'sembilan',
  10: 'sepuluh',
  11: 'sebelas',
};

export function numberToIndonesianWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999999999) return String(n);
  const int = Math.floor(n);
  if (int <= 11) return BASIC_NUM_WORDS[int];
  if (int < 20) return `${BASIC_NUM_WORDS[int - 10]} belas`;
  if (int < 100) {
    const tens = Math.floor(int / 10);
    const rem = int % 10;
    return `${BASIC_NUM_WORDS[tens]} puluh${rem ? ' ' + BASIC_NUM_WORDS[rem] : ''}`;
  }
  if (int < 200) {
    const rem = int - 100;
    return `seratus${rem ? ' ' + numberToIndonesianWords(rem) : ''}`;
  }
  if (int < 1000) {
    const hundreds = Math.floor(int / 100);
    const rem = int % 100;
    return `${BASIC_NUM_WORDS[hundreds]} ratus${rem ? ' ' + numberToIndonesianWords(rem) : ''}`;
  }
  if (int < 2000) {
    const rem = int - 1000;
    return `seribu${rem ? ' ' + numberToIndonesianWords(rem) : ''}`;
  }
  if (int < 1000000) {
    const thousands = Math.floor(int / 1000);
    const rem = int % 1000;
    return `${numberToIndonesianWords(thousands)} ribu${
      rem ? ' ' + numberToIndonesianWords(rem) : ''
    }`;
  }
  const millions = Math.floor(int / 1000000);
  const rem = int % 1000000;
  return `${numberToIndonesianWords(millions)} juta${
    rem ? ' ' + numberToIndonesianWords(rem) : ''
  }`;
}

/**
 * Converts raw Indonesian narration into clean phonetic Indonesian dialogue so Google Flow
 * never mispronounces numbers/units in an English accent or stumbles on chat abbreviations.
 */
export function normalizeIndonesianForSpeech(raw: string): string {
  if (!raw || !raw.trim()) return '';
  let text = raw.trim();

  // 1. Strip bracketed stage directions, hashtags, URLs, and emojis/weird symbols
  text = text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/#\w+/g, ' ')
    .replace(/[*_~`<>|\\^]/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ');

  // 2. Normalize "Rp 50.000" / "Rp50rb" / "50rb" / "2jt"
  text = text.replace(/\bRp\.?\s*(\d+(?:[.,]\d+)?)\s*(rb|ribu|k)\b/gi, (_m, num) => {
    const val = parseInt(String(num).replace(/[.,]/g, ''), 10);
    return `${numberToIndonesianWords(val)} ribu rupiah`;
  });
  text = text.replace(/\bRp\.?\s*(\d{1,3}(?:\.\d{3})+)\b/gi, (_m, num) => {
    const val = parseInt(String(num).replace(/\./g, ''), 10);
    return `${numberToIndonesianWords(val)} rupiah`;
  });
  text = text.replace(/\b(\d+)\s*(rb|ribu)\b/gi, (_m, num) => {
    return `${numberToIndonesianWords(parseInt(num, 10))} ribu`;
  });
  text = text.replace(/\b(\d+)\s*(jt|juta)\b/gi, (_m, num) => {
    return `${numberToIndonesianWords(parseInt(num, 10))} juta`;
  });

  // 3. Percentages, multipliers, and common product units ("100%", "2x", "3pcs", "50ml")
  text = text.replace(/\b(\d+)\s*%/g, (_m, num) => {
    return `${numberToIndonesianWords(parseInt(num, 10))} persen`;
  });
  text = text.replace(/\b(\d+)\s*x\b/gi, (_m, num) => {
    const n = parseInt(num, 10);
    return n === 1 ? 'sekali' : `${numberToIndonesianWords(n)} kali`;
  });
  text = text.replace(/\b(\d+)\s*(pcs|pc)\b/gi, (_m, num) => {
    return `${numberToIndonesianWords(parseInt(num, 10))} pisis`;
  });
  text = text.replace(/\b(\d+)\s*ml\b/gi, (_m, num) => {
    return `${numberToIndonesianWords(parseInt(num, 10))} mili`;
  });
  text = text.replace(/\b(\d+)\s*(gr|gram)\b/gi, (_m, num) => {
    return `${numberToIndonesianWords(parseInt(num, 10))} gram`;
  });
  text = text.replace(/\b(\d+)\s*kg\b/gi, (_m, num) => {
    return `${numberToIndonesianWords(parseInt(num, 10))} kilo`;
  });

  // 4. Standalone small numbers (0 - 9999) -> spoken Indonesian words
  text = text.replace(/\b(\d{1,4})\b/g, (_m, num) => {
    return numberToIndonesianWords(parseInt(num, 10));
  });

  // 5. Expand common Indonesian chat abbreviations
  for (const [pattern, replacement] of SLANG_MAP) {
    text = text.replace(pattern, replacement);
  }

  // 6. Clean whitespace & ensure terminal punctuation for natural sentence cadence
  text = text.replace(/\s+/g, ' ').trim();
  if (text && !/[.!?]$/.test(text)) {
    text += '.';
  }
  return text;
}

/**
 * Scrubs any platform/ad/timestamp words from visual directions so the video model
 * never hallucinates TikTok UI, fake captions, keranjang kuning stickers, or digital timecodes.
 */
export function scrubVisualPromptTriggers(visualDirection: string): string {
  if (!visualDirection) return '';
  return visualDirection
    .replace(/\[\s*\d+s?\s*[-–]\s*\d+s?\s*\]\s*:?/gi, '')
    .replace(
      /\b(tiktok|reels|instagram|youtube\s*shorts|shorts|ugc|cta|hook|iklan|advertisement|commercial|promo|diskon|keranjang\s*kuning|subtitle|subtitles|caption|captions|text\s*overlay|watermark)\b/gi,
      ''
    )
    .replace(/\b(brings?\s+into\s+frame|lifts?\s+into\s+frame|pulls?\s+out|grabs?\s+from\s+off[- ]?screen)\b/gi, 'holds steadily in frame')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const ANTI_BUG_LOCKS = {
  cleanFrame:
    'CLEAN SENSOR & FORMAT LOCK: Raw unedited single-take camera feed. STRICTLY ZERO text, ZERO subtitles, ZERO captions, ZERO letters or numbers on screen, ZERO social media UI icons, ZERO watermarks, ZERO split-screens, and ZERO internal jump-cuts or flash transitions.',
  stillBody:
    'ANTI-GLITCH POSE & HAND LOCK: Subject stays 85% calm and anchored in a single natural posture throughout the take. Hands NEVER cross in front of the face, NEVER wave rapidly, and NEVER point at the lens. Maintain anatomically accurate 5-finger hands with relaxed minimal motion. Natural blinking, subtle breathing, slight head micro-nods, and accurate lip-sync ONLY.',
  staticObjectAnchor: (productName: string) =>
    `STATIC OBJECT ANCHOR (ZERO MID-CLIP SPAWN): The ${productName} is ALREADY in its starting position (held steadily with a calm static grip near lower-chest level without blocking the face, or resting stably on the table) from 0.0s through the final frame. NEVER spawn, summon, toss, or spin the object mid-clip. Maintain constant realistic scale, solid finger grip without clipping, and undistorted shape.`,
  dryVoice:
    'CLEAN AUDIO LOCK: Strictly NO background music, NO musical soundtrack, NO sound effects, NO crowd chatter. Dry, clean, close-mic human voice in natural everyday Indonesian accent with quiet room tone ONLY. Unhurried steady pace; after finishing the sentence, subject holds a calm natural gentle smile for the final 1 second so audio never cuts off abruptly.',
  silentBrollAudio:
    'CLEAN AUDIO LOCK: Strictly NO background music, NO speech, NO random voices. Quiet authentic room tone and subtle natural handling sound ONLY.',
};

export interface SceneBugAudit {
  safe: boolean;
  phoneticPreview: string;
  fixesApplied: string[];
  warnings: string[];
}

export function auditSceneAntiBug(
  rawDialogue: string,
  durationSec: number,
  maxClipSec: number
): SceneBugAudit {
  const phoneticPreview = normalizeIndonesianForSpeech(rawDialogue);
  const fixesApplied: string[] = [];
  const warnings: string[] = [];

  if (rawDialogue.trim() && phoneticPreview !== rawDialogue.trim() && phoneticPreview !== rawDialogue.trim() + '.') {
    fixesApplied.push('Ejaan angka/singkatan otomatis dinormalisasi agar suara tidak logat robot');
  }

  const spokenWords = phoneticPreview
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const maxSafeSpoken = Math.max(6, Math.floor((maxClipSec - 1.5) * 1.9));

  if (spokenWords > maxSafeSpoken + 3) {
    warnings.push(
      `Kalimat lisan cukup padat (${spokenWords} kata ucap untuk ${durationSec}s) — klik "Belah Jadi 2" agar suara tidak ngebut/kepotong`
    );
  }

  return {
    safe: warnings.length === 0,
    phoneticPreview,
    fixesApplied,
    warnings,
  };
}

export interface ParsedScriptSegment {
  rawDialogue: string;
  rawAction: string;
  speechModeOverride?: 'lip_sync' | 'voice_over' | 'silent_broll';
  shotTypeOverride?: string;
  sanitizedActionEn?: string;
  sanitizedGestureEn?: string;
  safetyClampNote?: string;
}

/**
 * Translates Indonesian/English model movement notes into safe, zero-glitch English camera/actor direction
 * while clamping bug-prone actions (mid-clip object grabs, uncapping, spraying, waving hands in front of face).
 */
export function sanitizeUserActionDirection(
  rawAction: string,
  hasProduct: boolean,
  productName?: string,
  speechMode: 'lip_sync' | 'voice_over' | 'silent_broll' = 'lip_sync'
): {
  shotTypeOverride?: string;
  actionEn: string;
  gestureEn: string;
  safetyClampNote?: string;
} {
  const clean = rawAction.trim();
  if (!clean) {
    return { actionEn: '', gestureEn: '' };
  }

  const lower = clean.toLowerCase();
  const prodLabel = productName ? `the ${productName}` : 'the product';
  let shotTypeOverride: string | undefined;
  let safetyClampNote: string | undefined;

  // 1. Infer best Shot Type from user's movement description
  if (/\b(close[- ]?up|jarak\s*dekat|detail\s*produk|detail\s*kemasan|tekstur|macro)\b/i.test(lower)) {
    shotTypeOverride = 'closeup_proof';
  } else if (/\b(dua\s*tangan|2\s*tangan|demo\s*tangan|hands?\s*demo)\b/i.test(lower)) {
    shotTypeOverride = 'hands_demo';
  } else if (
    /\b(pegang|memegang|tunjuk|menunjuk|nunjukkin|tunjukin|pamer|perlihatkan|lihatkan|show|hold|holding|botol|produk|kemasan|kotak|jar|tube|barang)\b/i.test(
      lower
    )
  ) {
    shotTypeOverride = 'show_product';
  } else if (/\b(samping|3\/4|tiga\s*per\s*empat|over\s*shoulder|candid)\b/i.test(lower)) {
    shotTypeOverride = 'over_shoulder';
  } else if (/\b(emosi|dramatis|sedih|terharu|serius\s*cerita)\b/i.test(lower)) {
    shotTypeOverride = 'story_emotion';
  } else if (/\b(ngobrol|bicara|talking\s*head|chest[- ]?up|duduk|berdiri)\b/i.test(lower)) {
    shotTypeOverride = 'talking_head';
  }

  // 2. Check if user wrote risky physics/spawn moves that cause AI video glitches
  const riskyMoveRegex =
    /\b(ambil|mengambil|angkat\s+dari|munculin|keluarin|tarik\s+dari|buka\s+tutup|membuka\s+tutup|tuang|menuang|semprot|menyemprot|oles|mengoles|pakai\s+ke\s+(?:muka|wajah|pipi|kulit)|usap\s+ke\s+(?:muka|wajah)|lempar|putar|memutar|muter|tepuk\s+tangan|nunjuk[- ]?nunjuk|unjuk\s+jari|uncap|spray|pour|apply\s+to\s+face|pick\s+up)\b/i;

  const hasRiskyMove = riskyMoveRegex.test(lower);
  if (hasRiskyMove) {
    safetyClampNote =
      'Gerakan rawan glitch (ambil mendadak / buka tutup / oles ke wajah) otomatis dikunci ke pose statis 0.0s agar jari & produk tetap utuh 100%.';
  }

  // 3. Detect Indonesian cues vs custom English
  const indonesianCueRegex =
    /\b(duduk|berdiri|bersandar|santai|ngobrol|bicara|pegang|memegang|tunjukin|nunjukkin|perlihatkan|lihatkan|botol|produk|kemasan|dada|kamera|senyum|ekspresi|kaget|kesel|capek|bingung|ragu|yakin|serius|ramah|ceria|angguk|mengangguk|geleng|lirik|melihat|tangan|diam|dekat|jarak)\b/i;

  if (!indonesianCueRegex.test(lower) && !hasRiskyMove) {
    // User wrote custom safe English direction — scrub UI/timestamp triggers & return
    const scrubbed = scrubVisualPromptTriggers(clean);
    return {
      shotTypeOverride,
      actionEn: scrubbed,
      gestureEn: 'calm natural eye contact and subtle breathing',
    };
  }

  // 4. Assemble crystal-clear Anti-Bug English action from Indonesian cues
  let posture = 'in a calm anchored chest-up posture';
  if (/\bduduk\b/i.test(lower)) posture = 'seated comfortably with a steady anchored posture';
  else if (/\bberdiri\b/i.test(lower)) posture = 'standing naturally with a steady anchored posture';
  else if (/\bbersandar\b/i.test(lower)) posture = 'leaning back casually in a steady posture';

  const mentionsProductHold =
    hasRiskyMove ||
    shotTypeOverride === 'show_product' ||
    shotTypeOverride === 'hands_demo' ||
    shotTypeOverride === 'closeup_proof' ||
    /\b(pegang|tunjuk|nunjukkin|tunjukin|pamer|produk|botol|kemasan|barang)\b/i.test(lower);

  let deliveryAndHands = '';
  if (shotTypeOverride === 'closeup_proof' && hasProduct) {
    deliveryAndHands = `holds ${prodLabel} steadily in frame from 0.0s with a relaxed 5-finger grip so its real surface texture and details stay clearly visible`;
  } else if (mentionsProductHold && hasProduct) {
    const twoHands = /\b(dua\s*tangan|2\s*tangan)\b/i.test(lower);
    const speakPart =
      speechMode === 'lip_sync'
        ? 'speaks calmly and naturally to the camera lens while '
        : 'remains calm and steady on camera while ';
    deliveryAndHands =
      `${speakPart}already holding ${prodLabel} steadily ${
        twoHands ? 'with both hands ' : ''
      }at lower-chest height from frame 0.0s without blocking their face`;
  } else {
    const speakPart =
      speechMode === 'lip_sync'
        ? 'speaks directly and naturally to the camera lens'
        : 'holds a calm natural presence on camera';
    deliveryAndHands = `${speakPart} ${posture}, keeping hands resting calm and still below the frame`;
  }

  // Expression & subtle safe micro-gesture
  const exprParts: string[] = [];
  if (/\b(kaget|terkejut|wah|penasaran)\b/i.test(lower)) {
    exprParts.push('expressive curious eyes and subtle surprised micro-expression');
  } else if (/\b(kesel|capek|lelah|bingung|ragu|keluh|males)\b/i.test(lower)) {
    exprParts.push('relatable empathetic facial expression');
  } else if (/\b(serius|yakin|percaya\s*diri|tegas)\b/i.test(lower)) {
    exprParts.push('confident warm eye contact');
  } else if (/\b(senyum|ramah|ceria|seneng|senang|puas)\b/i.test(lower)) {
    exprParts.push('a warm genuine natural smile');
  }

  let gestureEn = 'subtle natural head micro-nod and steady eye contact';
  if (/\b(lirik|lihat\s+(?:produk|botol|kemasan|barang))\b/i.test(lower) && mentionsProductHold) {
    gestureEn = 'glances briefly once at the product then back to the lens without spinning it';
  } else if (/\bgeleng\b/i.test(lower)) {
    gestureEn = 'subtle gentle head shake while speaking, keeping shoulders calm';
  } else if (/\bangguk|mengangguk\b/i.test(lower)) {
    gestureEn = 'gentle natural head nod while speaking';
  } else if (/\bsenyum\b/i.test(lower)) {
    gestureEn = 'warm natural gentle smile for the final second';
  }

  const actionEn =
    exprParts.length > 0
      ? `${deliveryAndHands}, with ${exprParts.join(' and ')}`
      : deliveryAndHands;

  return {
    shotTypeOverride,
    actionEn,
    gestureEn,
    safetyClampNote,
  };
}

/**
 * Parses a single scene block or paragraph supporting ALL 3 user input formats:
 * 1) Structured Script:
 *    Aksi/Visual/Gerakan: ...
 *    Dialog/VO/Narasi: ...
 * 2) Inline Parentheses:
 *    (Pegang produk di dada sambil senyum) Jujur baru kali ini...
 *    (VO | Close-up kemasan) Teksturnya ringan banget...
 * 3) Pure Narration:
 *    Jujur baru kali ini...
 */
export function parseScriptBlock(
  rawBlock: string,
  hasProduct: boolean,
  productName?: string
): ParsedScriptSegment {
  const lines = rawBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rawDialogue: '', rawAction: '' };
  }

  const actionLabelRe = /^(?:[-•*]\s*)?(?:aksi|visual|gerakan|adegan|pose|model|shot|arahan)\s*[:—-]\s*(.*)$/i;
  const voLabelRe =
    /^(?:[-•*]\s*)?(?:vo|voice\s*over|narasi\s*vo|suara\s*vo|audio\s*vo)\s*[:—-]\s*(.*)$/i;
  const brollLabelRe =
    /^(?:[-•*]\s*)?(?:b[- ]?roll|silent|tanpa\s*suara|visual\s*only)\s*[:—-]\s*(.*)$/i;
  const dialogLabelRe =
    /^(?:[-•*]\s*)?(?:dialog|narasi|bicara|ucapan|kalimat|script|audio|suara)\s*[:—-]\s*(.*)$/i;

  const hasExplicitLabels = lines.some(
    (l) => actionLabelRe.test(l) || voLabelRe.test(l) || dialogLabelRe.test(l) || brollLabelRe.test(l)
  );

  let rawAction = '';
  let rawDialogue = '';
  let speechModeOverride: 'lip_sync' | 'voice_over' | 'silent_broll' | undefined;

  if (hasExplicitLabels) {
    let activeTarget: 'action' | 'dialogue' = 'dialogue';
    const actionParts: string[] = [];
    const dialogueParts: string[] = [];

    for (const line of lines) {
      let m: RegExpMatchArray | null;
      if ((m = line.match(actionLabelRe))) {
        activeTarget = 'action';
        if (m[1].trim()) actionParts.push(m[1].trim());
      } else if ((m = line.match(voLabelRe))) {
        activeTarget = 'dialogue';
        speechModeOverride = 'voice_over';
        if (m[1].trim()) dialogueParts.push(m[1].trim());
      } else if ((m = line.match(brollLabelRe))) {
        activeTarget = 'action';
        speechModeOverride = 'silent_broll';
        if (m[1].trim()) actionParts.push(m[1].trim());
      } else if ((m = line.match(dialogLabelRe))) {
        activeTarget = 'dialogue';
        if (!speechModeOverride) speechModeOverride = 'lip_sync';
        if (m[1].trim()) dialogueParts.push(m[1].trim());
      } else {
        const cleanedLine = line.replace(/^["“”]+|["“”]+$/g, '').trim();
        if (activeTarget === 'action') actionParts.push(cleanedLine);
        else dialogueParts.push(cleanedLine);
      }
    }

    rawAction = actionParts.join(' ').trim();
    rawDialogue = dialogueParts
      .join(' ')
      .replace(/^["“”]+|["“”]+$/g, '')
      .trim();
  } else {
    // Check Inline Parentheses / Brackets at start: "(Pegang produk di dada) Kalimat dialog..."
    const joined = lines.join(' ').trim();
    const inlineMatch = joined.match(/^(?:\(([^)]{3,180})\)|\[([^\]]{3,180})\])\s*(.*)$/s);

    if (inlineMatch) {
      const bracketText = (inlineMatch[1] || inlineMatch[2] || '').trim();
      const restText = (inlineMatch[3] || '').replace(/^["“”]+|["“”]+$/g, '').trim();

      if (/\b(vo|voice\s*over)\b/i.test(bracketText)) {
        speechModeOverride = 'voice_over';
      } else if (/\b(b[- ]?roll|tanpa\s*suara|silent)\b/i.test(bracketText)) {
        speechModeOverride = 'silent_broll';
      }

      rawAction = bracketText
        .replace(/^\s*(?:vo|voice\s*over|lip[- ]?sync)\s*[|:—-]?\s*/i, '')
        .trim();
      rawDialogue = restText;
    } else {
      // Pure Narration
      rawDialogue = joined.replace(/^["“”]+|["“”]+$/g, '').trim();
    }
  }

  if (!speechModeOverride && !rawDialogue && rawAction) {
    speechModeOverride = 'silent_broll';
  }

  const effectiveSpeech = speechModeOverride || 'lip_sync';
  if (rawAction) {
    const sanitized = sanitizeUserActionDirection(
      rawAction,
      hasProduct,
      productName,
      effectiveSpeech
    );
    return {
      rawDialogue,
      rawAction,
      speechModeOverride,
      shotTypeOverride: sanitized.shotTypeOverride,
      sanitizedActionEn: sanitized.actionEn,
      sanitizedGestureEn: sanitized.gestureEn,
      safetyClampNote: sanitized.safetyClampNote,
    };
  }

  return {
    rawDialogue,
    rawAction: '',
    speechModeOverride,
  };
}

/**
 * Extracts ONLY spoken dialogue/VO text from any raw script (stripping SCENE headers & Aksi/Visual lines)
 * for accurate live word & duration estimation in Step 2!
 */
export function extractSpokenLinesFromRawScript(rawScript: string): string {
  if (!rawScript || !rawScript.trim()) return '';
  const withoutSceneHeaders = rawScript.replace(
    /(?:^|\n)\s*(?:\[?\s*SCENE\s*\d+[^\n\]]*\]?|Scene\s*\d+\s*[:—-][^\n]*)/gi,
    '\n\n'
  );
  // Also treat lines starting with "(Aksi...)" after a newline as separate scene blocks
  const normalizedBlocks = withoutSceneHeaders.replace(/\n(?=\s*\([^)]{3,180}\)\s*\S)/g, '\n\n');
  const blocks = normalizedBlocks
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks
    .map((b) => parseScriptBlock(b, true).rawDialogue)
    .filter(Boolean)
    .join(' ');
}
