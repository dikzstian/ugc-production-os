import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { AspectRatio, MotionSegment, StitchSettings } from '../src/types/studio';

const execFileAsync = promisify(execFile);

const FFMPEG_BIN = ffmpegInstaller.path;
const FFPROBE_BIN = ffprobeInstaller.path;

export interface VideoProbeInfo {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export async function probeVideo(filePath: string): Promise<VideoProbeInfo> {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-show_streams',
    '-of',
    'json',
    filePath,
  ]);

  const parsed = JSON.parse(stdout || '{}');
  const streams: any[] = parsed.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');
  const durationRaw =
    parseFloat(parsed.format?.duration) ||
    parseFloat(videoStream?.duration) ||
    8.0;

  return {
    durationSec: Number.isFinite(durationRaw) ? Math.round(durationRaw * 100) / 100 : 8.0,
    width: videoStream?.width || 720,
    height: videoStream?.height || 1280,
    hasAudio: Boolean(audioStream),
  };
}

export async function extractLastFrame(
  videoPath: string,
  outPngPath: string,
  offsetFromEndSec = 0.12
): Promise<{ durationSec: number }> {
  const info = await probeVideo(videoPath);
  const seekTime = Math.max(0, info.durationSec - offsetFromEndSec);

  await fs.promises.mkdir(path.dirname(outPngPath), { recursive: true });

  await execFileAsync(FFMPEG_BIN, [
    '-y',
    '-ss',
    seekTime.toFixed(2),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=iw:ih',
    outPngPath,
  ]);

  // Fallback to 0s if video container reported slightly inaccurate end duration
  if (!fs.existsSync(outPngPath)) {
    const safeSeek = Math.max(0, info.durationSec - 0.45);
    await execFileAsync(FFMPEG_BIN, [
      '-y',
      '-ss',
      safeSeek.toFixed(2),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      outPngPath,
    ]);
  }

  return { durationSec: info.durationSec };
}

function getTargetDimensions(ratio: AspectRatio): { w: number; h: number } {
  switch (ratio) {
    case '16:9':
      return { w: 1920, h: 1080 };
    case '3:4':
      return { w: 1080, h: 1440 };
    case '1:1':
      return { w: 1080, h: 1080 };
    case '9:16':
    default:
      return { w: 1080, h: 1920 };
  }
}

export interface ClipInputForStitch {
  videoPath: string;
  trimStartSec: number;
  trimEndSec: number;
}

export async function stitchVideoClips(
  clips: ClipInputForStitch[],
  aspectRatio: AspectRatio,
  settings: StitchSettings,
  outMp4Path: string,
  tempDir: string
): Promise<{ finalDurationSec: number }> {
  if (clips.length === 0) {
    throw new Error('Belum ada klip video MP4 yang siap digabungkan.');
  }

  await fs.promises.mkdir(tempDir, { recursive: true });
  await fs.promises.mkdir(path.dirname(outMp4Path), { recursive: true });

  const { w, h } = getTargetDimensions(aspectRatio);
  const normalizedPaths: string[] = [];
  const jobId = `job_${Date.now()}`;

  try {
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!fs.existsSync(clip.videoPath)) {
        throw new Error(`File video klip ke-${i + 1} tidak ditemukan: ${clip.videoPath}`);
      }

      const info = await probeVideo(clip.videoPath);
      const start = Math.max(0, clip.trimStartSec || 0);
      const endCut = Math.max(0, clip.trimEndSec || 0);
      const effectiveDur = Math.max(0.5, info.durationSec - start - endCut);

      const segPath = path.join(tempDir, `${jobId}_seg_${i}.mp4`);

      const vfParts = [
        `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`,
        'setsar=1',
        'fps=30',
      ];

      if (settings.applyRealismGrain) {
        // Subtle smartphone camera grain + natural organic micro-contrast
        vfParts.push('noise=alls=3:allf=t', 'eq=contrast=1.02:saturation=0.98');
      }
      vfParts.push('format=yuv420p');

      if (info.hasAudio) {
        const af = settings.normalizeAudio
          ? 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11'
          : 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';

        await execFileAsync(
          FFMPEG_BIN,
          [
            '-y',
            '-ss',
            start.toFixed(2),
            '-t',
            effectiveDur.toFixed(2),
            '-i',
            clip.videoPath,
            '-vf',
            vfParts.join(','),
            '-af',
            af,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '19',
            '-c:a',
            'aac',
            '-b:a',
            '160k',
            '-ar',
            '44100',
            '-ac',
            '2',
            segPath,
          ],
          { maxBuffer: 20 * 1024 * 1024 }
        );
      } else {
        // Synthesize clean silent stereo audio so concat never fails when mixing silent B-roll + dialogue clips
        await execFileAsync(
          FFMPEG_BIN,
          [
            '-y',
            '-ss',
            start.toFixed(2),
            '-t',
            effectiveDur.toFixed(2),
            '-i',
            clip.videoPath,
            '-f',
            'lavfi',
            '-t',
            effectiveDur.toFixed(2),
            '-i',
            'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-vf',
            vfParts.join(','),
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '19',
            '-c:a',
            'aac',
            '-b:a',
            '160k',
            '-shortest',
            segPath,
          ],
          { maxBuffer: 20 * 1024 * 1024 }
        );
      }

      normalizedPaths.push(segPath);
    }

    // Create FFmpeg concat list file
    const listFilePath = path.join(tempDir, `${jobId}_concat.txt`);
    const listContent = normalizedPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    await fs.promises.writeFile(listFilePath, listContent, 'utf-8');

    await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFilePath,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '20',
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        outMp4Path,
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    );

    await fs.promises.unlink(listFilePath).catch(() => {});
    for (const seg of normalizedPaths) {
      await fs.promises.unlink(seg).catch(() => {});
    }

    const finalInfo = await probeVideo(outMp4Path);
    return { finalDurationSec: finalInfo.durationSec };
  } catch (err) {
    for (const seg of normalizedPaths) {
      await fs.promises.unlink(seg).catch(() => {});
    }
    throw err;
  }
}

