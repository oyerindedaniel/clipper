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
import { createCanvas, Canvas, CanvasRenderingContext2D } from "canvas";
import {
  ClipExportData,
  ClipMarker,
  StreamSession,
  StartRecordingResponse,
  StopRecordingResponse,
  MarkClipResponse,
  ExportClipResponse,
  TextOverlay,
  FontStyle,
  FontWeight,
} from "../src/types/app";
import logger from "../src/utils/logger";
import DesktopCaptureManager from "./services/desktop-capture";
import fontManager from "./services/font-manager";
import { normalizeError } from "../src/utils/error-utils";
import { parsePixels } from "../src/utils/app";

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

        if (response.success && response.blob && response.metadata) {
          // Handle the blob data from renderer and process with FFmpeg
          processClipForExport(response, data).then(resolve).catch(reject);
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
 * Render text overlay on canvas with full styling support including maxWidth
 */
function renderTextOverlay(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  videoDimensions: { width: number; height: number }
): void {
  if (!overlay.visible) return;

  const { width, height } = videoDimensions;

  const x = overlay.x * width;
  const y = overlay.y * height;

  let fontStyle = "";
  if (overlay.italic) fontStyle += "italic ";
  if (overlay.bold) fontStyle += "bold ";

  const actualFontFamily = fontManager.getFontFamily(
    overlay.fontFamily,
    overlay.bold ? "700" : "400",
    overlay.italic ? "italic" : "normal"
  );

  ctx.font = `${fontStyle}${overlay.fontSize}px "${actualFontFamily}"`;
  ctx.fillStyle = overlay.color;
  ctx.globalAlpha = overlay.opacity;

  logger.log(`🔤 Using font: ${ctx.font} (requested: ${overlay.fontFamily})`);

  const letterSpacing = parseInt(overlay.letterSpacing) || 0;
  const resolvedMaxWidth = parsePixels(overlay.maxWidth as string);
  const maxWidth = resolvedMaxWidth > 0 ? resolvedMaxWidth : width - x; // Use maxWidth or remaining screen width

  // Text alignment
  ctx.textAlign = overlay.alignment;
  let alignedX = x;
  if (overlay.alignment === "center") {
    alignedX = x;
    ctx.textAlign = "center";
  } else if (overlay.alignment === "right") {
    alignedX = x;
    ctx.textAlign = "right";
  }

  // Handle text wrapping and maxWidth
  const wrappedLines = wrapText(ctx, overlay.text, maxWidth, letterSpacing);
  const lineHeight = overlay.fontSize * 1.2; // Standard line height multiplier

  // Calculate total text block dimensions for background
  const totalTextHeight = wrappedLines.length * lineHeight;
  const maxLineWidth = Math.max(
    ...wrappedLines.map((line) =>
      measureTextWithSpacing(ctx, line, letterSpacing)
    )
  );

  // Background rendering (if specified)
  if (overlay.backgroundColor && overlay.backgroundColor !== "transparent") {
    const padding = 8;
    let bgX = alignedX - padding;
    let bgY = y - overlay.fontSize - padding;
    let bgWidth = Math.min(maxLineWidth, maxWidth) + padding * 2;
    let bgHeight = totalTextHeight + padding * 2;

    // Adjust background position based on alignment
    if (overlay.alignment === "center") {
      bgX = alignedX - bgWidth / 2;
    } else if (overlay.alignment === "right") {
      bgX = alignedX - bgWidth;
    }

    ctx.fillStyle = overlay.backgroundColor;
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

    // Reset fill style for text
    ctx.fillStyle = overlay.color;
  }

  // Render each line of wrapped text
  wrappedLines.forEach((line, lineIndex) => {
    const currentY = y + lineIndex * lineHeight;

    // Render text with letter spacing
    if (letterSpacing > 0) {
      renderTextWithSpacing(
        ctx,
        line,
        alignedX,
        currentY,
        letterSpacing,
        overlay.alignment,
        maxWidth
      );
    } else {
      // Use canvas maxWidth parameter for built-in text fitting
      if (resolvedMaxWidth > 0) {
        ctx.fillText(line, alignedX, currentY, resolvedMaxWidth);
      } else {
        ctx.fillText(line, alignedX, currentY);
      }
    }

    // Underline rendering for each line
    if (overlay.underline) {
      const lineWidth = measureTextWithSpacing(ctx, line, letterSpacing);
      const actualWidth = Math.min(lineWidth, maxWidth);
      const underlineY = currentY + 3;

      let underlineX = alignedX;
      if (overlay.alignment === "center") {
        underlineX = alignedX - actualWidth / 2;
      } else if (overlay.alignment === "right") {
        underlineX = alignedX - actualWidth;
      }

      ctx.strokeStyle = overlay.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(underlineX, underlineY);
      ctx.lineTo(underlineX + actualWidth, underlineY);
      ctx.stroke();
    }
  });

  // Reset global alpha
  ctx.globalAlpha = 1.0;
}

/**
 * Wrap text to fit within maxWidth, handling word breaks intelligently
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  letterSpacing: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine + (currentLine ? " " : "") + word;
    const testWidth = measureTextWithSpacing(ctx, testLine, letterSpacing);

    if (testWidth > maxWidth && currentLine) {
      // Current line is full, start a new line
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  // Add the last line
  if (currentLine) {
    lines.push(currentLine);
  }

  // Handle case where no words fit (shouldn't happen with reasonable maxWidth)
  return lines.length > 0 ? lines : [text];
}

/**
 * Measure text width including letter spacing
 */
function measureTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number
): number {
  if (letterSpacing <= 0) {
    return ctx.measureText(text).width;
  }

  let totalWidth = 0;
  for (let i = 0; i < text.length; i++) {
    totalWidth += ctx.measureText(text[i]).width;
    if (i < text.length - 1) {
      totalWidth += letterSpacing;
    }
  }
  return totalWidth;
}

