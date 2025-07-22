import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  dialog,
  IpcMainInvokeEvent,
  IpcMainEvent,
} from "electron";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import pQueue from "p-queue";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  ClipExportData,
  ClipMarker,
  StreamSession,
  StartRecordingResponse,
  StopRecordingResponse,
  MarkClipResponse,
  ExportClipResponse,
} from "../src/types/app";
import logger from "../src/utils/logger";
import DesktopCaptureManager from "./services/desktop-capture";

let mainWindow: BrowserWindow | null = null;
let twitchWindow: BrowserWindow | null = null;
let isRecording = false;
let recordingProcess: ChildProcessWithoutNullStreams | null = null;
let clipMarkers: ClipMarker[] = [];
let currentStream: StreamSession | null = null;

interface VideoDimensions {
  width: number;
  height: number;
}

const videoDimensionsCache = new Map<string, VideoDimensions>();

const bufferDir = path.join(os.tmpdir(), "twitch-recorder-buffer");
const captureManager = DesktopCaptureManager.getInstance();

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

logger.log({
  isDev,
  nodeEnv: process.env.NODE_ENV,
  isPackaged: app.isPackaged,
  __dirname,
  tempBufferDir: bufferDir,
});

if (!fs.existsSync(bufferDir)) {
  logger.log(`Creating buffer directory at: ${bufferDir}`);
  fs.mkdirSync(bufferDir, { recursive: true });
}

/**
 * Create the main application window.
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    // frame: false,
    // titleBarStyle: "hidden",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../out/index.html")}`;

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Create or focus the Twitch viewer window.
 */
function createTwitchWindow(channelName: string): void {
  if (twitchWindow) {
    twitchWindow.focus();
    return;
  }

  twitchWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    // parent: mainWindow ?? undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  twitchWindow.loadURL(`https://www.twitch.tv/${channelName}`, {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  twitchWindow.on("closed", () => {
    twitchWindow = null;
    if (isRecording) stopRecording();
  });
}

/**
 * Start recording by requesting renderer to handle it.
 */
