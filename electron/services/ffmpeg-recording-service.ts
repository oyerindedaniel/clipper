import {
  spawn,
  ChildProcessWithoutNullStreams,
  spawnSync,
} from "child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import logger from "../../src/utils/logger";
import { ClipMarker } from "../../src/types/app";
import {
  CLIP_BUFFER_MS,
  DEFAULT_CLIP_POST_MARK_MS,
  DEFAULT_CLIP_PRE_MARK_MS,
  WAIT_UNTIL_BUFFER_TIMEOUT_MS,
} from "../../src/constants/app";

interface RecordingSession {
  process: ChildProcessWithoutNullStreams | null;
  startTime: number;
  bufferFile: string;
  windowTitle?: string;
  isActive: boolean;
}

class FFmpegRecordingService {
  private static instance: FFmpegRecordingService | null = null;
  private currentSession: RecordingSession | null = null;
  private readonly bufferDir: string;
  private readonly maxBufferDuration = 15 * 60; // 15 minutes in seconds

  private constructor() {
    this.bufferDir = path.join(os.tmpdir(), "twitch-recorder-buffer");
    if (!fs.existsSync(this.bufferDir)) {
      fs.mkdirSync(this.bufferDir, { recursive: true });
    }
  }

  public static getInstance(): FFmpegRecordingService {
    if (!FFmpegRecordingService.instance) {
      FFmpegRecordingService.instance = new FFmpegRecordingService();
    }
    return FFmpegRecordingService.instance;
  }