/**
 * Render text with custom letter spacing and alignment within maxWidth
 */
function renderTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  alignment: TextOverlay["alignment"],
  maxWidth: number
): void {
  const totalWidth = measureTextWithSpacing(ctx, text, letterSpacing);
  const actualWidth = Math.min(totalWidth, maxWidth);

  let currentX = x;

  // Adjust starting position based on alignment
  if (alignment === "center") {
    currentX = x - actualWidth / 2;
  } else if (alignment === "right") {
    currentX = x - actualWidth;
  }

  // If text is wider than maxWidth, we need to compress the spacing
  const compressionRatio =
    actualWidth < totalWidth ? actualWidth / totalWidth : 1;
  const adjustedSpacing = letterSpacing * compressionRatio;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    ctx.fillText(char, currentX, y);
    currentX +=
      ctx.measureText(char).width + (i < text.length - 1 ? adjustedSpacing : 0);
  }
}

/**
 * Process clip blob with FFmpeg
 */
async function processClipForExport(
  response: ExportClipResponse,
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  const { blob, metadata } = response;

  logger.log("🎬 Starting clip export process", {
    clipId: data.id,
    outputName: data.outputName,
    startTime: data.startTime,
    endTime: data.endTime,
    hasBlob: !!blob,
    hasMetadata: !!metadata,
    blobSize: blob ? blob.byteLength : 0,
  });

  try {
    if (!blob || !metadata) throw new Error("Missing blob or metadata");

    const tempInput = path.join(bufferDir, `temp_clip_${Date.now()}.webm`);
    fs.writeFileSync(tempInput, Buffer.from(blob));

    logger.log("📁 Temporary input file created", {
      tempInput,
      fileSize: fs.statSync(tempInput).size,
    });

    const output = path.join(data.outputPath, `${data.outputName}.mp4`);

    logger.log("🎯 Output path configured", { output });

    const ffmpegPath = ffmpegStatic;

    if (!ffmpegPath) {
      throw new Error("FFmpeg binary not found");
    }

    const startSeconds = data.startTime / 1000;
    const endSeconds = data.endTime / 1000;
    const duration = endSeconds - startSeconds;

    logger.log("⏱️ Trimming parameters calculated", {
      startTime: data.startTime,
      endTime: data.endTime,
      startSeconds,
      endSeconds,
      duration,
    });

    const args = [
      "-ss",
      startSeconds.toString(), // Seek to start time
      "-i",
      tempInput,
      "-t",
      duration.toString(), // Duration to extract
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
      logger.log("📝 Processing text overlays", {
        overlayCount: data.textOverlays.length,
        videoDimensions: metadata.dimensions,
      });

      const drawTextFilters = data.textOverlays
        .map((overlay, index) => {
          // Convert relative position (0-1) to pixel position
          const x = `${overlay.x * metadata.dimensions.width}`;
          const y = `${overlay.y * metadata.dimensions.height}`;

          // Escape special characters in text
          const escapedText = overlay.text.replace(/[':']/g, "\\$&");

          let drawText = `drawtext=text='${escapedText}':x=${x}:y=${y}:fontsize=${overlay.fontSize}:fontcolor=${overlay.color}`;

          // Add timing if specified (adjust timing relative to clip start)
          if (overlay.startTime > 0 || overlay.endTime < Infinity) {
            // Adjust overlay timing relative to the trimmed clip
            const overlayStartSec = Math.max(
              0,
              overlay.startTime / 1000 - startSeconds
            );
            const overlayEndSec =
              overlay.endTime === Infinity
                ? duration
                : Math.min(duration, overlay.endTime / 1000 - startSeconds);

            logger.log(`🏷️ Overlay ${index + 1} timing adjusted`, {
              originalStart: overlay.startTime,
              originalEnd: overlay.endTime,
              adjustedStartSec: overlayStartSec,
              adjustedEndSec: overlayEndSec,
              text: overlay.text,
            });

            // Only add timing if the overlay should appear in the trimmed clip
            if (overlayStartSec < duration && overlayEndSec > 0) {
              drawText += `:enable='between(t,${overlayStartSec},${overlayEndSec})'`;
            } else {
              // Skip this overlay if it's completely outside the clip range
              logger.log(`⚠️ Overlay ${index} skipped - outside clip range`, {
                text: overlay.text,
                overlayStartSec,
                overlayEndSec,
                clipDuration: duration,
              });
              return null;
            }
          }

          return drawText;
        })
        .filter(Boolean);

      // Only add filter if we have valid overlays
      if (drawTextFilters.length > 0) {
        const filterComplex = drawTextFilters.join(",");
        args.push("-vf", filterComplex);
        logger.log("✅ Text overlay filters added", {
          filterCount: drawTextFilters.length,
          filterComplex,
        });
      } else {
        logger.log("⚠️ No valid text overlays to apply");
      }
    }

    args.push("-y", output);

    logger.log("🚀 Starting FFmpeg process", {
      ffmpegPath,
      args: args.join(" "),
      inputFile: tempInput,
      outputFile: output,
    });

    return new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, args);
      recordingProcess = ff;

      ff.stderr.on("data", (chunk) => {
        const chunkStr = chunk.toString();
        logger.log("📊 FFmpeg stderr:", chunkStr.trim());

        const m = chunkStr.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (m) {
          mainWindow?.webContents.send("export-progress", {
            clipId: data.id,
            progress: m[1],
          });
        }
      });

      ff.on("close", (code) => {
        recordingProcess = null;

        logger.log("🏁 FFmpeg process completed", {
          exitCode: code,
          clipId: data.id,
          outputPath: output,
        });

        try {
          fs.unlinkSync(tempInput);
          logger.log("🧹 Temporary input file cleaned up", { tempInput });
        } catch (e) {
          logger.warn("Could not delete temp file:", e);
        }

        if (code === 0) {
          logger.log("✅ Clip export successful", {
            clipId: data.id,
            outputPath: output,
            outputSize: fs.existsSync(output)
              ? fs.statSync(output).size
              : "unknown",
          });
          resolve({ success: true, outputPath: output });
        } else {
          const errorMsg = `FFmpeg exited with code ${code}`;
          logger.error("❌ FFmpeg failed", { code, clipId: data.id });
          reject(new Error(errorMsg));
        }
      });

      ff.on("error", (err) => {
        recordingProcess = null;
        logger.error("💥 FFmpeg process error", {
          error: err.message,
          clipId: data.id,
        });
        reject(err);
      });
    });
  } catch (error) {
    logger.error("💥 Export failed with exception", {
      error: error instanceof Error ? error.message : error,
      clipId: data.id,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Enhanced clip export with canvas-based text rendering
 */
async function processClipForExportWithCanvas(
  response: ExportClipResponse,
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  const { blob, metadata } = response;

  try {
    if (!blob || !metadata) throw new Error("Missing blob or metadata");

    logger.log("🎬 Starting canvas-based clip export", {
      clipId: data.id,
      videoDimensions: metadata.dimensions,
      overlayCount: data.textOverlays?.length || 0,
    });

    const tempInput = path.join(bufferDir, `temp_clip_${Date.now()}.webm`);
    fs.writeFileSync(tempInput, Buffer.from(blob));

    const output = path.join(data.outputPath, `${data.outputName}.mp4`);
    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) throw new Error("FFmpeg binary not found");

    const startSeconds = data.startTime / 1000;
    const endSeconds = data.endTime / 1000;
    const duration = endSeconds - startSeconds;

    // If we have text overlays, create overlay frames
    if (data.textOverlays && data.textOverlays.length > 0) {
      const overlayFramesDir = path.join(
        bufferDir,
        `overlay_frames_${Date.now()}`
      );
      fs.mkdirSync(overlayFramesDir, { recursive: true });

      await generateOverlayFrames(
        data.textOverlays,
        metadata.dimensions,
        duration,
        overlayFramesDir,
        30 // fps
      );

      // With overlay filter
      const args = [
        "-ss",
        startSeconds.toString(),
        "-i",
        tempInput,
        "-t",
        duration.toString(),
        "-framerate",
        "30",
        "-i",
        path.join(overlayFramesDir, "overlay_%04d.png"),
        "-filter_complex",
        "[0:v][1:v]overlay=0:0:enable='between(t,0," + duration + ")'",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-y",
        output,
      ];

      logger.log("🚀 Starting FFmpeg with canvas overlays", {
        args: args.join(" "),
      });

      return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, args);
        recordingProcess = ff;

        ff.stderr.on("data", (chunk) => {
          const chunkStr = chunk.toString();
          logger.log("📊 FFmpeg stderr:", chunkStr.trim());
        });

        ff.on("close", (code) => {
          recordingProcess = null;

          // Cleanup
          try {
            fs.unlinkSync(tempInput);
            fs.rmSync(overlayFramesDir, { recursive: true, force: true });
          } catch (e) {
            logger.warn("Cleanup warning:", e);
          }

          if (code === 0) {
            resolve({ success: true, outputPath: output });
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        ff.on("error", reject);
      });
    } else {
      // No overlays, use simple export
      const args = [
        "-ss",
        startSeconds.toString(),
        "-i",
        tempInput,
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
        output,
      ];

      return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, args);
        ff.on("close", (code) => {
          try {
            fs.unlinkSync(tempInput);
          } catch (e) {}
          if (code === 0) {
            resolve({ success: true, outputPath: output });
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });
        ff.on("error", reject);
      });
    }
  } catch (error) {
    logger.error("💥 Canvas export failed:", error);
    throw error;
  }
}