async function startRecording(sourceId?: string): Promise<void> {
  if (isRecording) return;

  try {
    logger.log({ sourceId, twitchWindow });
    const source = await captureManager.findBestCaptureSource(
      sourceId,
      twitchWindow
    );

    if (!source) throw new Error("No suitable capture source found");

    // Request renderer to start recording and wait for response
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();

      // Set up response listener
      const responseHandler = (
        event: IpcMainEvent,
        response: StartRecordingResponse
      ) => {
        if (response.requestId === requestId) {
          ipcMain.removeListener("start-recording-response", responseHandler);

          if (response.success) {
            isRecording = true;
            currentStream = {
              startTime: Date.now(),
              sourceId: source.id,
              bufferFile: path.join(bufferDir, `buffer_${Date.now()}.webm`),
            };

            mainWindow?.webContents.send("recording-started", {
              sourceId: source.id,
              startTime: currentStream.startTime,
            });

            cleanOldBuffers();
            resolve();
          } else {
            reject(new Error(response.error || "Recording failed"));
          }
        }
      };

      ipcMain.on("start-recording-response", responseHandler);

      // Send request to renderer
      mainWindow?.webContents.send("request-start-recording", {
        sourceId: source.id,
        requestId,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Recording failed:", msg);

    captureManager.clearRetryCache();

    mainWindow?.webContents.send("recording-error", msg);
    throw err;
  }
}

/**
 * Stop recording by requesting renderer to handle it.
 */
async function stopRecording(): Promise<void> {
  if (!isRecording) return;

  return new Promise<void>((resolve) => {
    const requestId = Date.now().toString();

    // Set up response listener
    const responseHandler = (
      event: IpcMainEvent,
      response: StopRecordingResponse
    ) => {
      if (response.requestId === requestId) {
        ipcMain.removeListener("stop-recording-response", responseHandler);

        isRecording = false;
        currentStream = null;
        if (recordingProcess) {
          recordingProcess.kill();
          recordingProcess = null;
        }

        captureManager.clearRetryCache();

        mainWindow?.webContents.send("recording-stopped");
        resolve();
      }
    };

    ipcMain.on("stop-recording-response", responseHandler);

    // Send request to renderer
    mainWindow?.webContents.send("request-stop-recording", { requestId });
  });
}

/**
 * Mark a clip by requesting renderer to handle it.
 */
function markClip(): void {
  if (!isRecording || !currentStream) return;

  const requestId = Date.now().toString();

  // Set up response listener
  const responseHandler = (event: IpcMainEvent, response: MarkClipResponse) => {
    if (response.requestId === requestId) {
      ipcMain.removeListener("mark-clip-response", responseHandler);

      if (response.success && response.marker) {
        const marker: ClipMarker = {
          ...response.marker,
          streamStart: currentStream!.startTime,
          bufferFile: currentStream!.bufferFile,
        };

        logger.log({ marker });

        clipMarkers.push(marker);
        mainWindow?.webContents.send("clip-marked", marker);
      }
    }
  };

  ipcMain.on("mark-clip-response", responseHandler);

  // Send request to renderer
  mainWindow?.webContents.send("request-mark-clip", {
    requestId,
    streamStartTime: currentStream.startTime,
  });
}

/**
 * Export clip by requesting renderer to handle it.
 */
async function exportClip(
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  return new Promise((resolve, reject) => {
    const requestId = Date.now().toString();

    // Set up response listener
    const responseHandler = (
      event: IpcMainEvent,
      response: ExportClipResponse
    ) => {
      if (response.requestId === requestId) {
        ipcMain.removeListener("export-clip-response", responseHandler);

        if (response.success && response.blob) {
          // Handle the blob data from renderer and process with FFmpeg
          processClipForExport(response.blob, data).then(resolve).catch(reject);
        } else {
          reject(new Error(response.error || "Export failed"));
        }
      }
    };

    ipcMain.on("export-clip-response", responseHandler);

    // Send request to renderer
    mainWindow?.webContents.send("request-export-clip", {
      requestId,
      clipData: data,
    });
  });
}

/**
 * Process clip blob with FFmpeg
 */
async function processClipForExport(
  blobBuffer: ArrayBuffer,
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  try {
    const tempInput = path.join(bufferDir, `temp_clip_${Date.now()}.webm`);
    fs.writeFileSync(tempInput, Buffer.from(blobBuffer));

    const output = path.join(data.outputPath, `${data.outputName}.mp4`);

    const ffmpegPath = ffmpegStatic;

    if (!ffmpegPath) {
      throw new Error("FFmpeg binary not found");
    }

    const args = [
      "-i",
      tempInput,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-preset",
      "fast",
      "-crf",
      "23",
    ];

    // Add text overlay filters if present
    if (data.textOverlays && data.textOverlays.length > 0) {
      const drawTextFilters = data.textOverlays.map((overlay, index) => {
        // Convert relative position (0-1) to pixel position

        const x = `${overlay.x * 1920}`;
        const y = `${overlay.y * 1080}`;

        // Escape special characters in text
        const escapedText = overlay.text.replace(/[':']/g, "\\$&");

        let drawText = `drawtext=text='${escapedText}':x=${x}:y=${y}:fontsize=${overlay.fontSize}:fontcolor=${overlay.color}`;

        // Add timing if specified
        if (overlay.startTime > 0 || overlay.endTime < Infinity) {
          const startSec = overlay.startTime / 1000;
          const endSec =
            overlay.endTime === Infinity ? 999999 : overlay.endTime / 1000;
          drawText += `:enable='between(t,${startSec},${endSec})'`;
        }

        return drawText;
      });

      // Combine all drawtext filters
      const filterComplex = drawTextFilters.join(",");
      args.push("-vf", filterComplex);
    }

    args.push("-y", output);

    return new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, args);
      recordingProcess = ff;

      ff.stderr.on("data", (chunk) => {
        const m = chunk.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
        if (m) {
          mainWindow?.webContents.send("export-progress", {
            clipId: data.id,
            progress: m[1],
          });
        }
      });

      ff.on("close", (code) => {
        recordingProcess = null;
        try {
          fs.unlinkSync(tempInput);
        } catch (e) {
          logger.warn("Could not delete temp file:", e);
        }

        if (code === 0) {
          resolve({ success: true, outputPath: output });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ff.on("error", (err) => {
        recordingProcess = null;
        reject(err);
      });
    });
  } catch (error) {
    logger.error("Export failed:", error);
    throw error;
  }
}

/**
 * Remux a set of video chunks into a trimmed WebM and optionally convert aspect ratio
 */
export async function remuxClipWithFFmpeg(
  chunks: ArrayBuffer[],
  clipStartMs: number,
  clipEndMs: number,
  options?: {
    convertAspectRatio?: string; // e.g. "9:16", "16:9", etc.
    cropMode?: "letterbox" | "crop" | "stretch";
  }
): Promise<ArrayBuffer> {
  const sessionId = Date.now();
  const tempInput = path.join(bufferDir, `temp_remux_${sessionId}.webm`);
  const tempOutput = path.join(bufferDir, `temp_remux_out_${sessionId}.webm`);

  logger.log("🔧 Starting remux operation", {
    clipStartMs,
    clipEndMs,
    cropMode: options?.cropMode,
    convertAspectRatio: options?.convertAspectRatio,
  });

  try {
    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) throw new Error("FFmpeg binary not found");

    const combinedBuffer = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk))
    );
    fs.writeFileSync(tempInput, combinedBuffer);

    const startSec = (clipStartMs / 1000).toFixed(3);
    const durationSec = ((clipEndMs - clipStartMs) / 1000).toFixed(3);

    const args = [
      "-ss",
      startSec, // Seek to start position
      "-i",
      tempInput, // Input file
      "-t",
      durationSec, // Duration to extract
      "-c:v",
      "copy", // Copy video stream without re-encoding
      "-c:a",
      "copy", // Copy audio stream without re-encoding
      "-avoid_negative_ts",
      "make_zero", // Handle negative timestamps
      "-fflags",
      "+genpts", // Generate presentation timestamps
      "-map",
      "0:v:0", // Explicitly map first video stream
      "-map",
      "0:a:0", // Explicitly map first audio stream
      "-async",
      "1", // Audio sync method
      "-vsync",
      "passthrough", // Video sync method - pass timestamps through
      "-copyts", // Copy input timestamps
      "-start_at_zero", // Start output at zero timestamp
      "-y",
      tempOutput,
    ];

    logger.log("📦 FFmpeg remux args:", args);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffmpegPath, args);

      ff.stderr.on("data", (data) => logger.error(`[FFMPEG STDERR]: ${data}`));
      ff.stdout.on("data", (data) => logger.log(`[FFMPEG STDOUT]: ${data}`));

      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });

      ff.on("error", (err) => reject(err));
    });

    // Ensure the output file exists before proceeding
    if (!fs.existsSync(tempOutput)) {
      throw new Error("FFmpeg failed to create output file");
    }

    // Read the remuxed output
    let finalBuffer = fs.readFileSync(tempOutput);

    // 🖼️ Optional: Convert to target aspect ratio
    if (options?.convertAspectRatio) {
      logger.log("📐 Converting aspect ratio", {
        to: options.convertAspectRatio,
        mode: options.cropMode,
      });

      // Convert the buffer to ArrayBuffer for the aspect ratio conversion
      const bufferArrayBuffer = finalBuffer.buffer.slice(
        finalBuffer.byteOffset,
        finalBuffer.byteOffset + finalBuffer.byteLength
      );

      const converted = await convertVideoAspectRatio(
        bufferArrayBuffer,
        options.convertAspectRatio,
        options.cropMode || "letterbox"
      );

      return converted;
    }

    return finalBuffer.buffer.slice(
      finalBuffer.byteOffset,
      finalBuffer.byteOffset + finalBuffer.byteLength
    );
  } catch (error) {
    logger.error("❌ Remux failed:", error);
    throw error;
  } finally {
    // Clean up temp files
    try {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    } catch (cleanupError) {
      logger.warn("Failed to cleanup temp files:", cleanupError);
    }
  }
}

