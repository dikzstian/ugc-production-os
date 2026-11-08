export const REALISM_LOCKS = {
  identity:
    "The uploaded reference image is the absolute single source of truth for the subject's identity. Extract and preserve the exact face shape, all facial features, eye color, skin tone, and hair from the reference. Do not change the underlying face structure. Do not redesign, beautify, slim, or stylize the face. The generated subject must be the exact same person as the reference.",
  skin:
    'glowing healthy complexion WITH fine natural skin texture, visible subtle pores, faint natural unevenness — no airbrushed, porcelain, or plastic finish',
  subject:
    'natural facial asymmetry, a few loose hair strands and baby hairs, natural eyebrows with individual hairs, natural teeth if visible (not perfectly uniform), real fabric wrinkles on clothing',
  cameraPhoto:
    'subtle photo grain, faint noise in shadows, framing slightly off-center and tilted a few degrees, shallow phone-camera depth of field, mild motion blur on a hair strand or hand, slightly blown-out highlights where light is strongest',
  bg:
    'lived-in and slightly cluttered with random everyday objects, softly blurred, occasional natural background depth',
  negPhoto:
    'plastic skin, airbrushed skin, porcelain skin, beauty filter, heavy makeup, CGI, 3D render, cartoon, illustration, perfect symmetry, bad anatomy, distorted face, extra fingers, deformed hands, watermark, text overlay, subtitles, captions, duplicate person, mismatched face',
  videoRealism:
    'Visible natural skin texture with subtle pores, a few loose hair strands moving naturally, subtle sensor grain, smartphone dynamic range with slightly crushed shadows and mildly warm highlights, authentic 30fps smartphone camera feel with calm steady framing. STRICTLY ZERO subtitles, ZERO on-screen text, ZERO UI elements, ZERO watermarks, ZERO background music.',
  ingRule:
    'IMPORTANT: every attached ingredient image must appear exactly as shown in its reference. Do not re-imagine, replace, or restyle any ingredient. The text prompt only directs camera, motion, and dialogue; all visual identity comes from the attached reference images.',
};

export const INGREDIENT_BINDINGS = {
  character:
    'PERSON: the exact same person as the attached character ingredient image — same face, same facial structure, same skin tone, same hair color and length, same identity. Do not alter, redesign, or beautify.',
  outfit:
    'OUTFIT: wearing the exact outfit shown in the character/outfit reference image — same garment, same color, same fit and fabric details.',
  product:
    'PRODUCT / OBJECT: the exact {PRODUCT} from the attached product ingredient image — preserve exact shape, color, proportions, and label/details. Do not redesign, mutate, or invent fake logos.',
  location:
    'LOCATION: the scene takes place in the exact space shown in the attached location ingredient image — same layout, background objects, and lighting mood.',
};

