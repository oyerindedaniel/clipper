import { spawn, ChildProcess } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { app } from "electron";
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

  public clipMarkers: ClipMarker[] = [];

  private constructor() {
    this.bufferDir = path.join(os.tmpdir(), "twitch-recorder-buffer");
    const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
    this.obsDir = path.join(
      isDev ? path.resolve(__dirname, "..", "..") : process.resourcesPath,
      "obs-studio-portable"
    );

    this.obsConfigDir = path.join(this.obsDir, "config", "obs-studio");

    logger.log(
      "🔧 Environment Setup:",
      `\n  Mode: ${isDev ? "Development" : "Production"}`,
      `\n  Buffer Dir: ${this.bufferDir}`,
      `\n  OBS Dir: ${this.obsDir}`,
      `\n  OBS Config Dir: ${this.obsConfigDir}`
    );

    fs.mkdirSync(this.bufferDir, { recursive: true });
    // this.initializeOBSConfig();
  }

  public static getInstance(): OBSRecordingService {
    if (!OBSRecordingService.instance) {
      OBSRecordingService.instance = new OBSRecordingService();
    }
    return OBSRecordingService.instance;
  }

  private initializeOBSConfig(windowTitle?: string): void {
    logger.log("🛠 Initializing OBS configuration...");

    if (!fs.existsSync(this.obsConfigDir)) {
      fs.mkdirSync(this.obsConfigDir, { recursive: true });
    }

    // === 1. Write Profile Configuration ===

    const profileDir = path.join(
      this.obsConfigDir,
      "basic",
      "profiles",
      "TwitchRecorder"
    );
    fs.mkdirSync(profileDir, { recursive: true });

    const basicConfig = `[General]
   Name=TwitchRecorder
   [Video]
   BaseCX=1920
   BaseCY=1080
   OutputCX=1920
   OutputCY=1080
   FPSType=0
   FPSCommon=30
   [Output]
   Mode=Simple
   FilePath=${this.bufferDir.replace(/\\/g, "/")}
   RecFormat=mkv
   RecEncoder=x264
   RecRB=false
   RecRBTime=20
   RecRBSize=512
   [Audio]
   SampleRate=44100
   ChannelSetup=Stereo
   `;

    const profileConfigPath = path.join(profileDir, "basic.ini");
    fs.writeFileSync(profileConfigPath, basicConfig);

    // === 2. Write Scene Collection File ===

    const scenesDir = path.join(this.obsConfigDir, "basic", "scenes");
    fs.mkdirSync(scenesDir, { recursive: true });

    const sceneCollection = {
      name: "TwitchRecorder",
      current_scene: "Recording Scene",
      current_program_scene: "Recording Scene",
      scene_order: [{ name: "Recording Scene" }],
      sources: [
        {
          name: "Recording Scene",
          id: "scene",
          type: "scene",
          settings: {
            items: [
              {
                name: "Window Capture",
                source_name: "Window Capture",
              },
              {
                name: "Desktop Audio",
                source_name: "Desktop Audio",
              },
            ],
          },
        },
        {
          name: "Window Capture",
          id: "window_capture",
          type: "window_capture",
          settings: {
            window: `electron.exe:${windowTitle}`,
            capture_cursor: true,
          },
        },
        {
          name: "Desktop Audio",
          id: "wasapi_output_capture",
          type: "wasapi_output_capture",
          settings: {
            device_id: "default",
          },
        },
      ],
      groups: [],
      version: 2,
    };

    const sceneCollectionPath = path.join(scenesDir, "TwitchRecorder.json");
    fs.writeFileSync(
      sceneCollectionPath,
      JSON.stringify(sceneCollection, null, 2)
    );

    // === 3. Write scenes.json pointer to select active scene collection ===
    const scenePointerPath = path.join(scenesDir, "scenes.json");
    const scenePointer = {
      current: "TwitchRecorder",
    };
    fs.writeFileSync(scenePointerPath, JSON.stringify(scenePointer, null, 2));

    logger.log("✅ OBS configuration written to disk");
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
      logger.warn("⚠️ Attempted to start recording while already active");
      return { success: false, error: "Recording already in progress" };
    }

    this.initializeOBSConfig(windowTitle);

    // Wait a moment for OBS to initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const obsPath = this.getOBSExecutable();
    if (!fs.existsSync(obsPath)) {
      logger.error("❌ OBS executable not found at", obsPath);
      return { success: false, error: "OBS executable not found." };
    }

    logger.log("▶️ Launching OBS for recording...");
    const startTime = Date.now();
    const outputPath = path.join(this.bufferDir, `recording_${startTime}.mkv`);

    try {
      // OBS CLI arguments for headless recording
      const args = [
        "--portable",
        "--profile",
        "TwitchRecorder",
        "--scene-collection",
        "TwitchRecorder",
        "--startrecording",
        "--disable-updater",
        "--minimize-to-tray",
      ];

      const obsProcess = spawn(obsPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: path.dirname(obsPath),
        env: process.env,
      });

      this.currentSession = {
        process: obsProcess,
        startTime,
        bufferFile: outputPath,
        windowTitle,
        isActive: true,
      };

      logger.log(
        `📽 OBS recording started at ${new Date(startTime).toISOString()}`
      );
      logger.log("📁 Output file path:", outputPath);

      obsProcess.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        logger.log("📊 OBS stdout:", output.trim());
      });

      obsProcess.stderr.on("data", (data: Buffer) => {
        const output = data.toString();
        if (output.includes("error") || output.includes("Error")) {
          logger.error("❌ OBS error:", output.trim());
        } else {
          logger.log("📊 OBS stderr:", output.trim());
        }
      });

      obsProcess.on("close", (code: number) => {
        logger.log("🏁 OBS process ended", { code });
        if (this.currentSession) {
          this.currentSession.isActive = false;
        }
      });

      obsProcess.on("error", (error: Error) => {
        logger.error("💥 OBS process error:", error);
        if (this.currentSession) {
          this.currentSession.isActive = false;
        }
      });

      this.startBufferCleanup();
      logger.log("✅ OBS recording started successfully");
      return { success: true };
    } catch (error) {
      logger.error("❌ Failed to start OBS recording:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public async stopRecording(): Promise<{ success: boolean }> {
    if (!this.currentSession?.isActive || !this.currentSession.process) {
      logger.warn("⚠️ No active recording to stop");
      return { success: false };
    }

    try {
      logger.log("🛑 Stopping OBS recording...");
      // Send stop recording command to OBS
      this.currentSession.process.kill("SIGTERM");
      this.currentSession.isActive = false;

      // Wait for OBS to finish writing the file
      await new Promise((resolve) => setTimeout(resolve, 2000));

      logger.log("✅ OBS recording stopped");
      return { success: true };
    } catch (error) {
      logger.error("❌ Error stopping OBS recording:", error);
      return { success: false };
    }
  }

  public async extractClip(
    startTimeMs: number,
    endTimeMs: number,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    logger.log("✂️ Extracting clip:", {
      startTimeMs,
      endTimeMs,
      outputPath,
    });

    if (!this.currentSession) {
      return { success: false, error: "No recording session available" };
    }

    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) {
      logger.error("❌ FFmpeg binary not found");
      return { success: false, error: "FFmpeg binary not found" };
    }

    try {
      const recordingFile = this.getCurrentRecordingFile();
      if (!recordingFile || !fs.existsSync(recordingFile)) {
        return { success: false, error: "Recording file not found" };
      }

      const startSeconds = startTimeMs / 1000;
      const duration = (endTimeMs - startTimeMs) / 1000;

      const args = [
        "-ss",
        startSeconds.toString(),
        "-i",
        recordingFile,
        "-t",
        duration.toString(),
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
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

  public async createClipMarker(
    preMarkDurationMs: number = DEFAULT_CLIP_PRE_MARK_MS,
    postMarkDurationMs: number = DEFAULT_CLIP_POST_MARK_MS
  ): Promise<ClipMarker | null> {
    if (!this.currentSession?.isActive) {
      logger.warn("⚠️ Cannot mark clip; no active recording");
      return null;
    }

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
        .filter(
          (file) => file.startsWith("recording_") && file.endsWith(".mkv")
        )
        .map((file) => ({
          name: file,
          path: path.join(this.bufferDir, file),
          mtime: fs.statSync(path.join(this.bufferDir, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      return files[0]?.path || null;
    } catch (error) {
      logger.error("Error finding current recording file:", error);
      return null;
    }
  }

  private async getEarliestPendingMarkerTime(): Promise<number | null> {
    try {
      const clipMarkers: ClipMarker[] = this.clipMarkers;
      if (!clipMarkers || clipMarkers.length === 0) {
        return null;
      }

      let earliestTime: number | null = null;
      for (const marker of clipMarkers) {
        // Use startTime, which accounts for preMarkDurationMs
        const markerStartTime = marker.startTime + marker.streamStart;
        if (earliestTime === null || markerStartTime < earliestTime) {
          earliestTime = markerStartTime;
        }
      }

      return earliestTime;
    } catch (error) {
      logger.error("⚠️ Failed to get clip markers for cleanup:", error);
      return null;
    }
  }

  private async startBufferCleanup(): Promise<void> {
    logger.log("🧼 Starting buffer cleanup loop");

    const cleanup = async () => {
      const cutoffTime = Date.now() - this.maxBufferDuration;
      const earliestMarkerTime = await this.getEarliestPendingMarkerTime();

      const safeCutoffTime =
        earliestMarkerTime !== null
          ? Math.max(cutoffTime, earliestMarkerTime)
          : cutoffTime;

      try {
        const files = fs.readdirSync(this.bufferDir);
        for (const file of files) {
          const filePath = path.join(this.bufferDir, file);
          const stats = fs.statSync(filePath);

          // Only delete files older than the safe cutoff
          if (stats.mtime.getTime() < safeCutoffTime) {
            // Verify the file is from the current session
            if (
              this.currentSession &&
              file.startsWith("recording_") &&
              file.endsWith(".mkv")
            ) {
              fs.unlinkSync(filePath);
              logger.log(`🗑 Deleted old buffer segment: ${file}`);
            }
          }
        }
      } catch (error) {
        logger.warn("Buffer cleanup warning:", error);
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