/**
 * Get video width and height from input file using FFprobe
 */
function getVideoDimensions(
  inputPath: string
): Promise<{ width: number; height: number }> {
  const ffprobePath = ffprobeStatic.path;

  if (!ffprobePath) {
    throw new Error("FFprobe binary not found");
  }

  return new Promise((resolve, reject) => {
    const ffprobe = spawn(ffprobePath, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      inputPath,
    ]);

    let output = "";

    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (err) => {
      logger.warn("ffprobe stderr:", err.toString());
    });

    ffprobe.on("close", () => {
      try {
        const info = JSON.parse(output);
        const { width, height } = info.streams[0];
        resolve({ width, height });
      } catch (err) {
        reject(new Error("Failed to parse ffprobe output"));
      }
    });

    ffprobe.on("error", (err) => {
      reject(err);
    });
  });
}

const conversionQueue = new pQueue({ concurrency: 1 });

/**
 * Convert video to different aspect ratio using FFmpeg
 */
async function convertVideoAspectRatio(
  inputBuffer: ArrayBuffer,
  targetAspectRatio: string,
  cropMode: "letterbox" | "crop" | "stretch" = "letterbox"
): Promise<ArrayBuffer> {
  const isValidAspect = /^\d+:\d+$/.test(targetAspectRatio);
  if (!isValidAspect) {
    logger.warn(
      "⚠️ Invalid or missing aspect ratio string. Skipping conversion."
    );
    return inputBuffer;
  }

  const tempInput = path.join(bufferDir, `temp_aspect_${Date.now()}.webm`);
  const tempOutput = path.join(bufferDir, `temp_aspect_out_${Date.now()}.webm`);

  try {
    const buffer = Buffer.from(inputBuffer);
    logger.log(`Input buffer size: ${buffer.length} bytes`);

    fs.writeFileSync(tempInput, buffer);

    if (!fs.existsSync(tempInput)) {
      logger.error(`File not created: ${tempInput}`);
      throw new Error(`Input file not found after writing: ${tempInput}`);
    }

    logger.log(
      `File written: ${tempInput}, size: ${fs.statSync(tempInput).size} bytes`
    );

    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) throw new Error("FFmpeg binary not found");

    const { width: inputW, height: inputH } = await getVideoDimensions(
      tempInput
    );
    logger.log("📏 Input video dimensions:", { width: inputW, height: inputH });

    const [targetW, targetH] = targetAspectRatio.split(":").map(Number);
    const targetRatio = targetW / targetH;

    let filterArgs: string[] = [];
    switch (cropMode) {
      case "letterbox": {
        const padW = Math.round(inputH * targetRatio);
        const padH = inputH;
        const scaleExpr = `scale='if(gt(a,${targetRatio}),${padW},-1)':'if(gt(a,${targetRatio}),-1,${padH})'`;
        const padExpr = `pad=${padW}:${padH}:(ow-iw)/2:(oh-ih)/2:color=white`;
        filterArgs = ["-vf", `${scaleExpr},${padExpr}`];
        break;
      }
      case "crop": {
        const cropW = Math.round(inputH * targetRatio);
        const cropH = inputH;
        const scaleExpr = `scale=-1:${cropH}`;
        const cropExpr = `crop=${cropW}:${cropH}`;
        filterArgs = ["-vf", `${scaleExpr},${cropExpr}`];
        break;
      }
      case "stretch": {
        const stretchW = Math.round(inputH * targetRatio);
        const stretchH = inputH;
        filterArgs = ["-vf", `scale=${stretchW}:${stretchH}`];
        break;
      }
    }

    const args = [
      "-i",
      tempInput,
      ...filterArgs,
      "-c:a",
      "copy",
      "-y",
      tempOutput,
    ];

    // const args = [
    //   "-i",
    //   tempInput,
    //   ...filterArgs,
    //   "-c:v",
    //   "libvpx-vp9",
    //   "-cpu-used",
    //   "4",
    //   "-c:a",
    //   "copy",
    //   "-y",
    //   tempOutput,
    // ];

    logger.log("FFmpeg args:", args);

    return new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, args);
      ff.stderr.on("data", (data) =>
        logger.log("[FFMPEG ASPECT]:", data.toString())
      );
      ff.on("close", (code) => {
        if (code === 0) {
          try {
            const outputBuffer = fs.readFileSync(tempOutput);
            fs.unlinkSync(tempOutput);
            resolve(
              outputBuffer.buffer.slice(
                outputBuffer.byteOffset,
                outputBuffer.byteOffset + outputBuffer.byteLength
              )
            );
          } catch (err) {
            reject(new Error("Failed to read output file"));
          }
        } else {
          logger.error(
            `FFmpeg failed with code ${code}, leaving temp files: ${tempInput}, ${tempOutput}`
          );
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      ff.on("error", (err) => reject(err));
    });
  } catch (error) {
    logger.error("Aspect ratio conversion failed:", error);
    throw error;
  } finally {
    // Only clean up if successful; retain files on failure
  }
}

