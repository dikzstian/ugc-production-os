// 1:1 Faithful TypeScript Port of Dika's RAW Studio v3 (d:\Dika\UGC\raw-studio-v3.jsx)
// With permanent localStorage persistence for custom scenes.

export type RawStudioMode = 'scene' | 'casting' | 'repair' | 'sheet' | 'collage' | 'video';

export interface RawScenePreset {
  id: string;
  label: string;
  location: string;
  time: string;
  lighting: string;
  audio: string;
  custom?: boolean;
}

export interface RawStudioFormState {
  scene: string;
  camera: string;
  ratio: string;
  expression: string;
  pose: string;
  wardrobe: string;
  hair: string;
  notes: string;
  // Casting
  demographic: string;
  face: string;
  eyes: string;
  skinTone: string;
  distinct: string;
  vibe: string;
  // Repair
  fixSkin: boolean;
  fixHair: boolean;
  fixEyes: boolean;
  fixTeeth: boolean;
  changeScene: boolean;
  // Collage 5 Panel
  exp1: string;
  exp2: string;
  exp3: string;
  exp4: string;
  exp5: string;
  // Video Veo/Flow
  videoSource: 'ref' | 'ingredients' | 'manual';
  ingCharacter: boolean;
  ingOutfit: boolean;
  ingObject: boolean;
  ingLocation: boolean;
  objectName: string;
  character: string;
  action: string;
  gesture: string;
  dialog: string;
  audio: string;
}

export const INITIAL_RAW_FORM: RawStudioFormState = {
  scene: 'mirror_day',
  camera: 'mirror',
  ratio: '9:16',
  expression: '',
  pose: '',
  wardrobe: '',
  hair: '',
  notes: '',
  demographic: '',
  face: '',
  eyes: '',
  skinTone: 'warm light',
  distinct: '',
  vibe: '',
  fixSkin: true,
  fixHair: false,
  fixEyes: false,
  fixTeeth: false,
  changeScene: false,
  exp1: '',
  exp2: '',
  exp3: '',
  exp4: '',
  exp5: '',
  videoSource: 'ref',
  ingCharacter: true,
  ingOutfit: false,
  ingObject: false,
  ingLocation: false,
  objectName: '',
  character: '',
  action: '',
  gesture: '',
  dialog: '',
  audio: '',
};

// ================= LOCKED ENGINE =================
export const LOCK_IDENTITY =
  "The uploaded reference image is the absolute single source of truth for the subject's identity. Extract and preserve the exact face shape, all facial features, eye color, skin tone, and hair from the reference. Do not change the underlying face structure. Do not redesign, beautify, slim, or stylize the face. The generated subject must be the exact same person as the reference.";

export const LOCK_SKIN =
  'glowing healthy complexion WITH fine natural skin texture, visible subtle pores, faint natural unevenness — no airbrushed, porcelain, or plastic finish';

export const LOCK_SUBJECT =
  'natural facial asymmetry, a few loose hair strands and baby hairs, natural eyebrows with individual hairs, natural teeth if visible (not perfectly uniform), real fabric wrinkles on clothing';

export const LOCK_CAMERA =
  'subtle photo grain, faint noise in shadows, framing slightly off-center and tilted a few degrees, shallow phone-camera depth of field, mild motion blur on a hair strand or hand, slightly blown-out highlights where light is strongest';

export const LOCK_BG =
  'lived-in and slightly cluttered with random everyday objects, softly blurred, occasional blurry passerby or motion in background';

export const NEG_PHOTO =
  'plastic skin, airbrushed skin, porcelain skin, beauty filter, heavy makeup, CGI, 3D render, cartoon, illustration, perfect symmetry, bad anatomy, distorted face, extra fingers, deformed hands, watermark, text overlay, duplicate person, mismatched face, celebrity face, existing famous person';

export const LOCK_VIDEO =
  'Visible natural skin texture under the glow, a few loose hair strands moving naturally, subtle grain, phone-camera dynamic range with slightly crushed shadows and mildly blown highlights, amateur phone footage feel with a 30fps look, framing drifts and self-corrects.';

