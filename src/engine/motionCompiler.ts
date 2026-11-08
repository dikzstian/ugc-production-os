import {
  CharacterAsset,
  MotionCloneJob,
  MotionSegment,
  ProductAsset,
} from '../types/studio';
import { REALISM_LOCKS } from './presets';

export interface MotionAttachmentItem {
  label: string;
  type: 'ref_video' | 'character' | 'product';
  imageUrl?: string;
  videoUrl?: string;
  filePath?: string;
}

export function compileMotionClonePrompt(
  job: MotionCloneJob,
  segment: MotionSegment,
  character?: CharacterAsset,
  product?: ProductAsset
): {
  prompt: string;
  flowModeBadge: string;
  requiredAttachments: MotionAttachmentItem[];
} {
  const attachments: MotionAttachmentItem[] = [];

  // 1. Driving Reference Video Segment
  attachments.push({
    label: `Video Referensi Gerakan (Segmen ${segment.segmentNumber} • ${segment.durationSec}s)`,
    type: 'ref_video',
    videoUrl: segment.refClipUrl,
    imageUrl: segment.refThumbUrl,
    filePath: segment.refClipPath,
  });

  // 2. Target Character Image
  const charImgUrl = job.customCharImageUrl || character?.imageUrl;
  const charFilePath = job.customCharImagePath || character?.filePath;
  const effectiveChar = job.customCharImageUrl ? undefined : character;
  attachments.push({
    label: `Gambar Karakter Target${effectiveChar ? `: ${effectiveChar.name}` : ''}`,
    type: 'character',
    imageUrl: charImgUrl,
    filePath: charFilePath,
  });

  // 3. Target Product Image (if character_and_product mode)
  const prodImgUrl = job.customProdImageUrl || product?.imageUrl;
  const prodFilePath = job.customProdImagePath || product?.filePath;
  const effectiveProd = job.customProdImageUrl ? undefined : product;
  if (job.cloneMode === 'character_and_product') {
    attachments.push({
      label: `Gambar Produk Target${effectiveProd ? `: ${effectiveProd.name}` : ''}`,
      type: 'product',
      imageUrl: prodImgUrl,
      filePath: prodFilePath,
    });
  }

  const dur = Math.max(3, Math.min(15, Math.round(segment.durationSec)));
  const charIdentityNote = charImgUrl
    ? ' (preserving 100% of the exact face, facial structure, hair, skin tone, and outfit shown in the attached character image — do NOT alter or re-imagine the face)'
    : character
    ? ` (${character.demographic}, ${character.appearance}, wearing ${character.defaultOutfit || 'casual everyday outfit'})`
    : ' (preserving 100% of the exact face, hair, skin tone, and outfit shown in the attached character image)';

  const lines: string[] = [
    `VIDEO-TO-VIDEO MOTION TRANSFER & CHARACTER REPLACEMENT — Duration: ${dur} seconds, Aspect Ratio: ${job.aspectRatio}.`,
    '',
    '1. EXACT MOTION & CHOREOGRAPHY LOCK (FROM REFERENCE VIDEO):',
    '- Use the attached reference video clip strictly as the 1:1 motion, pose, timing, and camera trajectory driver.',
    '- Replicate the exact head movements, eye gaze timing, shoulder posture, hand gestures, finger movements, body rhythm, and camera framing/movement frame-for-frame with natural human physics.',
    job.preserveOriginalExpression
      ? '- Mirror the exact facial micro-expressions, blinks, and emotional performance timing from the reference video naturally onto the new face.'
      : '- Keep facial expressions relaxed, natural, and authentic to the character.',
    '',
    '2. CLEAN CHARACTER IDENTITY SWAP (FROM CHARACTER IMAGE):',
    `- Completely replace the person in the reference video with the exact person from the attached character reference image${charIdentityNote}.`,
    '- Zero trace of the original person’s face, hair, or identity may remain.',
    `- Skin & Realism: ${REALISM_LOCKS.skin}. Natural hair strand motion, realistic cloth folds moving naturally with the body motion.`,
  ];

  if (job.cloneMode === 'character_and_product') {
    const prodName = effectiveProd?.name || 'object/product';
    const prodVis =
      !prodImgUrl && effectiveProd?.visualDetails ? ` (${effectiveProd.visualDetails})` : '';
    lines.push(
      '',
      '3. CLEAN OBJECT / PRODUCT REPLACEMENT (FROM PRODUCT IMAGE):',
      `- Replace the object/product held or interacted with in the reference video with the exact ${prodName} from the attached product reference image${prodVis}.`,
      '- Maintain realistic physical hand grip, accurate finger occlusion (fingers wrapping naturally around the product without clipping/merging), and exact product scale, color, and label integrity.'
    );
  }

  if (job.cloneMode === 'motion_new_bg') {
    const bgDesc =
      job.newLocationPrompt.trim() ||
      'clean lived-in Indonesian indoor room with natural side window daylight and softly blurred everyday background details';
    lines.push(
      '',
      '3. ENVIRONMENT REPLACEMENT & RELIGHTING:',
      `- Replace the original background with: ${bgDesc}.`,
      '- Relight the character naturally so key light, rim light, and soft shadows on the face and clothing match this new environment seamlessly (no green-screen cutout edges).'
    );
  } else {
    lines.push(
      '',
      '3. SCENE PRESERVATION & SEAMLESS RELIGHTING:',
      '- Preserve the exact background environment, depth of field, and camera optics from the reference video.',
      '- Automatically relight the replaced character to match the exact light direction, color temperature, ambient shadows, and exposure of the reference video so the composite looks 100% native and unedited (zero pasted/cutout look, zero edge halo, zero ghosting).'
    );
  }

  if (segment.extraMotionNote?.trim()) {
    lines.push('', `ADDITIONAL DIRECTION: ${segment.extraMotionNote.trim()}`);
  }

  lines.push('', REALISM_LOCKS.videoRealism);

  if (segment.dialogueOverride?.trim()) {
    lines.push(
      '',
      `DIALOGUE / AUDIO OVERRIDE (Indonesian natural voice & accurate lip-sync matching the performance across ${dur}s): "${segment.dialogueOverride.trim()}"`
    );
  }

  return {
    prompt: lines.join('\n'),
    flowModeBadge: `Motion Clone • ${dur}s`,
    requiredAttachments: attachments,
  };
}