  public async startRecording(
    windowTitle?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.currentSession?.isActive) {
      return { success: false, error: "Recording already in progress" };
    }

    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) {
      return { success: false, error: "FFmpeg binary not found" };
    }

    const startTime = Date.now();
    const bufferFile = path.join(this.bufferDir, `buffer_${startTime}.mkv`);

    try {
      const args = [
        "-f",
        "gdigrab",
        "-framerate",
        "30",
        "-video_size",
        "1920x1080",
        "-i",
        windowTitle ? `title=${windowTitle}` : "desktop",
        "-f",
        "wasapi",
        "-i",
        "audio=Stereo Mix",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-f",
        "segment",
        "-segment_time",
        "300",
        "-segment_format",
        "mkv",
        "-reset_timestamps",
        "1",
        path.join(this.bufferDir, `segment_${startTime}_%03d.mkv`),
      ];

      const ffmpegProcess = spawn(ffmpegPath, args);

      this.currentSession = {
        process: ffmpegProcess,
        startTime,
        bufferFile,
        windowTitle,
        isActive: true,
      };

      ffmpegProcess.stderr.on("data", (data: Buffer) => {
        const output = data.toString();
        if (output.includes("fps=") && Math.random() < 0.1) {
          logger.log("📊 FFmpeg status:", output.trim());
        } else if (/error/i.test(output)) {
          logger.error("❌ FFmpeg error:", output.trim());
        }
      });

      ffmpegProcess.on("close", (code: number) => {
        logger.log("🏁 FFmpeg process ended", { code });
        if (this.currentSession) {
          this.currentSession.isActive = false;
        }
      });

      ffmpegProcess.on("error", (error: Error) => {
        logger.error("💥 FFmpeg process error:", error);
        if (this.currentSession) {
          this.currentSession.isActive = false;
        }
      });

      this.startBufferCleanup();
      logger.log("✅ Recording started successfully");
      return { success: true };
    } catch (error) {
      logger.error("❌ Failed to start recording:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public async stopRecording(): Promise<{ success: boolean }> {
    if (!this.currentSession?.isActive || !this.currentSession.process) {
      return { success: false };
    }

    try {
      this.currentSession.process.kill("SIGTERM");
      this.currentSession.isActive = false;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: true };
    } catch (error) {
      logger.error("❌ Error stopping recording:", error);
      return { success: false };
    }
  }

  public async createClipMarker(
    preMarkDurationMs: number = DEFAULT_CLIP_PRE_MARK_MS,
    postMarkDurationMs: number = DEFAULT_CLIP_POST_MARK_MS
  ): Promise<ClipMarker | null> {
    if (!this.currentSession?.isActive) return null;

    try {
      await this.waitUntilBufferCatchesUp(postMarkDurationMs + CLIP_BUFFER_MS);
      const now = Date.now();
      const relativeTime = now - this.currentSession.startTime;
      const clipStart = Math.max(0, relativeTime - preMarkDurationMs);
      const clipEnd = relativeTime + postMarkDurationMs;

      return {
        id: `clip_${now}`,
        startTime: clipStart,
        endTime: clipEnd,
        markedAt: now,
        streamStart: this.currentSession.startTime,
        bufferFile: this.currentSession.bufferFile,
      };
    } catch (error) {
      logger.error("Failed to create clip marker:", error);
      return null;
    }
  }

  private async waitUntilBufferCatchesUp(
    target: number,
    timeout: number = WAIT_UNTIL_BUFFER_TIMEOUT_MS
  ): Promise<void> {
    const start = Date.now();
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const buffer = this.getBufferDuration();
        if (buffer >= target) return resolve();
        if (Date.now() - start > timeout)
          return reject(new Error("Buffer timeout"));
        setTimeout(check, 50);
      };
      check();
    });
  }

  public async extractClip(
    startTimeMs: number,
    endTimeMs: number,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    if (!this.currentSession) {
      return { success: false, error: "No recording session available" };
    }

    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) {
      return { success: false, error: "FFmpeg binary not found" };
    }

    try {
      const sessionStartTime = this.currentSession.startTime;
      const segmentFiles = fs
        .readdirSync(this.bufferDir)
        .filter(
          (file) =>
            file.startsWith(`segment_${sessionStartTime}_`) &&
            file.endsWith(".mkv")
        )
        .sort()
        .map((file) => path.join(this.bufferDir, file));

      if (segmentFiles.length === 0) {
        return { success: false, error: "No recording segments found" };
      }

      const concatFile = path.join(this.bufferDir, `concat_${Date.now()}.txt`);
      const concatContent = segmentFiles
        .map(
          (file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`
        )
        .join("\n");
      fs.writeFileSync(concatFile, concatContent);

      const startSeconds = startTimeMs / 1000;
      const duration = (endTimeMs - startTimeMs) / 1000;

      const args = [
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatFile,
        "-ss",
        startSeconds.toString(),
        "-t",
        duration.toString(),
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-y",
        outputPath,
      ];

      return new Promise((resolve) => {
        const ffmpegProcess = spawn(ffmpegPath, args);

        ffmpegProcess.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          if (output.includes("time=")) {
            logger.log("📊 Extraction progress:", output.trim());
          }
        });

        ffmpegProcess.on("close", (code: number) => {
          fs.unlinkSync(concatFile);
          if (code === 0) {
            resolve({ success: true, outputPath });
          } else {
            resolve({
              success: false,
              error: `FFmpeg exited with code ${code}`,
            });
          }
        });

        ffmpegProcess.on("error", (error: Error) => {
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      logger.error("❌ Clip extraction failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public getBufferDuration(): number {
    if (!this.currentSession || !this.currentSession.isActive) {
      return 0;
    }

    const ffprobePath = ffprobeStatic.path;
    if (!ffprobePath) {
      logger.error("ffprobe binary not found");
      return 0;
    }

    try {
      const sessionStartTime = this.currentSession.startTime;
      const segmentFiles = fs
        .readdirSync(this.bufferDir)
        .filter(
          (file) =>
            file.startsWith(`segment_${sessionStartTime}_`) &&
            file.endsWith(".mkv")
        )
        .sort()
        .map((file) => path.join(this.bufferDir, file));

      if (segmentFiles.length === 0) {
        return 0;
      }

      let totalDurationMs = 0;
      for (const file of segmentFiles) {
        const result = spawnSync(ffprobePath, [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "json",
          file,
        ]);

        if (result.status !== 0) {
          logger.warn(
            `Failed to probe duration for ${file}`,
            result.stderr.toString()
          );
          continue;
        }

        const output = JSON.parse(result.stdout.toString());
        const durationSec = parseFloat(output.format?.duration || "0");
        totalDurationMs += durationSec * 1000;
      }

      return totalDurationMs;
    } catch (error) {
      logger.error("Failed to calculate buffer duration:", error);
      return 0;
    }
  }

  public getRecordingStatus(): {
    isRecording: boolean;
    startTime: number | null;
    duration: number;
  } {
    const isRecording = this.currentSession?.isActive ?? false;
    const startTime = this.currentSession?.startTime ?? null;
    const duration = startTime ? Date.now() - startTime : 0;
    return { isRecording, startTime, duration };
  }

  private startBufferCleanup(): void {
    const cleanup = () => {
      const cutoffTime = Date.now() - this.maxBufferDuration * 1000;
      try {
        const files = fs.readdirSync(this.bufferDir);
        for (const file of files) {
          const filePath = path.join(this.bufferDir, file);
          const stats = fs.statSync(filePath);
          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (error) {
        logger.warn("Buffer cleanup warning:", error);
      }
    };
    setInterval(cleanup, 5 * 60 * 1000);
  }

  public cleanup(): void {
    if (this.currentSession?.process && this.currentSession.isActive) {
      this.currentSession.process.kill("SIGKILL");
    }
    this.currentSession = null;
  }
}

export default FFmpegRecordingService;