export const REF_CHARACTER =
  'The exact same person as the attached reference image (used as the first frame) — same face, same hair, same identity, do not alter who they are';

export const ING_BIND = {
  character:
    'PERSON: the exact same person as the character ingredient image — same face, same facial structure, same hair color and length, same identity. Do not alter, redesign, or beautify.',
  outfit:
    'OUTFIT: wearing the exact outfit from the outfit ingredient image — same garment, same color, same fit and details. Do not restyle, recolor, or replace it.',
  object:
    'OBJECT: the exact {OBJ} from the object ingredient image — same design, same colors, same label/details. Do not redesign or replace it.',
  location:
    'LOCATION: the scene takes place in the exact place shown in the location ingredient image — same room/space, same furniture and details, same atmosphere. Lighting must match the lighting visible in that image.',
};

export const ING_RULE =
  'IMPORTANT: every ingredient must appear exactly as shown in its reference image. Do not re-imagine, replace, or restyle any ingredient. The text prompt only directs action and camera; all appearance comes from the ingredient images.';

// ================= LIGHTING PRESETS =================
export const RAW_LIGHTINGS = [
  {
    id: 'window_sun',
    label: 'Sinar matahari jendela (siang)',
    desc: 'strong natural sunlight from a window on one side, warm highlights, natural hard shadows to the other side, uneven exposure on face',
  },
  {
    id: 'golden',
    label: 'Golden hour',
    desc: 'warm golden sunlight, glowing rim light on hair, hard natural shadows, slight lens flare',
  },
  {
    id: 'lamp_night',
    label: 'Lampu kuning malam (indoor)',
    desc: 'warm yellow lamp light from one side, uneven falloff across the face, soft deep shadows, slightly crushed blacks',
  },
  {
    id: 'street_night',
    label: 'Streetlight malam',
    desc: 'warm ambient street lighting, soft golden backlight from a streetlamp, dreamy bloom on highlights, pockets of shadow, authentic film-like grain',
  },
  {
    id: 'fluorescent',
    label: 'Fluorescent datar (mall/kantor)',
    desc: 'flat mixed fluorescent lighting with slight color cast, realistic unflattering-but-real indoor light',
  },
  {
    id: 'dusk_string',
    label: 'Senja + string lights',
    desc: 'fading warm dusk sky mixed with warm string lights, glowing highlights on skin and hair, uneven ambient falloff',
  },
  {
    id: 'car_night',
    label: 'Interior mobil malam',
    desc: 'dim car interior lit by streetlight glow and faint dashboard light, strong shadow contrast on the face',
  },
  {
    id: 'overcast',
    label: 'Mendung / overcast',
    desc: 'flat soft overcast daylight, even but slightly dull light, muted shadows, realistic gray tone',
  },
  {
    id: 'flash',
    label: 'Flash langsung malam',
    desc: 'harsh direct phone flash, overexposed skin near camera, dark background falling off quickly, flat hard shadows behind subject',
  },
];

