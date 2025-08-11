import { spawn, ChildProcess } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { app } from "electron";
import logger from "../../src/utils/logger";
import { ClipMarker, Success, Failure } from "../../src/types/app";
import {
  CLIP_BUFFER_MS,
  DEFAULT_CLIP_POST_MARK_MS,
  DEFAULT_CLIP_PRE_MARK_MS,
  WAIT_UNTIL_BUFFER_TIMEOUT_MS,
} from "../../src/constants/app";

interface RecordingSession {
  process: ChildProcess;
  startTime: number;
  windowTitle?: string;
  isActive: boolean;
}

class OBSRecordingService {
  private static instance: OBSRecordingService | null = null;
  private currentSession: RecordingSession | null = null;
  private readonly bufferDir: string;
  private readonly obsDir: string;
  private readonly obsConfigDir: string;

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
  }

  public static getInstance(): OBSRecordingService {
    if (!OBSRecordingService.instance) {
      OBSRecordingService.instance = new OBSRecordingService();
    }
    return OBSRecordingService.instance;
  }

  private initializeOBSConfig(windowTitle?: string): void {
    logger.log("🛠 Initializing OBS configuration...");

    fs.mkdirSync(this.obsConfigDir, { recursive: true });

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

[Output]
Mode=Simple
FilenameFormatting=%CCYY-%MM-%DD %hh-%mm-%ss
DelayEnable=false
DelaySec=20
DelayPreserve=true
Reconnect=true
RetryDelay=2
MaxRetries=25
BindIP=default
IPFamily=IPv4+IPv6
NewSocketLoopEnable=false
LowLatencyEnable=false

[Stream1]
IgnoreRecommended=false
EnableMultitrackVideo=false
MultitrackVideoMaximumAggregateBitrateAuto=true
MultitrackVideoMaximumVideoTracksAuto=true

[SimpleOutput]
FilePath=${this.bufferDir.replace(/\\/g, "/")}
RecFormat2=mkv
VBitrate=2500
ABitrate=160
UseAdvanced=false
Preset=veryfast
NVENCPreset2=p5
RecQuality=Small
RecRB=false
RecRBTime=20
RecRBSize=512
RecRBPrefix=Replay
StreamAudioEncoder=aac
RecAudioEncoder=aac
RecTracks=1
StreamEncoder=x264
RecEncoder=x264

[AdvOut]
ApplyServiceSettings=true
UseRescale=false
TrackIndex=1
VodTrackIndex=2
Encoder=obs_x264
RecType=Standard
RecFilePath=${this.bufferDir.replace(/\\/g, "/")}
RecFormat2=mkv
RecUseRescale=false
RecTracks=1
RecEncoder=none
FLVTrack=1
StreamMultiTrackAudioMixes=1
FFOutputToFile=true
FFFilePath=${this.bufferDir.replace(/\\/g, "/")}
FFExtension=mp4
FFVBitrate=2500
FFVGOPSize=250
FFUseRescale=false
FFIgnoreCompat=false
FFABitrate=160
FFAudioMixes=1
Track1Bitrate=160
Track2Bitrate=160
Track3Bitrate=160
Track4Bitrate=160
Track5Bitrate=160
Track6Bitrate=160
RecSplitFileTime=15
RecSplitFileSize=2048
RecRB=false
RecRBTime=20
RecRBSize=512
AudioEncoder=ffmpeg_aac
RecAudioEncoder=ffmpeg_aac

[Video]
BaseCX=1920
BaseCY=1080
OutputCX=1920
OutputCY=1080
FPSType=0
FPSCommon=30
FPSInt=30
FPSNum=30
FPSDen=1
ScaleType=bicubic
ColorFormat=NV12
ColorSpace=709
ColorRange=Partial
SdrWhiteLevel=300
HdrNominalPeakLevel=1000

[Audio]
MonitoringDeviceId=default
MonitoringDeviceName=Default
SampleRate=48000
ChannelSetup=Stereo
MeterDecayRate=23.53
PeakMeterType=0

[Panels]
CookieId=B589D39DEF8809C0
`;

    fs.writeFileSync(path.join(profileDir, "basic.ini"), basicConfig);

    // === 2. Write Scene Collection File ===
    const scenesDir = path.join(this.obsConfigDir, "basic", "scenes");
    fs.mkdirSync(scenesDir, { recursive: true });

    const sceneCollection = {
      DesktopAudioDevice1: {
        prev_ver: 520159234,
        name: "Desktop Audio",
        uuid: "8e37488f-1979-4161-8667-f776720c58c7",
        id: "wasapi_output_capture",
        versioned_id: "wasapi_output_capture",
        settings: {
          device_id: "default",
        },
        mixers: 255,
        sync: 0,
        flags: 0,
        volume: 1.0,
        balance: 0.5,
        enabled: true,
        muted: false,
        "push-to-mute": false,
        "push-to-mute-delay": 0,
        "push-to-talk": false,
        "push-to-talk-delay": 0,
        hotkeys: {
          "libobs.mute": [],
          "libobs.unmute": [],
          "libobs.push-to-mute": [],
          "libobs.push-to-talk": [],
        },
        deinterlace_mode: 0,
        deinterlace_field_order: 0,
        monitoring_type: 0,
        private_settings: {},
      },
      current_scene: "Scene",
      current_program_scene: "Scene",
      scene_order: [
        {
          name: "Scene",
        },
      ],
      name: "TwitchRecorder",
      sources: [
        {
          prev_ver: 520159234,
          name: "Scene",
          uuid: "c0224ae8-b84d-41ee-840d-837737bc9856",
          id: "scene",
          versioned_id: "scene",
          settings: {
            id_counter: 1,
            custom_size: false,
            items: [
              {
                name: "Window Capture",
                source_uuid: "da437634-8ed9-435c-9fc2-b72863d959d2",
                visible: true,
                locked: false,
                rot: 0.0,
                scale_ref: {
                  x: 1920.0,
                  y: 1080.0,
                },
                align: 5,
                bounds_type: 0,
                bounds_align: 0,
                bounds_crop: false,
                crop_left: 0,
                crop_top: 0,
                crop_right: 0,
                crop_bottom: 0,
                id: 1,
                group_item_backup: false,
                pos: {
                  x: 0.0,
                  y: 0.0,
                },
                pos_rel: {
                  x: -1.7777777910232544,
                  y: -1.0,
                },
                scale: {
                  x: 1.0,
                  y: 1.0,
                },
                scale_rel: {
                  x: 1.0,
                  y: 1.0,
                },
                bounds: {
                  x: 0.0,
                  y: 0.0,
                },
                bounds_rel: {
                  x: 0.0,
                  y: 0.0,
                },
                scale_filter: "disable",
                blend_method: "default",
                blend_type: "normal",
                show_transition: {
                  duration: 0,
                },
                hide_transition: {
                  duration: 0,
                },
                private_settings: {},
              },
            ],
          },
          mixers: 0,
          sync: 0,
          flags: 0,
          volume: 1.0,
          balance: 0.5,
          enabled: true,
          muted: false,
          "push-to-mute": false,
          "push-to-mute-delay": 0,
          "push-to-talk": false,
          "push-to-talk-delay": 0,
          hotkeys: {
            "OBSBasic.SelectScene": [],
            "libobs.show_scene_item.1": [],
            "libobs.hide_scene_item.1": [],
          },
          deinterlace_mode: 0,
          deinterlace_field_order: 0,
          monitoring_type: 0,
          canvas_uuid: "6c69626f-6273-4c00-9d88-c5136d61696e",
          private_settings: {},
        },
        {
          prev_ver: 520159234,
          name: "Window Capture",
          uuid: "da437634-8ed9-435c-9fc2-b72863d959d2",
          id: "window_capture",
          versioned_id: "window_capture",
          settings: {
            window: `${windowTitle || ""}:Chrome_WidgetWin_1:electron.exe`,
            capture_audio: true,
          },
          mixers: 255,
          sync: 0,
          flags: 0,
          volume: 1.0,
          balance: 0.5,
          enabled: true,
          muted: false,
          "push-to-mute": false,
          "push-to-mute-delay": 0,
          "push-to-talk": false,
          "push-to-talk-delay": 0,
          hotkeys: {
            "libobs.mute": [],
            "libobs.unmute": [],
            "libobs.push-to-mute": [],
            "libobs.push-to-talk": [],
          },
          deinterlace_mode: 0,
          deinterlace_field_order: 0,
          monitoring_type: 0,
          private_settings: {},
        },
      ],
      groups: [],
      quick_transitions: [
        {
          name: "Cut",
          duration: 300,
          hotkeys: [],
          id: 1,
          fade_to_black: false,
        },
        {
          name: "Fade",
          duration: 300,
          hotkeys: [],
          id: 2,
          fade_to_black: false,
        },
        {
          name: "Fade",
          duration: 300,
          hotkeys: [],
          id: 3,
          fade_to_black: true,
        },
      ],
      transitions: [],
      saved_projectors: [],
      canvases: [],
      current_transition: "Fade",
      transition_duration: 300,
      preview_locked: false,
      scaling_enabled: false,
      scaling_level: -12,
      scaling_off_x: 0.0,
      scaling_off_y: 0.0,
      modules: {
        "scripts-tool": [],
        "output-timer": {
          streamTimerHours: 0,
          streamTimerMinutes: 0,
          streamTimerSeconds: 30,
          recordTimerHours: 0,
          recordTimerMinutes: 0,
          recordTimerSeconds: 30,
          autoStartStreamTimer: false,
          autoStartRecordTimer: false,
          pauseRecordTimer: true,
        },
        "auto-scene-switcher": {
          interval: 300,
          non_matching_scene: "",
          switch_if_not_matching: false,
          active: false,
          switches: [],
        },
        captions: {
          source: "",
          enabled: false,
          lang_id: 2057,
          provider: "mssapi",
        },
      },
      resolution: {
        x: 1920,
        y: 1080,
      },
      version: 2,
    };

    fs.writeFileSync(
      path.join(scenesDir, "TwitchRecorder.json"),
      JSON.stringify(sceneCollection, null, 2)
    );

    // === 3. Write scenes.json to set active scene collection ===
    const scenePointer = {
      current: "TwitchRecorder",
      version: 1,
    };
    fs.writeFileSync(
      path.join(scenesDir, "scenes.json"),
      JSON.stringify(scenePointer, null, 2)
    );

    // === 4. Write global.ini to enforce profile & scene collection ===
    const globalIni = `[General]
ProfileDir=TwitchRecorder
SceneCollectionFile=TwitchRecorder
FirstRun=false
OpenStatsOnStartup=false
ShowWhatsNew=false
WarnBeforeStartingStream=false
WarnBeforeStoppingStream=false
RecordWhenStreaming=false
KeepRecordingWhenStreamStops=true
SysTrayEnabled=true
SysTrayWhenStarted=true
SaveProjectors=false
SnappingEnabled=true
ScreenSnapping=true
CenterSnapping=false
SourceSnapping=true
SnapDistance=10.0
FreeAspectRatio=false
AutoRemux=true
Theme=Dark
CurrentTheme=com.obsproject.Acri.Dark
Language=en-US
EnableAutoUpdates=false
HideOBSFromCapture=false
HotkeyFocusType=NeverDisableHotkeys
AdapterIdx=0
OpenStatsOnStartup=false
PauseRecordingWhenMinimized=false
AutoConfigRun=false
AutoConfig=false

[BasicWindow]
geometry=AdnQywADAAAAAAAAAAAAFwAAB38AAAQTAAAAAAAAABcAAAd/AAAEEwAAAAAAAAAAB4AAAAAAAAAAF
state=AAAA/wAAAAD9AAAAAgAAAAEAAAJcAAADgfwCAAAAAfsAAAAKAHMAYwBlAG4AZQBzAQAAADkAAAOBAAAA3AAEAB8AAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD9AAAAAwAAAAAAAAGAAAAC0fwBAAAAAfwAAAAAAAAAAAGAAAAA3wEAAAADAAAAAA==
SplitterState=eJxjYGBgkGACBiYgxowkwwwKDlDASoEBhjGBDhQKBQUFDiBCIBAAi8MB
DockLocked=true

[PropertiesWindow]
geometry=AdnQywADAAAAAAAAAAAAFwAAB38AAAQTAAAAAAAAABcAAAd/AAAEEwAAAAAAAAAAB4AAAAAAAAAAF

[SceneCollectionImporter]
geometry=AdnQywADAAAAAAAAAAAAFwAAB38AAAQTAAAAAAAAABcAAAd/AAAEEwAAAAAAAAAAB4AAAAAAAAAAF

[RemuxFiles]
geometry=AdnQywADAAAAAAAAAAAAFwAAB38AAAQTAAAAAAAAABcAAAd/AAAEEwAAAAAAAAAAB4AAAAAAAAAAF

[OBSApp]
FirstRun=false
`;

    const globalIniPath = path.join(this.obsConfigDir, "global.ini");
    fs.writeFileSync(globalIniPath, globalIni);

    logger.log(
      "✅ OBS configuration updated with performance-optimized settings"
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

  /**
   * Starts a new OBS recording session.
   *
   * @param windowTitle - Optional title of the window to record.
   */
  public async startRecording(
    windowTitle?: string
  ): Promise<Success<ChildProcess> | Failure<string>> {
    if (this.currentSession?.isActive) {
      logger.warn("⚠️ Attempted to start recording while already active");
      return { status: "error", error: "Recording already in progress" };
    }

    this.initializeOBSConfig(windowTitle);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const obsPath = this.getOBSExecutable();
    if (!fs.existsSync(obsPath)) {
      logger.error("❌ OBS executable not found at", obsPath);
      return { status: "error", error: "OBS executable not found." };
    }

    logger.log("▶️ Launching OBS for recording...");
    const startTime = Date.now();

    try {
      const args = [
        "--portable",
        "--profile",
        "TwitchRecorder",
        "--collection",
        "TwitchRecorder",
        "--disable-updater",
        "--disable-shutdown-check",
        "--unfiltered_log",
        "--verbose",
        "--minimize-to-tray",
        "--startrecording",
      ];

      const obsProcess = spawn(obsPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: path.dirname(obsPath),
        env: {
          ...process.env,
          OBS_USE_NEW_MPEGTS_OUTPUT: "false",
          OBS_DISABLE_AUTOUPDATE: "1",
          OBS_DISABLE_AUTO_CONFIG: "1",
        },
        detached: false,
      });

      this.currentSession = {
        process: obsProcess,
        startTime,
        windowTitle,
        isActive: true,
      };

      logger.log(
        `📽 OBS recording started at ${new Date(startTime).toISOString()}`
      );

      obsProcess.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        logger.log("📊 OBS stdout:", output.trim());
      });

      obsProcess.stderr.on("data", (data: Buffer) => {
        const output = data.toString();
        if (output.toLowerCase().includes("error")) {
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

      logger.log("✅ OBS recording started successfully");
      return { status: "success", data: obsProcess };
    } catch (error) {
      logger.error("❌ Failed to start OBS recording:", error);
      return {
        status: "error",
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

    let tempInputFile: string | null = null;

    try {
      const recordingFile = this.getCurrentRecordingFile();

      if (!recordingFile) {
        return { success: false, error: "Recording file not found" };
      }

      if (!fs.existsSync(recordingFile)) {
        return { success: false, error: "Recording file does not exist" };
      }

      logger.log("📁 Source recording file:", recordingFile);

      const bufferMs = 5000;
      const neededDurationMs = endTimeMs + bufferMs;

      tempInputFile = path.join(this.bufferDir, `temp_input_${Date.now()}.mkv`);
      const copyDurationSec = (neededDurationMs / 1000).toFixed(3);

      logger.log("📋 Creating temporary input file:", {
        tempInputFile,
        copyDurationSec,
      });

      const copyArgs = [
        "-i",
        recordingFile,
        "-t",
        copyDurationSec, // Copy only the duration we need + buffer
        "-c",
        "copy", // Stream copy (fast)
        "-avoid_negative_ts",
        "make_zero",
        "-y",
        tempInputFile,
      ];

      const copySuccess = await new Promise<boolean>((resolve) => {
        const copyProcess = spawn(ffmpegPath, copyArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let copyStderr = "";

        copyProcess.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          copyStderr += output;
          if (output.includes("time=")) {
            logger.log("📊 Copy progress:", output.trim());
          }
        });

        copyProcess.on("close", (code: number) => {
          logger.log("📋 Copy process completed:", {
            exitCode: code,
            tempFileExists: fs.existsSync(tempInputFile!),
            tempFileSize: fs.existsSync(tempInputFile!)
              ? fs.statSync(tempInputFile!).size
              : 0,
          });

          if (
            code === 0 &&
            fs.existsSync(tempInputFile!) &&
            fs.statSync(tempInputFile!).size > 0
          ) {
            resolve(true);
          } else {
            logger.error("❌ Copy failed:", copyStderr.slice(-500));
            resolve(false);
          }
        });

        copyProcess.on("error", (error: Error) => {
          logger.error("❌ Copy process error:", error);
          resolve(false);
        });
      });

      if (!copySuccess) {
        return {
          success: false,
          error: "Failed to create temporary copy of recording",
        };
      }

      // Extract the clip from the temporary file
      const startSec = (startTimeMs / 1000).toFixed(3);
      const durationSec = ((endTimeMs - startTimeMs) / 1000).toFixed(3);

      logger.log("✂️ Extracting from temporary file:", {
        startSec,
        durationSec,
        tempInputFile,
        outputPath,
      });

      const extractArgs = [
        "-ss",
        startSec, // Seek to start position
        "-i",
        tempInputFile, // Use temporary file as input
        "-t",
        durationSec, // Duration to extract
        "-c:v",
        "copy", // Copy video stream
        "-c:a",
        "copy", // Copy audio stream
        "-avoid_negative_ts",
        "make_zero",
        "-fflags",
        "+genpts",
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-y",
        outputPath,
      ];

      return new Promise((resolve) => {
        const extractProcess = spawn(ffmpegPath, extractArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let extractStderr = "";

        extractProcess.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          extractStderr += output;
          if (output.includes("time=")) {
            logger.log("📊 Extraction progress:", output.trim());
          }
        });

        extractProcess.on("close", (code: number) => {
          logger.log("✂️ Extraction completed:", {
            exitCode: code,
            outputExists: fs.existsSync(outputPath),
            outputSize: fs.existsSync(outputPath)
              ? fs.statSync(outputPath).size
              : 0,
          });

          // Clean up temp file
          if (tempInputFile && fs.existsSync(tempInputFile)) {
            try {
              fs.unlinkSync(tempInputFile);
              logger.log("🧹 Temporary input file cleaned up");
            } catch (cleanupError) {
              logger.warn("⚠️ Failed to clean up temp file:", cleanupError);
            }
          }

          if (code === 0 && fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            if (stats.size > 0) {
              resolve({ success: true, outputPath });
            } else {
              resolve({
                success: false,
                error: "Output file is empty",
              });
            }
          } else {
            resolve({
              success: false,
              error: `FFmpeg extraction failed with code ${code}. stderr: ${extractStderr.slice(
                -500
              )}`,
            });
          }
        });

        extractProcess.on("error", (error: Error) => {
          logger.error("❌ Extraction process error:", error);
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      logger.error("❌ Clip extraction failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
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
      const now = Date.now();
      const relativeTime = now - this.currentSession.startTime;
      const desiredEnd = relativeTime + postMarkDurationMs;
      const target = desiredEnd + CLIP_BUFFER_MS;

      await this.waitUntilBufferCatchesUp(
        target,
        target + WAIT_UNTIL_BUFFER_TIMEOUT_MS
      );

      const clipStart = Math.max(0, relativeTime - preMarkDurationMs);
      const clipEnd = desiredEnd;

      return {
        id: `clip_${now}`,
        startTime: clipStart,
        endTime: clipEnd,
        markedAt: now,
        streamStart: this.currentSession.startTime,
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
        .filter((file) => {
          const isMkv = file.endsWith(".mkv");

          const matchesOBSFormat =
            /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.mkv$/.test(file);

          return isMkv && matchesOBSFormat;
        })
        .map((file) => {
          const fullPath = path.join(this.bufferDir, file);
          return {
            name: file,
            path: fullPath,
            mtime: fs.statSync(fullPath).mtime,
          };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      return files[0]?.path ?? null;
    } catch (error) {
      logger.error("Error finding current recording file:", error);
      return null;
    }
  }

  public async cleanup(): Promise<void> {
    const session = this.currentSession;

    if (session?.isActive && session.process) {
      logger.log("🧹 Initiating OBS cleanup...");

      const process = session.process;

      try {
        process.kill("SIGTERM");

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (!process.killed) {
              logger.warn("⚠️ OBS did not exit in time; forcing kill");
              process.kill("SIGKILL");
            }
            resolve();
          }, 2000);

          process.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        logger.log("✅ OBS recording session cleaned up");
      } catch (error) {
        logger.error("❌ Error during OBS cleanup:", error);
      }
    }

    this.currentSession = null;
  }
}

export default OBSRecordingService;