/**
 * Generate overlay frames using canvas
 */
async function generateOverlayFrames(
  overlays: TextOverlay[],
  videoDimensions: { width: number; height: number },
  duration: number,
  outputDir: string,
  fps: number
): Promise<void> {
  const totalFrames = Math.ceil(duration * fps);
  const canvas: Canvas = createCanvas(
    videoDimensions.width,
    videoDimensions.height
  );
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");

  logger.log("🎨 Generating overlay frames", {
    totalFrames,
    fps,
    duration,
    dimensions: videoDimensions,
  });

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const currentTimeMs = (frameIndex / fps) * 1000;

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, videoDimensions.width, videoDimensions.height);

    // Render overlays that should be visible at this time
    overlays.forEach((overlay) => {
      if (
        overlay.visible &&
        currentTimeMs >= overlay.startTime &&
        currentTimeMs <= overlay.endTime
      ) {
        renderTextOverlay(canvas, ctx, overlay, videoDimensions);
      }
    });

    // Save frame as PNG
    const frameBuffer = canvas.toBuffer("image/png");
    const framePath = path.join(
      outputDir,
      `overlay_${frameIndex.toString().padStart(4, "0")}.png`
    );
    fs.writeFileSync(framePath, frameBuffer);

    if (frameIndex % 30 === 0) {
      logger.log(`📸 Generated frame ${frameIndex}/${totalFrames}`);
    }
  }

  logger.log("✅ All overlay frames generated");
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
    expectedDurationMs: clipEndMs - clipStartMs,
    cropMode: options?.cropMode,
    convertAspectRatio: options?.convertAspectRatio,
    chunksCount: chunks.length,
    totalBufferSize: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  });

  try {
    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) throw new Error("FFmpeg binary not found");

    const combinedBuffer = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk))
    );
    fs.writeFileSync(tempInput, combinedBuffer);

    logger.log("📁 Input file written", {
      path: tempInput,
      size: fs.statSync(tempInput).size,
    });

    const startSec = (clipStartMs / 1000).toFixed(3);
    const requestedDurationSec = ((clipEndMs - clipStartMs) / 1000).toFixed(3);

    logger.log("⏱️ Remux parameters", {
      startSec,
      requestedDurationSec,
    });

    const args = [
      "-ss",
      startSec, // Seek to start position
      "-i",
      tempInput, // Input file
      "-t",
      requestedDurationSec, // Use requested duration, FFmpeg will stop when data runs out
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
      "-fps_mode",
      "passthrough", // Fixed deprecated -vsync
      "-copyts", // Copy input timestamps
      "-start_at_zero", // Start output at zero timestamp
      "-y",
      tempOutput,
    ];

    logger.log("📦 FFmpeg remux args:", args);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffmpegPath, args);

      ff.stderr.on("data", (data) => {
        const output = data.toString();
        logger.log(`[FFMPEG STDERR]: ${output.trim()}`);

        // Parse progress
        const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (timeMatch) {
          logger.log("📊 FFmpeg progress:", timeMatch[1]);
        }
      });

      ff.stdout.on("data", (data) => logger.log(`[FFMPEG STDOUT]: ${data}`));

      ff.on("close", (code) => {
        logger.log("🏁 FFmpeg process completed", { exitCode: code });
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });

      ff.on("error", (err) => {
        logger.error("💥 FFmpeg process error:", err);
        reject(err);
      });
    });

    if (!fs.existsSync(tempOutput)) {
      throw new Error("FFmpeg failed to create output file");
    }

    const outputStats = fs.statSync(tempOutput);
    logger.log("✅ Remux completed", {
      outputPath: tempOutput,
      outputSize: outputStats.size,
    });

    let finalBuffer = fs.readFileSync(tempOutput);

    if (
      options?.convertAspectRatio &&
      options.convertAspectRatio !== "original"
    ) {
      logger.log("📐 Converting aspect ratio", {
        to: options.convertAspectRatio,
        mode: options.cropMode,
      });

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

  ipcMain.handle("get-available-fonts", async () => {
    try {
      const fonts = fontManager.getAvailableFonts();
      logger.log("📝 Available fonts:", fonts);
      return fonts;
    } catch (error) {
      logger.error("Failed to get available fonts:", error);
      return [];
    }
  });

  ipcMain.handle(
    "register-custom-font",
    async (
      _: IpcMainInvokeEvent,
      fontPath: string,
      family: string,
      weight?: FontWeight,
      style?: FontStyle
    ) => {
      try {
        const success = fontManager.registerCustomFont(
          fontPath,
          family,
          weight,
          style
        );
        return { success };
      } catch (error) {
        logger.error("Failed to register custom font:", error);
        return { success: false, error: normalizeError(error).message };
      }
    }
  );

  ipcMain.handle(
    "load-fonts-from-directory",
    async (_: IpcMainInvokeEvent, directory: string) => {
      try {
        fontManager.loadFontsFromDirectory(directory);
        return { success: true };
      } catch (error) {
        logger.error("Failed to load fonts from directory:", error);
        return { success: false, error: normalizeError(error).message };
      }
    }
  );

  ipcMain.handle("select-font-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile"],
      filters: [
        { name: "Font Files", extensions: ["ttf", "otf", "woff", "woff2"] },
      ],
    });

    return !result.canceled && result.filePaths[0] ? result.filePaths[0] : null;
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