// ================= DEFAULT SCENES =================
export const DEFAULT_RAW_SCENES: RawScenePreset[] = [
  {
    id: 'mirror_day',
    label: 'Mirror selfie — kamar siang',
    location:
      'indoor room with everyday real clutter (stacked cardboard boxes, water dispenser or shelf), plain wall, wooden floor, a large mirror',
    time: 'midday',
    lighting:
      'strong natural sunlight from a window on one side, warm highlights on hair and fabric, natural hard shadows falling to the other side, uneven exposure on face',
    audio: 'quiet room tone, faint outside traffic',
  },
  {
    id: 'street_night',
    label: 'Street malam — kota ramai',
    location:
      'lively city street at night, warm streetlights, parked motorbikes, food stall signs, pedestrians walking in the blurred background',
    time: 'night',
    lighting:
      'warm ambient street lighting, soft golden backlight from a streetlamp, dreamy bloom on highlights, pockets of shadow, authentic film-like grain',
    audio: 'street ambience, motorbikes passing, distant crowd chatter',
  },
  {
    id: 'cozy_night',
    label: 'Kamar cozy — lampu malam',
    location:
      'cozy lived-in bedroom at night, warm lamps, unmade bed and everyday objects visible in the blurred background',
    time: 'night',
    lighting:
      'warm yellow lamp light from one side, uneven falloff across the face, soft deep shadows, slightly crushed blacks',
    audio: 'quiet room tone, soft rustling',
  },
  {
    id: 'golden_window',
    label: 'Golden hour — jendela',
    location:
      'apartment interior near a large window, everyday real details slightly cluttered in the blurred background',
    time: 'late afternoon golden hour',
    lighting:
      'warm golden sunlight streaming through the window, glowing rim light on hair, hard natural shadows on the wall, slight lens flare',
    audio: 'calm room tone, birds faint outside',
  },
  {
    id: 'cafe',
    label: 'Cafe aesthetic — siang',
    location:
      'aesthetic neighborhood cafe by the window, cups and small plates on a wooden table, other guests blurred in the background',
    time: 'daytime',
    lighting:
      'soft window daylight mixed with warm interior lamps, gentle uneven light on the face',
    audio: 'soft cafe music, chatter, cups clinking',
  },
  {
    id: 'rooftop_dusk',
    label: 'Rooftop — senja',
    location: 'city rooftop at dusk, string lights, city skyline softly blurred behind',
    time: 'dusk / blue hour',
    lighting:
      'fading warm dusk sky mixed with warm string lights, glowing highlights on skin and hair, uneven ambient falloff',
    audio: 'evening breeze, distant city hum',
  },
  {
    id: 'mall',
    label: 'Mall / food court',
    location:
      'busy mall food court, trays and signage around, crowd walking blurred in the background',
    time: 'evening',
    lighting:
      'flat mixed fluorescent lighting with slight color cast, realistic unflattering-but-real indoor light',
    audio: 'crowd chatter, dishes, mall announcements faint',
  },
  {
    id: 'car',
    label: 'Dalam mobil — malam',
    location:
      'inside a parked car at night, seatbelt and interior details visible, street lights outside the window',
    time: 'night',
    lighting:
      'dim car interior lit by streetlight glow and faint dashboard light, strong shadow contrast on the face',
    audio: 'muffled traffic outside, faint radio',
  },
];

export const RAW_CAMERAS = [
  {
    id: 'mirror',
    label: 'Mirror selfie (pegang HP)',
    desc: 'smartphone mirror selfie perspective, phone visible in hand, medium or full-body shot',
  },
  {
    id: 'arm',
    label: "Selfie arm's length",
    desc: "front phone camera held at arm's length, close chest-up framing, slightly high flattering angle",
  },
  {
    id: 'candid',
    label: 'Candid difoto orang lain',
    desc: 'handheld smartphone photo taken by someone else, chest-up or waist-up candid shot',
  },
  {
    id: 'table',
    label: 'Dari meja / tripod rendah',
    desc: 'phone propped at table level, slightly low angle, candid unaware framing',
  },
];

export const RAW_RATIOS = ['9:16', '3:4', '1:1', '4:3', '16:9'];

export const RAW_SKIN_TONES = [
  { value: 'warm light', label: 'Warm light' },
  { value: 'fair', label: 'Fair' },
  { value: 'tan / sawo matang', label: 'Tan / sawo matang' },
  { value: 'medium warm', label: 'Medium warm' },
];