export const SCENE_LOCATIONS = [
  {
    id: 'cozy_room_day',
    label: 'Kamar / Ruangan Siang (Natural UGC)',
    location:
      'lived-in Indonesian indoor room with everyday real details (shelf, neatly stacked boxes, curtain by window, wooden desk) softly visible in background',
    time: 'daytime',
    lighting:
      'natural daylight coming from a side window, soft highlights on face and fabric, gentle natural shadow falloff on the opposite side',
    audio: 'quiet natural room tone, very faint distant neighborhood ambience',
  },
  {
    id: 'cozy_night',
    label: 'Kamar Cozy — Lampu Malam',
    location:
      'cozy lived-in bedroom at night, warm desk/bedside lamp, everyday objects softly blurred in background',
    time: 'night',
    lighting:
      'warm yellow indoor lamp light from one side, uneven natural falloff across the face, soft realistic shadows',
    audio: 'quiet room tone, soft subtle cloth movement',
  },
  {
    id: 'workshop_bengkel',
    label: 'Bengkel / Workshop Kerja Nyata',
    location:
      'real working Indonesian garage/workshop with metal workbench, tools, cables, stacked materials, concrete floor in blurred background',
    time: 'daytime',
    lighting:
      'open garage daylight mixed with practical overhead tube light, honest gritty contrast on hands, tools, and metal surfaces',
    audio: 'authentic workshop room tone, subtle tool handling sound, faint street sound outside',
  },
  {
    id: 'unboxing_desk',
    label: 'Meja Review / Studio Rumahan',
    location:
      'clean wooden home worktable with everyday creator items (mug, small plant, storage rack behind) in a lived-in home office',
    time: 'afternoon',
    lighting:
      'soft diffused front-side window light mixed with warm indoor ambient light, clear visibility on product details',
    audio: 'clean indoor room ambience, natural hand and object handling sounds',
  },
  {
    id: 'mirror_day',
    label: 'Mirror Room — Fashion / OOTD',
    location:
      'indoor bedroom/dressing corner with everyday real clutter, plain wall, wooden floor, full-length standing mirror',
    time: 'midday',
    lighting:
      'strong natural sunlight from side window, warm highlights on outfit fabric, realistic shadows',
    audio: 'quiet room tone, subtle footsteps and fabric rustle',
  },
  {
    id: 'street_night',
    label: 'Street Malam — Kota Ramai (Story/Vlog)',
    location:
      'lively Indonesian city street at night, warm streetlamps, parked motorbikes, shop signs, blurred pedestrians in distance',
    time: 'night',
    lighting:
      'warm ambient streetlight with golden rim backlight, pockets of natural shadow, authentic night phone grain',
    audio: 'night street ambience, distant motorbikes passing, light urban hum',
  },
  {
    id: 'cafe_day',
    label: 'Cafe Aesthetic — Siang/Sore',
    location:
      'neighborhood coffee shop by a glass window, wooden table with iced coffee cup, blurred cafe interior behind',
    time: 'afternoon',
    lighting:
      'soft window daylight mixed with warm pendant lamps overhead, flattering natural contrast',
    audio: 'subtle cafe ambience, quiet clinking cup, low background murmur',
  },
  {
    id: 'car_interior',
    label: 'Dalam Mobil (Ngobrol / Curhat)',
    location:
      'inside a parked car in Indonesia, car seat, seatbelt, window showing daytime/dusk street outside',
    time: 'late afternoon',
    lighting:
      'natural directional light through car windshield and side window, realistic interior shadow contrast on face',
    audio: 'muffled exterior traffic, quiet car cabin acoustics',
  },
];

export const LIGHTING_PRESETS = [
  { id: 'auto_scene', label: 'Ikuti Preset Lokasi (Otomatis)', desc: '' },
  {
    id: 'window_sun',
    label: 'Sinar Matahari Jendela (Siang)',
    desc: 'natural sunlight from a side window, warm highlights, realistic shadow falloff on the other side',
  },
  {
    id: 'golden_hour',
    label: 'Golden Hour Sore',
    desc: 'warm golden afternoon sunlight, glowing rim light on hair, soft lens warmth',
  },
  {
    id: 'lamp_night',
    label: 'Lampu Kuning Malam (Cozy)',
    desc: 'warm yellow indoor lamp light from one side, uneven falloff, cozy deep shadows',
  },
  {
    id: 'fluorescent_real',
    label: 'Lampu Putih Ruangan / Toko / Bengkel',
    desc: 'practical overhead indoor white fluorescent/LED lighting, honest unpolished everyday look',
  },
  {
    id: 'cinematic_moody',
    label: 'Cinematic Moody (Storytelling)',
    desc: 'dramatic directional key light with rich shadow depth, atmospheric filmic contrast while keeping natural skin pores',
  },
];

