import { spawn, ChildProcess } from "child_process";
import ffmpegStatic from "ffmpeg-static";
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
  process: ChildProcess | null;
  startTime: number;
  bufferFile: string;
  windowTitle?: string;
  isActive: boolean;
}

class OBSRecordingService {
  private static instance: OBSRecordingService | null = null;
  private currentSession: RecordingSession | null = null;
  private readonly bufferDir: string;
  private readonly obsDir: string;
  private readonly obsConfigDir: string;
  private readonly maxBufferDuration = 15 * 60 * 1000; // ms
  private readonly sceneCollectionName = "TwitchRecorder";

  private constructor() {
    this.bufferDir = path.join(os.tmpdir(), "twitch-recorder-buffer");
    const isDev =
      !process.resourcesPath || process.resourcesPath === process.cwd();
    this.obsDir = path.join(
      isDev ? path.resolve(__dirname, "..", "..") : process.resourcesPath,
      "obs-studio-portable"
    );

    this.obsConfigDir = path.join(this.obsDir, "config", "portable_config");

    logger.log(
      "🔧 Environment Setup:",
      `\n  Mode: ${isDev ? "Development" : "Production"}`,
      `\n  Buffer Dir: ${this.bufferDir}`,
      `\n  OBS Dir: ${this.obsDir}`,
      `\n  OBS Config Dir: ${this.obsConfigDir}`
    );

    fs.mkdirSync(this.bufferDir, { recursive: true });
    this.initializeOBSConfig();
  }

  public static getInstance(): OBSRecordingService {
    if (!OBSRecordingService.instance) {
      OBSRecordingService.instance = new OBSRecordingService();
    }
    return OBSRecordingService.instance;
  }

  private initializeOBSConfig(): void {
    const scenesDir = path.join(this.obsConfigDir, "basic", "scenes");
    fs.mkdirSync(scenesDir, { recursive: true });

    const basicIni = `[General]\nName=${this.sceneCollectionName}`;
    fs.writeFileSync(path.join(this.obsConfigDir, "basic.ini"), basicIni);

    const sceneCollection = {
      current_scene: "Recording Scene",
      scenes: [
        {
          id: "scene",
          name: "Recording Scene",
          sources: [
            {
              id: "monitor_capture",
              name: "Display Capture",
              type: "monitor_capture",
              settings: { monitor: 0, capture_cursor: true },
            },
            {
              id: "wasapi_output_capture",
              name: "Desktop Audio",
              type: "wasapi_output_capture",
              settings: { device_id: "default" },
            },
          ],
        },
      ],
    };

    fs.writeFileSync(
      path.join(scenesDir, `${this.sceneCollectionName}.json`),
      JSON.stringify(sceneCollection, null, 2)
    );
  }

  private getOBSExecutable(): string {
    const platform = process.platform;
    if (platform === "win32") {
      return path.join(this.obsDir, "bin", "64bit", "obs64.exe");
    }
    if (platform === "darwin") {
      return path.join(this.obsDir, "OBS.app", "Contents", "MacOS", "OBS");
    }
    return path.join(this.obsDir, "bin", "obs");
  }

  public async startRecording(
    windowTitle?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.currentSession?.isActive) {
      return { success: false, error: "Recording already in progress" };
    }

    const obsPath = this.getOBSExecutable();
    if (!fs.existsSync(obsPath)) {
      return { success: false, error: "OBS executable not found." };
    }

    const startTime = Date.now();
    const outputPath = path.join(this.bufferDir, `recording_${startTime}.mkv`);

    const args = [
      "--portable",
      "--disable-updater",
      "--startrecording",
      "--scene-collection",
      this.sceneCollectionName,
      "--profile",
      this.sceneCollectionName,
    ];

    const proc = spawn(obsPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.currentSession = {
      process: proc,
      startTime,
      bufferFile: outputPath,
      windowTitle,
      isActive: true,
    };

    proc.stdout.on("data", (d) =>
      logger.log("📊 OBS stdout:", d.toString().trim())
    );
    proc.stderr.on("data", (d) =>
      logger.error("❌ OBS error:", d.toString().trim())
    );
    proc.on("close", () => (this.currentSession!.isActive = false));
    proc.on("error", (e) => {
      logger.error("💥 OBS process error:", e);
      this.currentSession!.isActive = false;
    });

    // Wait a moment for OBS to initialize
    await new Promise((res) => setTimeout(res, 3000));
    this.startBufferCleanup();
    return { success: true };
  }

