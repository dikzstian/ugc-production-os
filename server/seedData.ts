import {
  BridgeState,
  CharacterAsset,
  FlowAccount,
  MotionCloneJob,
  ProductAsset,
  StudioProject,
} from '../src/types/studio';

export interface StudioDatabase {
  accounts: FlowAccount[];
  characters: CharacterAsset[];
  products: ProductAsset[];
  projects: StudioProject[];
  motionJobs?: MotionCloneJob[];
  bridge: BridgeState;
}

export function createInitialDatabase(): StudioDatabase {
  const now = new Date().toISOString();

  const accounts: FlowAccount[] = [
    {
      id: 'acc_flow_1',
      name: 'Akun Flow #1 (Utama)',
      emailHint: 'Isi email akun ke-1',
      planTier: 'AI Pro',
      creditsRemaining: 1000,
      creditsMax: 1000,
      costPerClip: 20,
      status: 'active',
      flowUrl: 'https://flow.google.com/',
      profileDirName: 'flow_profile_1',
      notes: 'Klik "Buka Chrome & Login 1x" untuk menyimpan sesi permanen.',
    },
    {
      id: 'acc_flow_2',
      name: 'Akun Flow #2 (Cadangan)',
      emailHint: 'Isi email akun ke-2',
      planTier: 'AI Pro',
      creditsRemaining: 1000,
      creditsMax: 1000,
      costPerClip: 20,
      status: 'ready',
      flowUrl: 'https://flow.google.com/',
      profileDirName: 'flow_profile_2',
      notes: 'Siap otomatis dipakai saat token Akun #1 habis.',
    },
    {
      id: 'acc_flow_3',
      name: 'Akun Flow #3 (Cadangan)',
      emailHint: 'Isi email akun ke-3',
      planTier: 'AI Ultra',
      creditsRemaining: 2500,
      creditsMax: 2500,
      costPerClip: 20,
      status: 'ready',
      flowUrl: 'https://flow.google.com/',
      profileDirName: 'flow_profile_3',
      notes: 'Pool cadangan untuk render project durasi panjang.',
    },
  ];

  const characters: CharacterAsset[] = [
    {
      id: 'char_budi',
      name: 'Budi (Praktisi Bengkel / Teknik)',
      demographic: 'Indonesian man, early 30s, relatable everyday technician look',
      appearance:
        'warm tan Indonesian skin with natural pores, short neat black hair, friendly honest eyes, slight natural stubble',
      defaultOutfit: 'dark navy work t-shirt with subtle real fabric creases',
      speakingStyle: 'santai membumi gaya tukang/praktisi, lugas, jujur apa adanya',
      createdAt: now,
    },
    {
      id: 'char_nadia',
      name: 'Rani (Kreator UGC Lifestyle & Fashion)',
      demographic: 'young Indonesian woman, mid 20s, approachable girl-next-door',
      appearance:
        'warm light olive Indonesian skin with natural texture, shoulder-length layered dark brown hair with loose baby hairs, expressive eyes',
      defaultOutfit: 'clean oversized beige cotton tee, minimal everyday look',
      speakingStyle: 'akrab seperti cerita ke bestie, ekspresif tapi tetap natural tidak lebay',
      createdAt: now,
    },
  ];

  const products: ProductAsset[] = [
    {
      id: 'prod_las_120',
      name: 'Mesin Las Inverter Ringkas 120A',
      category: 'Tools & Mesin Las',
      verifiedSpecs:
        'Bodi ringkas mudah dibawa kerja keliling, busur api stabil untuk kawat las harian 2.0mm - 2.6mm, hemat daya listrik rumahan/bengkel kecil, garansi resmi jelas.',
      bannedClaims:
        'Jangan klaim "paling murah se-Indonesia", "anti rusak seumur hidup", atau mengarang mampu las plat tebal industri berat di luar kapasitas 120A.',
      visualDetails:
        'Compact industrial inverter welding machine box, front digital/dial ampere control, heavy-duty Dinse cable sockets, carry strap on top.',
      createdAt: now,
    },
    {
      id: 'prod_kaos_heavy',
      name: 'Heavyweight Cotton Boxy Tee',
      category: 'Fashion / Apparel',
      verifiedSpecs:
        'Bahan cotton combed 20s tebal tapi adem dipakai siang, potongan boxy fit rapi di bahu, kerah rib tebal tidak gampang melar habis dicuci.',
      bannedClaims:
        'Jangan klaim anti kusut 100% tanpa setrika atau dingin seperti AC.',
      visualDetails:
        'Structured heavyweight cotton t-shirt, thick snug crew neckline rib, clean matte cotton weave texture, relaxed boxy shoulder drop.',
      createdAt: now,
    },
  ];

  const sampleUgcProject: StudioProject = {
    id: 'proj_sample_ugc_30s',
    title: 'UGC Mesin Las 120A — 30 Detik (4 Klip)',
    contentMode: 'ugc',
    aspectRatio: '9:16',
    targetDurationSec: 30,
    characterId: 'char_budi',
    productId: 'prod_las_120',
    useOutfitIngredient: true,
    useLocationIngredient: false,
    scenePresetId: 'workshop_bengkel',
    customLocation: '',
    lightingPresetId: 'auto_scene',
    cameraPresetId: 'tripod_casual',
    personaId: 'teknis_lapangan',
    customPersona: '',
    toneId: 'casual_gue_lu',
    hookId: 'pain_point',
    storyArcId: 'twist_relatable',
    painPointOrPremise:
      'Sering ribet bawa mesin las gede pas panggilan kerja lapangan, belum lagi listrik rumah klien suka jeglek.',
    ctaText: 'Cek spek lengkap dan garansinya di keranjang sebelum lu salah pilih mesin.',
    rawScript:
      '[SCENE 1 - Hook]\nPernah dapet kerjaan las panggilan, tapi pas dicolok listrik rumah klien malah langsung jeglek?\n\n' +
      '[SCENE 2 - Masalah & Reveal]\nMakanya sekarang kalau kerja keliling, gue selalu bawa mesin inverter seratus dua puluh ampere yang ringkas ini.\n\n' +
      '[SCENE 3 - Bukti & Fungsi]\nEnteng dibawa naik motor, tarikan awalnya halus, buat kawat dua koma enam mili apinya tetep stabil.\n\n' +
      '[SCENE 4 - CTA]\nSpek sama garansinya jelas, langsung cek detailnya dulu biar kerjaan lapangan lu makin praktis.',
    scenes: [
      {
        id: 'sc_seed_1',
        sceneNumber: 1,
        beatLabel: 'Hook Pain Point',
        durationSec: 7,
        dialogue:
          'Pernah dapet kerjaan las panggilan, tapi pas dicolok listrik rumah klien malah langsung jeglek?',
        speechMode: 'lip_sync',
        shotType: 'talking_head',
        actionDirection:
          'leans slightly toward camera at the workbench with a relatable knowing expression',
        gesture: 'raises one hand slightly asking a real question',
        continuityMode: 'ingredients',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
      {
        id: 'sc_seed_2',
        sceneNumber: 2,
        beatLabel: 'Reveal Produk',
        durationSec: 8,
        dialogue:
          'Makanya sekarang kalau kerja keliling, gue selalu bawa mesin inverter seratus dua puluh ampere yang ringkas ini.',
        speechMode: 'lip_sync',
        shotType: 'show_product',
        actionDirection:
          'lifts and pats the compact welding machine on the workbench clearly in frame while talking',
        gesture: 'one hand resting solidly on top handle of the machine',
        continuityMode: 'ingredients',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
      {
        id: 'sc_seed_3',
        sceneNumber: 3,
        beatLabel: 'Demo & Bukti Fisik',
        durationSec: 8,
        dialogue:
          'Enteng dibawa naik motor, tarikan awalnya halus, buat kawat dua koma enam mili apinya tetep stabil.',
        speechMode: 'voice_over',
        shotType: 'hands_demo',
        actionDirection:
          'hands inspect the front dial and solid cable connector on the machine closely on the bench',
        gesture: 'turns the ampere knob smoothly and checks cable socket',
        continuityMode: 'ingredients',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
      {
        id: 'sc_seed_4',
        sceneNumber: 4,
        beatLabel: 'CTA Penutup',
        durationSec: 7,
        dialogue:
          'Spek sama garansinya jelas, langsung cek detailnya dulu biar kerjaan lapangan lu makin praktis.',
        speechMode: 'lip_sync',
        shotType: 'show_product',
        actionDirection:
          'looks back to camera standing beside the machine on the bench with confident honest nod',
        gesture: 'relaxed thumbs/hand gesture downward toward link',
        continuityMode: 'ingredients',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
    ],
    stitchSettings: {
      trimStartDefault: 0.05,
      trimEndDefault: 0.12,
      applyRealismGrain: true,
      normalizeAudio: true,
      copyToHasilUgc: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  const sampleStoryProject: StudioProject = {
    id: 'proj_sample_story_40s',
    title: 'Storytelling Malam — Kejadian Salah Paham (40 Detik)',
    contentMode: 'storytelling',
    aspectRatio: '9:16',
    targetDurationSec: 40,
    characterId: 'char_nadia',
    productId: undefined,
    useOutfitIngredient: true,
    useLocationIngredient: false,
    scenePresetId: 'cozy_night',
    customLocation: '',
    lightingPresetId: 'lamp_night',
    cameraPresetId: 'selfie_handheld',
    personaId: 'storyteller',
    customPersona: '',
    toneId: 'dramatis_story',
    hookId: 'story_opening',
    storyArcId: 'twist_relatable',
    painPointOrPremise:
      'Cerita kejadian kocak tapi bikin deg-degan waktu hampir salah kirim paket penting tengah malam.',
    ctaText: 'Kalau lu di posisi gue semalem, lu bakal jujur langsung atau panik juga?',
    rawScript:
      '[SCENE 1 - Setup]\nJujur tangan gue masih agak gemeteran nyeritain kejadian barusan jam sebelas malem tadi.\n\n' +
      '[SCENE 2 - Eskalasi]\nJadi kurir instan udah di depan pagar, dan gue dengan pedenya nyerahin kotak kardus cokelat di meja.\n\n' +
      '[SCENE 3 - Konflik]\nLima menit motornya jalan, gue nengok ke kasur... paket aslinya ternyata masih utuh belum keambil!\n\n' +
      '[SCENE 4 - Klimaks]\nPas gue inget-inget isi kardus yang kebawa tadi, itu isinya koleksi struk belanja sama cemilan kamar gue.\n\n' +
      '[SCENE 5 - Resolusi]\nUntung abangnya mau puter balik sambil ketawa ngakak, kalau lu di posisi gue barusan gimana coba?',
    scenes: [
      {
        id: 'sc_st_1',
        sceneNumber: 1,
        beatLabel: 'Setup Pembuka',
        durationSec: 8,
        dialogue:
          'Jujur tangan gue masih agak gemeteran nyeritain kejadian barusan jam sebelas malem tadi.',
        speechMode: 'lip_sync',
        shotType: 'talking_head',
        actionDirection:
          'sits in cozy night room holding phone selfie-style, wide expressive eyes starting a late-night story',
        gesture: 'touches chest lightly in disbelief',
        continuityMode: 'ingredients',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
      {
        id: 'sc_st_2',
        sceneNumber: 2,
        beatLabel: 'Eskalasi',
        durationSec: 8,
        dialogue:
          'Jadi kurir instan udah di depan pagar, dan gue dengan pedenya nyerahin kotak kardus cokelat di meja.',
        speechMode: 'lip_sync',
        shotType: 'talking_head',
        actionDirection: 'continues speaking animatedly from the exact previous position',
        gesture: 'small hand motion illustrating handing over a box',
        continuityMode: 'frame_chain',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
      {
        id: 'sc_st_3',
        sceneNumber: 3,
        beatLabel: 'Konflik Muncul',
        durationSec: 8,
        dialogue:
          'Lima menit motornya jalan, gue nengok ke kasur, paket aslinya ternyata masih utuh belum keambil!',
        speechMode: 'lip_sync',
        shotType: 'story_emotion',
        actionDirection: 'glances briefly toward the side of the room then back to camera in shock',
        gesture: 'subtle shocked pause',
        continuityMode: 'frame_chain',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
      {
        id: 'sc_st_4',
        sceneNumber: 4,
        beatLabel: 'Plot Twist',
        durationSec: 8,
        dialogue:
          'Pas gue inget isi kardus yang kebawa tadi, itu isinya cemilan kamar gue sendiri!',
        speechMode: 'lip_sync',
        shotType: 'talking_head',
        actionDirection: 'holds back an embarrassed laugh while telling the punchline',
        gesture: 'briefly covers mouth smiling then continues',
        continuityMode: 'frame_chain',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
      {
        id: 'sc_st_5',
        sceneNumber: 5,
        beatLabel: 'Resolusi & Pancing Komentar',
        durationSec: 8,
        dialogue:
          'Untung abangnya mau puter balik sambil ngakak, kalau lu di posisi gue barusan gimana coba?',
        speechMode: 'lip_sync',
        shotType: 'talking_head',
        actionDirection: 'smiles relieved and asks the viewer warmly at the end',
        gesture: 'friendly shrug and head tilt',
        continuityMode: 'frame_chain',
        trimStartSec: 0.05,
        trimEndSec: 0.12,
      },
    ],
    stitchSettings: {
      trimStartDefault: 0.05,
      trimEndDefault: 0.12,
      applyRealismGrain: true,
      normalizeAudio: true,
      copyToHasilUgc: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    accounts,
    characters,
    products,
    projects: [sampleUgcProject, sampleStoryProject],
    motionJobs: [],
    bridge: {
      bridgeMode: 'project',
      activeAccountId: 'acc_flow_1',
      activeProjectId: 'proj_sample_ugc_30s',
      activeSceneId: 'sc_seed_1',
    },
  };
}
