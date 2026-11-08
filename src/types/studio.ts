export type ContentMode = 'ugc' | 'storytelling';
export type FlowModelMode = 'omni_flash_15' | 'omni_hybrid' | 'veo_8';
export type AspectRatio = '9:16' | '16:9' | '3:4' | '1:1';
export type ContinuityMode = 'ingredients' | 'frame_chain' | 'broll_visual';
export type SpeechMode = 'lip_sync' | 'voice_over' | 'silent_broll';
export type AccountStatus = 'ready' | 'active' | 'exhausted';

export interface FlowAccount {
  id: string;
  name: string;
  emailHint: string;
  planTier: 'AI Pro' | 'AI Ultra' | 'Trial / Lainnya';
  creditsRemaining: number;
  creditsMax: number;
  costPerClip: number;
  status: AccountStatus;
  flowUrl: string;
  profileDirName: string;
  lastUsedAt?: string;
  notes?: string;
}

export interface CharacterAsset {
  id: string;
  name: string;
  demographic: string;
  appearance: string;
  defaultOutfit: string;
  speakingStyle: string;
  imageUrl?: string;
  filePath?: string;
  createdAt: string;
}

export interface ProductAsset {
  id: string;
  name: string;
  category: string;
  verifiedSpecs: string;
  bannedClaims: string;
  visualDetails: string;
  imageUrl?: string;
  filePath?: string;
  createdAt: string;
}

export interface SceneClip {
  id: string;
  sceneNumber: number;
  beatLabel: string;
  durationSec: number; // 5 - 8 seconds optimal for Google Flow Veo
  dialogue: string;
  speechMode: SpeechMode;
  shotType: string;
  actionDirection: string;
  gesture: string;
  continuityMode: ContinuityMode;
  customLocationOverride?: string;
  // Rendered output & continuity frame
  videoUrl?: string;
  videoPath?: string;
  actualDurationSec?: number;
  lastFrameUrl?: string;
  lastFramePath?: string;
  renderedByAccountId?: string;
  sourceDownloadPath?: string;
  trimStartSec?: number;
  trimEndSec?: number;
}

export interface StitchSettings {
  trimStartDefault: number;
  trimEndDefault: number;
  applyRealismGrain: boolean;
  normalizeAudio: boolean;
  copyToHasilUgc: boolean;
}

export interface StudioProject {
  id: string;
  title: string;
  contentMode: ContentMode;
  flowModel?: FlowModelMode;
  maxClipDurationSec?: number; // 3 - 15s for Omni Flash, 5 - 8s for Veo
  aspectRatio: AspectRatio;
  targetDurationSec: number;
  // Consistency Lock
  characterId?: string;
  productId?: string;
  useOutfitIngredient: boolean;
  useLocationIngredient: boolean;
  locationImageUrl?: string;
  locationImagePath?: string;
  scenePresetId: string;
  customLocation: string;
  lightingPresetId: string;
  cameraPresetId: string;
  // Copywriting / Story Settings
  personaId: string;
  customPersona: string;
  toneId: string;
  hookId: string;
  storyArcId: string;
  painPointOrPremise: string;
  ctaText: string;
  rawScript: string;
  // Multi-Scene (>10s) Pipeline
  scenes: SceneClip[];
  stitchSettings: StitchSettings;
  finalVideoUrl?: string;
  finalVideoPath?: string;
  finalDurationSec?: number;
  updatedAt: string;
  createdAt: string;
}

export interface AutoRunJob {
  id: string;
  projectId: string;
  mode: 'all' | 'pilot_s1' | 'rest';
  runner?: 'cdp' | 'ext';
  state: 'queued' | 'running' | 'done' | 'paused' | 'error' | 'cancelled';
  stepText: string;
  currentSceneNumber?: number;
  updatedAt: string;
}

export interface BridgeState {
  bridgeMode?: 'project' | 'motion';
  activeAccountId?: string;
  activeProjectId?: string;
  activeSceneId?: string;
  activeMotionJobId?: string;
  activeMotionSegmentId?: string;
  autoRunJob?: AutoRunJob;
  lastExtensionPingAt?: string;
}

export type MotionCloneMode =
  | 'character_swap'
  | 'character_and_product'
  | 'motion_new_bg';

export interface MotionSegment {
  id: string;
  segmentNumber: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  refClipUrl: string;
  refClipPath: string;
  refThumbUrl?: string;
  dialogueOverride: string;
  extraMotionNote: string;
  outputVideoUrl?: string;
  outputVideoPath?: string;
  outputDurationSec?: number;
}

export interface MotionCloneJob {
  id: string;
  title: string;
  cloneMode: MotionCloneMode;
  maxSegmentSec: number; // e.g., 15 for Omni Flash, 8 for Veo
  aspectRatio: AspectRatio;
  sourceVideoUrl?: string;
  sourceVideoPath?: string;
  sourceDurationSec?: number;
  characterId?: string;
  customCharImageUrl?: string;
  customCharImagePath?: string;
  productId?: string;
  customProdImageUrl?: string;
  customProdImagePath?: string;
  newLocationPrompt: string;
  preserveOriginalExpression: boolean;
  applyRealismGrain: boolean;
  copyToHasilUgc: boolean;
  segments: MotionSegment[];
  finalVideoUrl?: string;
  finalVideoPath?: string;
  finalDurationSec?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadsFileItem {
  filename: string;
  fullPath: string;
  sizeMb: number;
  modifiedAt: string;
}