/**
 * Remove outdated buffer files.
 */
function cleanOldBuffers(): void {
  const cutoff = Date.now() - 15 * 60 * 1000;
  try {
    for (const f of fs.readdirSync(bufferDir)) {
      const full = path.join(bufferDir, f);
      if (fs.statSync(full).mtime.getTime() < cutoff) fs.unlinkSync(full);
    }
  } catch (err) {
    logger.error("Buffer cleanup failed:", err);
  }
}

/**
 * Register all IPC channels.
 */
function setupIpc(): void {
  ipcMain.handle(
    "open-twitch-stream",
    (_: IpcMainInvokeEvent, channel: string) => {
      createTwitchWindow(channel);
      return { success: true };
    }
  );

  ipcMain.handle(
    "start-recording",
    async (_: IpcMainInvokeEvent, sourceId?: string) => {
      await startRecording(sourceId);
      return { success: true };
    }
  );

  ipcMain.handle("stop-recording", async () => {
    await stopRecording();
    return { success: true };
  });

  ipcMain.handle("get-clip-markers", () => clipMarkers);

  ipcMain.handle("export-clip", (_: IpcMainInvokeEvent, data: ClipExportData) =>
    exportClip(data)
  );

  ipcMain.handle("select-output-folder", async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
    });
    return !res.canceled && res.filePaths[0] ? res.filePaths[0] : null;
  });

  ipcMain.handle("get-desktop-sources", async () => {
    try {
      const sources = await captureManager.getDesktopSources();
      return sources;
    } catch (error) {
      logger.error("Failed to get desktop sources:", error);
      return [];
    }
  });

  ipcMain.handle(
    "remux-clip",
    async (
      _: IpcMainInvokeEvent,
      chunks: ArrayBuffer[],
      clipStartMs: number,
      clipEndMs: number,
      options: {
        convertAspectRatio?: string;
        cropMode?: "letterbox" | "crop" | "stretch";
      }
    ) => {
      return conversionQueue.add(() =>
        remuxClipWithFFmpeg(chunks, clipStartMs, clipEndMs, options)
      );
    }
  );
}

// App lifecycle
app.whenReady().then(() => {
  createMainWindow();
  setupIpc();

  globalShortcut.register("CommandOrControl+Shift+M", markClip);
  globalShortcut.register("CommandOrControl+Shift+R", () =>
    isRecording ? stopRecording() : startRecording()
  );

  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createMainWindow();
  });
});

app
  .on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  })
  .on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (isRecording) stopRecording();
    cleanOldBuffers();
  })
  .on("certificate-error", (event, _, url, __, ___, callback) => {
    if (url.includes("twitch.tv")) {
      event.preventDefault();
      callback(true);
    } else {
      callback(false);
    }
  });