export const CAMERA_STYLES = [
  {
    id: 'selfie_handheld',
    label: 'Selfie Pegang HP (Vlog / UGC Akrab)',
    desc: "handheld front smartphone camera held at arm's length, chest-up framing, subtle natural hand drift",
  },
  {
    id: 'tripod_casual',
    label: 'HP Sandar Meja / Tripod Kasual (Demo Produk)',
    desc: 'smartphone propped casually at eye-to-chest level, natural candid framing so both hands are free to hold/demo product',
  },
  {
    id: 'candid_friend',
    label: 'Direkam Teman / Handheld Orang Ketiga',
    desc: 'handheld smartphone footage filmed by another person, waist-up or medium framing with subtle human camera movement',
  },
  {
    id: 'cinematic_story',
    label: 'Cinematic Handheld (Storytelling / Mini-Drama)',
    desc: 'organic handheld cinema/pro-phone framing with intentional composition, shallow depth of field, smooth natural motion',
  },
];

export const SHOT_TYPES = [
  {
    id: 'talking_head',
    label: 'Talking Head Tenang (Chest-Up • Anti-Bug Tangan)',
    prompt:
      'Medium close-up chest-up framing at eye level, calm steady smartphone perspective, hands resting comfortably below frame or completely still',
  },
  {
    id: 'show_product',
    label: 'Pegang Produk Statis Sejak Awal (0.0s Anchor)',
    prompt:
      'Medium chest-up shot where the person is ALREADY holding the product steadily near lower-chest level from frame 0.0s without blocking their face',
  },
  {
    id: 'hands_demo',
    label: 'Meja / Tangan Pegang Produk Tenang (Minim Gerak)',
    prompt:
      'Medium-tight waist-to-chest angle where the product is ALREADY resting stably in the hands or on the table in front from frame 0.0s with minimal calm hand motion',
  },
  {
    id: 'closeup_proof',
    label: 'Close-Up Detail Produk Statis (B-Roll Tanpa Wajah)',
    prompt:
      'Tight steady close-up shot on the product already held calmly in hand or resting on a surface from frame 0.0s, showing real physical texture and details clearly',
  },
  {
    id: 'full_outfit_mirror',
    label: 'Medium-Wide / OOTD Berdiri Tenang',
    prompt:
      'Waist-up to three-quarter steady framing showing natural posture and outfit fit clearly without rapid body turns',
  },
  {
    id: 'story_establishing',
    label: 'Establishing Shot Tenang (Situasi Awal Cerita)',
    prompt:
      'Medium-wide calm environmental shot establishing the subject naturally anchored inside the space',
  },
  {
    id: 'story_emotion',
    label: 'Close-Up Ekspresi Wajah (Fokus Mata & Mimik)',
    prompt:
      'Intimate steady close-up framing capturing subtle facial micro-expressions, natural blinking, and genuine human emotion',
  },
  {
    id: 'over_shoulder',
    label: 'Sudut Samping 3/4 Natural (45° Candid)',
    prompt:
      'Steady three-quarter 45-degree candid angle giving clean visual variety with calm anchored posture',
  },
];

export const PERSONAS = [
  {
    id: 'teman_jujur',
    label: 'Kreator Jujur / Teman Ngobrol (Umum / E-Commerce)',
    note: 'Gaya ngobrol santai ke teman dekat ("aku/kamu" atau "gue/lu"), jujur apa adanya, bukan gaya sales iklan TV.',
  },
  {
    id: 'teknis_lapangan',
    label: 'Praktisi / Tukang / Anak Bengkel (Tools & Mesin)',
    note: 'Membumi, praktis, tegas soal spek & fungsi kerja nyata, bahasa lapangan sederhana tanpa jargon marketing kaku.',
  },
  {
    id: 'fashion_daily',
    label: 'Bestie Lifestyle / Fashion / Skincare',
    note: 'Akrab, ekspresif tapi tetap natural, fokus ke pengalaman pakai nyata (bahan, jatuh di badan, rasa di kulit).',
  },
  {
    id: 'storyteller',
    label: 'Narator Cerita / Slice-of-Life',
    note: 'Mengalir seperti cerita pengalaman pribadi yang bikin penasaran dari kalimat pertama sampai akhir.',
  },
  {
    id: 'custom',
    label: 'Kustom (Tulis Sendiri)',
    note: '',
  },
];