  public async stopRecording(): Promise<{ success: boolean }> {
    if (!this.currentSession?.isActive || !this.currentSession.process) {
      return { success: false };
    }

    this.currentSession.process.kill("SIGTERM");
    this.currentSession.isActive = false;
    await new Promise((res) => setTimeout(res, 2000));
    return { success: true };
  }

  public async extractClip(
    startTimeMs: number,
    endTimeMs: number,
    output: string
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    if (!this.currentSession) {
      return { success: false, error: "No recording session available" };
    }

    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) {
      return { success: false, error: "FFmpeg binary not found" };
    }

    const file = this.getCurrentRecordingFile();
    if (!file) return { success: false, error: "No recording found" };

    const startSeconds = startTimeMs / 1000;
    const duration = (endTimeMs - startTimeMs) / 1000;

    const args = [
      "-ss",
      startSeconds.toString(),
      "-i",
      file,
      "-t",
      duration.toString(),
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      "-y",
      output,
    ];

    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath, args);
      proc.stderr.on("data", (data) =>
        logger.log("📊 FFmpeg:", data.toString())
      );
      proc.on("close", (code) =>
        resolve(
          code === 0
            ? { success: true, outputPath: output }
            : { success: false, error: `FFmpeg exited with ${code}` }
        )
      );
    });
  }

  public async createClipMarker(
    pre = DEFAULT_CLIP_PRE_MARK_MS,
    post = DEFAULT_CLIP_POST_MARK_MS
  ): Promise<ClipMarker | null> {
    if (!this.currentSession?.isActive) return null;

    await this.waitUntilBufferCatchesUp(post + CLIP_BUFFER_MS);
    const now = Date.now();
    const rel = now - this.currentSession.startTime;

    return {
      id: `clip_${now}`,
      startTime: Math.max(0, rel - pre),
      endTime: rel + post,
      markedAt: now,
      streamStart: this.currentSession.startTime,
      bufferFile: this.currentSession.bufferFile,
    };
  }

  private async waitUntilBufferCatchesUp(
    target: number,
    timeout = WAIT_UNTIL_BUFFER_TIMEOUT_MS
  ): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const buffered = this.getBufferDuration();
        if (buffered >= target) return resolve();
        if (Date.now() - start > timeout)
          return reject("Timeout waiting for buffer");
        setTimeout(check, 50);
      };
      check();
    });
  }

  public getBufferDuration(): number {
    if (!this.currentSession?.isActive) return 0;
    return Date.now() - this.currentSession.startTime;
  }

  public getRecordingStatus() {
    return {
      isRecording: this.currentSession?.isActive ?? false,
      startTime: this.currentSession?.startTime ?? null,
      duration: this.currentSession?.startTime
        ? Date.now() - this.currentSession.startTime
        : 0,
    };
  }

  private getCurrentRecordingFile(): string | null {
    if (!this.currentSession) return null;

    try {
      const files = fs
        .readdirSync(this.bufferDir)
        .filter((f) => f.endsWith(".mkv"))
        .map((f) => ({
          name: f,
          path: path.join(this.bufferDir, f),
          mtime: fs.statSync(path.join(this.bufferDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      return files[0]?.path || null;
    } catch (err) {
      logger.error("File lookup failed", err);
      return null;
    }
  }

  private async startBufferCleanup(): Promise<void> {
    const cleanup = async () => {
      const cutoff = Date.now() - this.maxBufferDuration;
      try {
        const files = fs.readdirSync(this.bufferDir);
        for (const file of files) {
          const fullPath = path.join(this.bufferDir, file);
          if (
            file.startsWith("recording_") &&
            fs.statSync(fullPath).mtime.getTime() < cutoff
          ) {
            fs.unlinkSync(fullPath);
            logger.log("🧹 Removed old file", file);
          }
        }
      } catch (err) {
        logger.warn("Cleanup failed", err);
      }
    };

    await cleanup();
    setInterval(cleanup, 5 * 60 * 1000);
  }

  public cleanup(): void {
    if (this.currentSession?.isActive) {
      this.currentSession.process?.kill("SIGKILL");
    }
    this.currentSession = null;
  }
}

export default OBSRecordingService;