export const RAW_TIPS: Record<RawStudioMode, string[]> = {
  scene: [
    'Upload foto master reference lu BARENG prompt ini — identitas 100% dari foto, bukan teks.',
    'Lighting udah otomatis match sama lokasi preset. Untuk lokasi custom, pilih lighting yang masuk akal untuk tempat itu.',
    'Kena error paste / prompt kepotong di Gemini? Ganti output ke Compact.',
  ],
  casting: [
    'Generate 5–10x, pilih SATU pemenang. Wajah beda tiap generate itu wajar (belum ada referensi).',
    'Distinctive feature = kunci karakter solid. Jangan dikosongin.',
    'Cek pemenang: mirip artis terkenal nggak? Kalau iya, ulang.',
  ],
  repair: [
    'Upload foto yang mau diperbaiki bareng prompt ini.',
    'Makin sedikit checkbox yang dicentang, makin terjaga identitas wajah.',
    'Hasil terbaik = master reference baru lu.',
  ],
  sheet: [
    'Pakai master reference TERBAIK — sheet nggak bisa lebih bagus dari sumbernya.',
    'Audit hasil: profil kiri vs kanan orang sama? Warna mata konsisten? Panel top-down masih mirip?',
    'Kalau model gagal 18 panel sekaligus, pecah jadi 3x generate.',
  ],
  collage: [
    'Bagus buat feed IG/FB — satu post banyak ekspresi.',
    'Lighting antar panel sengaja divariasikan dikit biar nggak keliatan satu preset.',
  ],
  video: [
    'Ingredients: gambar = identitas, teks = aksi. Prompt cuma MENGIKAT ingredient + menyutradarai gerakan — jangan deskripsikan ulang isi fotonya.',
    'Makin banyak ingredient, makin berat kerja model — mulai dari 2 (karakter + 1 lagi), tambah kalau hasilnya stabil.',
    'Satu aksi per clip. Adegan panjang = beberapa clip disambung via workflow utama Studio.',
    'Hasil render JANGAN dinilai mentah — ekspor ulang via Stitcher Studio (grain halus) atau biarkan kompresi platform bekerja.',
  ],
};

const CUSTOM_SCENES_STORAGE_KEY = 'flow_studio_raw_custom_scenes_v1';