export const TONE_PRESETS = [
  {
    id: 'casual_gue_lu',
    label: 'Santai Akrab (Gue / Lu)',
    rule: 'Gunakan sapaan "gue/lu" yang natural, kalimat pendek-pendek enak diucapkan lisan, tidak kaku.',
  },
  {
    id: 'casual_aku_kamu',
    label: 'Ramah Natural (Aku / Kamu)',
    rule: 'Gunakan "aku/kamu" yang hangat seperti kreator TikTok/Reels organik, ringan, jujur.',
  },
  {
    id: 'praktis_tegas',
    label: 'Praktis & To-The-Point (Anti Basa-Basi)',
    rule: 'Langsung ke inti masalah & bukti nyata, minim kata pengisi, kredibel.',
  },
  {
    id: 'dramatis_story',
    label: 'Naratif / Emosional (Storytelling)',
    rule: 'Membangun suasana, ritme kalimat bervariasi untuk memancing rasa penasaran dan empati penonton.',
  },
];

export const HOOK_PRESETS = [
  {
    id: 'pain_point',
    label: 'Pain Point Relatable ("Pernah ngalamin...")',
    rule: 'Buka langsung dengan masalah/kesalahan nyata yang sering kejadian biar penonton ngerasa "ini gue banget" di 3 detik pertama.',
  },
  {
    id: 'curiosity_gap',
    label: 'Curiosity Gap (Bikin Penasaran)',
    rule: 'Buka dengan kalimat gantung / fakta tak terduga yang memaksa orang nonton sampai tengah buat tahu jawabannya.',
  },
  {
    id: 'proof_first',
    label: 'Bukti / Hasil Duluan di Detik Pertama',
    rule: 'Tunjukkan hasil nyata atau kondisi ekstrem di detik pertama baru jelaskan kenapa bisa begitu.',
  },
  {
    id: 'mitos_fakta',
    label: 'Bantah Asumsi Umum (Kontra-Intuitif)',
    rule: 'Patahkan anggapan salah yang sering dipercaya pembeli, didukung fakta/spek valid.',
  },
  {
    id: 'story_opening',
    label: 'Potongan Kejadian ("Tadi pagi kejadian...")',
    rule: 'Mulai langsung di tengah situasi/kejadian konkret tanpa pembukaan basa-basi.',
  },
];

export const STORY_ARCS = [
  {
    id: 'twist_relatable',
    label: 'Kejadian Relatable + Plot Twist Akhir',
    structure:
      'Scene 1: Situasi awal bikin penasaran -> Scene tengah: Masalah makin pelik / salah duga -> Klimaks: Fakta tak terduga terungkap -> Penutup: Kesimpulan singkat nempel di kepala.',
  },
  {
    id: 'before_after_journey',
    label: 'Perjalanan Before → Titik Balik → After',
    structure:
      'Scene 1: Kondisi frustrasi awal -> Scene tengah: Mencoba cara lama gagal lalu ketemu titik balik -> Penutup: Perubahan nyata sekarang.',
  },
  {
    id: 'mini_drama',
    label: 'Mini-Drama / Monolog Curhat Bersambung',
    structure:
      'Scene 1: Kalimat pemicu konflik -> Scene 2-N: Eskalasi cerita bertahap per 7-8 detik dengan emosi naik turun -> Scene Akhir: Resolusi / pertanyaan pancing komentar.',
  },
  {
    id: 'edukasi_bongkar',
    label: 'Bongkar Kasus / Investigasi Singkat',
    structure:
      'Scene 1: Kasus nyata yang bikin heran -> Scene tengah: Bedah penyebab satu per satu secara visual -> Penutup: Takeaway praktis.',
  },
];
