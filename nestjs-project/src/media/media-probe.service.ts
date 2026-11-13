import { Injectable } from '@nestjs/common';
import { MEDIA_TIMEOUTS_MS } from './media.constants';
import { runProcess } from './run-process';

export interface MediaMetadata {
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  format_name: string | null;
  has_video_stream: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; format_name?: string };
}

@Injectable()
export class MediaProbeService {
  async probe(
    source: string,
    timeoutMs: number = MEDIA_TIMEOUTS_MS.PROBE,
  ): Promise<MediaMetadata> {
    const { stdout } = await runProcess(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        source,
      ],
      timeoutMs,
    );
    const output = JSON.parse(stdout) as FfprobeOutput;
    const streams = output.streams ?? [];
    const video = streams.find((s) => s.codec_type === 'video');
    const audio = streams.find((s) => s.codec_type === 'audio');
    const duration = Number.parseFloat(output.format?.duration ?? '');

    return {
      duration_seconds: Number.isFinite(duration) ? duration : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      video_codec: video?.codec_name ?? null,
      audio_codec: audio?.codec_name ?? null,
      format_name: output.format?.format_name ?? null,
      has_video_stream: video !== undefined,
    };
  }
}