export function loadSavedCustomScenes(): RawScenePreset[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_SCENES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomScenesToStorage(customScenes: RawScenePreset[]): void {
  try {
    window.localStorage.setItem(CUSTOM_SCENES_STORAGE_KEY, JSON.stringify(customScenes));
  } catch {
    // Ignore storage quota errors
  }
}

function jstr(obj: unknown, compact: boolean): string {
  return compact ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
}

// ================= 1:1 PROMPT BUILDERS =================

export function buildRawScenePrompt(
  f: RawStudioFormState,
  scenes: RawScenePreset[],
  compact: boolean
): string {
  const sc = scenes.find((s) => s.id === f.scene) || scenes[0];
  const cam = RAW_CAMERAS.find((c) => c.id === f.camera) || RAW_CAMERAS[0];
  return jstr(
    {
      image_generation_prompt: {
        meta: {
          aspect_ratio: f.ratio,
          orientation: f.ratio === '16:9' || f.ratio === '4:3' ? 'landscape' : 'portrait',
          style: 'photoreal candid, unedited real photo look',
        },
        subject: {
          identity_source: {
            instructions: LOCK_IDENTITY,
            features: {
              face_shape: 'Exact match to reference image',
              eyes: 'Exact match to reference image, including exact eye color',
              nose: 'Exact match to reference image',
              lips: 'Exact match to reference image',
              skin: 'Exact match to reference tone, ' + LOCK_SKIN,
              hair:
                'Exact match to reference base hair color' +
                (f.hair.trim() ? ', styled as ' + f.hair.trim() : '') +
                ', with a few natural loose strands',
            },
          },
          expression:
            f.expression.trim() || 'relaxed natural expression, caught mid-moment, not posing stiffly',
          pose_action: f.pose.trim() || 'natural casual pose',
          wardrobe: f.wardrobe.trim() || 'casual everyday outfit',
          realism_lock: LOCK_SUBJECT,
        },
        scene: {
          location: sc.location,
          time: sc.time,
          lighting: sc.lighting,
          background_realism: LOCK_BG,
        },
        camera: {
          device: cam.desc,
          imperfections: LOCK_CAMERA,
        },
        extra_notes: f.notes.trim() || undefined,
        constraints: [
          "Must use the uploaded reference image as the absolute single source of truth for the subject's identity.",
          'Maintain 100% facial and identity consistency with the referenced subject.',
          'Keep all clothing, posing, and expressions strictly safe for work.',
        ],
        negative_prompt: NEG_PHOTO,
      },
    },
    compact
  );
}

export function buildRawCastingPrompt(f: RawStudioFormState, compact: boolean): string {
  return jstr(
    {
      prompt_type: 'character_casting_portrait',
      output: 'Single frontal portrait, chest-up, eye-level camera, aspect ratio 3:4',
      character_design: {
        demographic: f.demographic.trim() || 'young Indonesian woman, early 20s',
        face: f.face.trim() || 'soft oval face, gentle photogenic features',
        eyes: f.eyes.trim() || 'warm dark brown almond eyes',
        hair: f.hair.trim() || 'long layered dark brown hair with natural waves',
        skin_tone: (f.skinTone.trim() || 'warm light') + ' with healthy glow',
        distinctive_feature: f.distinct.trim() || 'small natural beauty mark near the left eye',
        vibe: f.vibe.trim() || 'approachable girl-next-door but photogenic',
      },
      realism_lock: {
        skin: LOCK_SKIN,
        face: 'natural asymmetry, one eye very slightly different from the other, natural eyebrows with individual hairs',
        hair: 'a few loose strands and baby hairs',
        teeth_if_visible: 'natural, not perfectly uniform',
      },
      photography: {
        style: 'smartphone portrait, candid but flattering',
        lighting: 'soft warm window light, gentle uneven falloff on the face',
        background: 'softly blurred neutral indoor space',
        imperfections: 'subtle grain, slight off-center framing',
      },
      negative_prompt: NEG_PHOTO,
    },
    compact
  );
}

export function buildRawRepairPrompt(f: RawStudioFormState, scenes: RawScenePreset[]): string {
  const sc = scenes.find((s) => s.id === f.scene) || scenes[3] || scenes[0];
  const fixes: string[] = [];
  if (f.fixSkin) {
    fixes.push(
      '- Skin: keep the glowing healthy look BUT add fine natural skin texture, subtle pores, very faint under-eye area — remove the airbrushed/porcelain finish'
    );
  }
  if (f.fixHair) {
    fixes.push(
      '- Hair: same style but slightly imperfect — a few loose strands, baby hairs, natural uneven shine instead of uniform gloss'
    );
  }
  if (f.fixEyes) {
    fixes.push('- Eyes: natural single catchlight, slightly asymmetrical, not perfectly glossy');
  }
  if (f.fixTeeth) {
    fixes.push('- Teeth (if smiling): natural, not perfectly uniform white');
  }

  const scenePart = f.changeScene
    ? '\nScene change:\n- New location: ' + sc.location + '\n- Lighting: ' + sc.lighting + '\n'
    : '\nKeep the same scene and pose as the reference image.\n';

  return (
    'Use the person in the attached image as the exact same character — same face, same facial structure, same hair color and length, same identity. Do not change who they are.\n\n' +
    'Re-render this as a real photograph taken on a smartphone:\n\n' +
    (fixes.length ? fixes.join('\n') + '\n' : '') +
    scenePart +
    '\nPhotography realism:\n' +
    '- Light falls unevenly on the face with soft real shadows\n' +
    '- ' +
    LOCK_CAMERA +
    '\n' +
    '- Background ' +
    LOCK_BG +
    '\n' +
    '- No beauty filter, no AI-smoothing — looks like an unedited or lightly edited real photo\n\n' +
    'Negative: ' +
    NEG_PHOTO
  );
}

export function buildRawSheetPrompt(f: RawStudioFormState, compact: boolean): string {
  return jstr(
    {
      image_generation_prompt: {
        composition: {
          type: '18-panel facial camera angle reference sheet',
          layout: 'Grid layout with 18 equal panels, 3 columns x 6 rows',
          text_elements: 'No text, no labels, no captions anywhere. Clean panels only.',
        },
        subject: {
          identity_source: {
            instructions: LOCK_IDENTITY + ' Identical across all 18 panels.',
            skin: 'Exact match to reference tone, authentic RAW photo texture: natural pores, fine facial hairs, subtle unevenness',
            hair: 'Exact match to reference color and length, styled away from the face so jawline stays visible in every angle',
          },
          wardrobe:
            f.wardrobe.trim() || 'simple plain light-colored top with clean neckline, minimal accessories',
        },
        panels: [
          '1 Frontal eye-level, neutral relaxed expression',
          '2 Frontal high angle',
          '3 Frontal low angle emphasizing jawline',
          '4 Three-quarter view left (45 degrees)',
          '5 Perfect profile left (90 degrees)',
          '6 Three-quarter view right (45 degrees)',
          '7 Perfect profile right (90 degrees)',
          '8 Macro left eye only — iris and lashes',
          '9 Macro right eye and eyebrow only',
          '10 Macro nose bridge and tip',
          '11 Macro lips only, natural lip texture',
          '12 Macro left jawline and neck',
          '13 Macro right jawline and neck',
          '14 Top-down view over forehead to nose tip',
          '15 Bottom-up view from under the chin',
          '16 Over-the-shoulder profile looking back',
          '17 Macro cheek skin texture — pores, fine hairs, grain',
          '18 Dutch angle close-up, soft natural expression',
        ],
        environment: { setting: 'clean soft neutral backdrop, out of focus, zero distraction' },
        lighting:
          'soft diffused portrait light, consistent across panels, gentle natural falloff on one side of the face',
        style:
          'ultra-realistic RAW photography, macro aesthetics for close-ups, authentic natural skin texture, subtle grain',
        constraints: [
          'Reference image is the only source of identity — 100% consistency across all 18 panels',
          'Skin must show real texture — no airbrushed or porcelain finish',
          'Macro panels (8-13, 17) must never show the full face',
          'Same person, hair, wardrobe, and lighting in every panel',
        ],
        negative_prompt:
          NEG_PHOTO + ', any text or captions, missing panels, different person between panels',
      },
    },
    compact
  );
}

export function buildRawCollagePrompt(
  f: RawStudioFormState,
  scenes: RawScenePreset[],
  compact: boolean
): string {
  const sc = scenes.find((s) => s.id === f.scene) || scenes[2] || scenes[0];
  return jstr(
    {
      image_generation_prompt: {
        composition: {
          type: 'ultra-realistic lifestyle photo collage',
          layout:
            '9:16 vertical, 5-panel collage: 1 large hero portrait left, 4 smaller mood portraits right and bottom',
          text_elements: 'No text or labels anywhere',
        },
        subject: {
          identity_source: {
            instructions: LOCK_IDENTITY + ' Identical across all 5 panels.',
            skin: 'Exact match to reference tone, ' + LOCK_SKIN,
            hair:
              'Exact match to reference base color' +
              (f.hair.trim() ? ', styled as ' + f.hair.trim() : ''),
          },
          wardrobe: f.wardrobe.trim() || 'elegant but casual outfit, minimal jewelry',
          realism_lock: LOCK_SUBJECT,
        },
        panels_sequence: {
          panel_1_hero: f.exp1.trim() || 'soft confident smile, establishing portrait',
          panel_2: f.exp2.trim() || 'candid side glance',
          panel_3: f.exp3.trim() || 'shy smile, approachable mood',
          panel_4: f.exp4.trim() || 'joyful genuine laugh',
          panel_5: f.exp5.trim() || 'over-the-shoulder look back',
        },
        environment: { setting: sc.location, time: sc.time },
        lighting:
          sc.lighting +
          '. Vary light intensity and angle slightly between panels so the set does not look like a single preset',
        camera: 'smartphone portrait look, shallow depth of field, ' + LOCK_CAMERA,
        constraints: [
          'Reference image is the single source of identity across ALL 5 panels',
          'Exact same person in every frame',
          'All poses and expressions elegant and safe for work',
        ],
        negative_prompt: NEG_PHOTO + ', mismatched faces between panels',
      },
    },
    compact
  );
}

export function buildRawVideoPrompt(f: RawStudioFormState, scenes: RawScenePreset[]): string {
  const sc = scenes.find((s) => s.id === f.scene) || scenes[2] || scenes[0];

  if (f.videoSource === 'ingredients') {
    const binds: string[] = [];
    if (f.ingCharacter) binds.push('- ' + ING_BIND.character);
    if (f.ingOutfit) binds.push('- ' + ING_BIND.outfit);
    if (f.ingObject) {
      binds.push('- ' + ING_BIND.object.replace('{OBJ}', f.objectName.trim() || 'object'));
    }
    if (f.ingLocation) binds.push('- ' + ING_BIND.location);

    const locationLine = f.ingLocation
      ? 'in the location from the location ingredient image'
      : 'in ' + sc.location;
    const lightingLine = f.ingLocation
      ? 'Lighting: consistent with the lighting visible in the location ingredient image, falling unevenly and naturally on the face.'
      : 'Lighting: ' + sc.lighting + '.';
    const audioLine =
      'Ambient sound: ' +
      (f.audio.trim() ||
        (f.ingLocation ? 'natural ambient sound matching the location' : sc.audio)) +
      '.';

    const lines = [
      "Vertical 9:16 handheld selfie video, front phone camera held in their own hand at arm's length, arm slightly visible at frame edge, close chest-up framing, natural hand shake and drift.",
      '',
      'INGREDIENTS (attached images):',
      ...binds,
      '',
      ING_RULE,
      '',
      'ACTION: ' +
        (f.ingCharacter ? 'the person from the character ingredient ' : 'the subject ') +
        (f.action.trim() || 'sits casually') +
        ' ' +
        locationLine +
        ', talking casually to the camera, smiling between sentences, occasionally glancing off-frame' +
        (f.gesture.trim() ? ', ' + f.gesture.trim() : '') +
        (f.ingObject && f.objectName.trim()
          ? ', naturally holding/using the ' +
            f.objectName.trim() +
            ' from the object ingredient'
          : '') +
        '.',
      '',
      lightingLine,
      '',
      LOCK_VIDEO,
      '',
      audioLine,
    ];
    if (f.dialog.trim()) {
      lines.push(
        '',
        'They say mid-conversation in a relaxed tone: "' + f.dialog.trim() + '" — natural lip sync.'
      );
    }
    return lines.join('\n');
  }

  const character =
    f.videoSource === 'ref'
      ? REF_CHARACTER
      : f.character.trim() || 'a young person in casual outfit';
  const lines = [
    "Vertical 9:16 handheld selfie video, front phone camera held in their own hand at arm's length, arm slightly visible at frame edge, close chest-up framing, natural hand shake and drift.",
    '',
    character + ',',
    (f.action.trim() || 'sits casually in the scene') + ' ' + sc.location + ',',
    'while talking casually to the camera, smiling between sentences, occasionally glancing off-frame' +
      (f.gesture.trim() ? ', ' + f.gesture.trim() : '') +
      '.',
    '',
    'Lighting: ' + sc.lighting + '.',
    '',
    LOCK_VIDEO,
    '',
    'Ambient sound: ' + (f.audio.trim() || sc.audio) + '.',
  ];
  if (f.dialog.trim()) {
    lines.push(
      '',
      'They say mid-conversation in a relaxed tone: "' + f.dialog.trim() + '" — natural lip sync.'
    );
  }
  return lines.join('\n');
}

export function compileRawStudioPrompt(
  mode: RawStudioMode,
  f: RawStudioFormState,
  scenes: RawScenePreset[],
  compact: boolean
): string {
  switch (mode) {
    case 'scene':
      return buildRawScenePrompt(f, scenes, compact);
    case 'casting':
      return buildRawCastingPrompt(f, compact);
    case 'repair':
      return buildRawRepairPrompt(f, scenes);
    case 'sheet':
      return buildRawSheetPrompt(f, compact);
    case 'collage':
      return buildRawCollagePrompt(f, scenes, compact);
    case 'video':
      return buildRawVideoPrompt(f, scenes);
  }
}