export async function sliceReferenceVideo(
  sourceVideoPath: string,
  maxSegmentSec: number,
  jobId: string,
  clipsDir: string,
  framesDir: string
): Promise<{
  sourceDurationSec: number;
  detectedRatio: AspectRatio;
  segments: MotionSegment[];
}> {
  const info = await probeVideo(sourceVideoPath);
  const detectedRatio: AspectRatio =
    info.width > info.height * 1.15
      ? '16:9'
      : Math.abs(info.width - info.height) < 90
      ? '1:1'
      : info.height / Math.max(1, info.width) < 1.5
      ? '3:4'
      : '9:16';

  const safeMax = Math.max(4, Math.min(15, maxSegmentSec || 15));
  const numSegs = Math.max(1, Math.ceil(Math.max(1, info.durationSec - 0.35) / safeMax));
  const eachDur = info.durationSec / numSegs;

  await fs.promises.mkdir(clipsDir, { recursive: true });
  await fs.promises.mkdir(framesDir, { recursive: true });

  const segments: MotionSegment[] = [];
  const ts = Date.now();

  for (let i = 0; i < numSegs; i++) {
    const startSec = Math.round(i * eachDur * 100) / 100;
    const rawSegDur =
      i === numSegs - 1 ? Math.max(1, info.durationSec - startSec) : eachDur;
    const clampedDur = Math.min(safeMax, Math.round(rawSegDur * 100) / 100);
    const endSec = Math.round((startSec + clampedDur) * 100) / 100;

    const segFile = `ref_${jobId}_seg${i + 1}_${ts}.mp4`;
    const segPath = path.join(clipsDir, segFile);
    const thumbFile = `refthumb_${jobId}_seg${i + 1}_${ts}.png`;
    const thumbPath = path.join(framesDir, thumbFile);

    await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-ss',
        startSec.toFixed(2),
        '-t',
        clampedDur.toFixed(2),
        '-i',
        sourceVideoPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '19',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        segPath,
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    );

    const thumbSeek = Math.min(clampedDur * 0.25, Math.max(0, clampedDur - 0.2));
    await execFileAsync(FFMPEG_BIN, [
      '-y',
      '-ss',
      thumbSeek.toFixed(2),
      '-i',
      segPath,
      '-frames:v',
      '1',
      thumbPath,
    ]).catch(() => {});

    segments.push({
      id: `mseg_${ts}_${i + 1}`,
      segmentNumber: i + 1,
      startSec,
      endSec,
      durationSec: Math.max(3, Math.round(clampedDur)),
      refClipUrl: `/media/clips/${segFile}`,
      refClipPath: segPath,
      refThumbUrl: fs.existsSync(thumbPath) ? `/media/frames/${thumbFile}` : undefined,
      dialogueOverride: '',
      extraMotionNote: '',
    });
  }

  return {
    sourceDurationSec: info.durationSec,
    detectedRatio,
    segments,
  };
}
