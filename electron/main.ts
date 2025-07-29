import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  dialog,
  IpcMainInvokeEvent,
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
  TextOverlay,
  FontStyle,
  FontWeight,
  ExportClip,
  ClipOptions,
  ClipResponse,
} from "../src/types/app";
import logger from "../src/utils/logger";
import DesktopCaptureManager from "./services/desktop-capture";
import fontManager from "./services/font-manager";
import { normalizeError } from "../src/utils/error-utils";
import {
  DEFAULT_CLIP_POST_MARK_MS,
  DEFAULT_CLIP_PRE_MARK_MS,
  EXPORT_BITRATE_MAP,
} from "../src/constants/app";
import OBSRecordingService from "./services/obs-recording-service";

const recordingService = OBSRecordingService.getInstance();

let mainWindow: BrowserWindow | null = null;
let twitchWindow: BrowserWindow | null = null;
let isRecording = false;
let recordingProcess: ChildProcessWithoutNullStreams | null = null;
let clipMarkers: ClipMarker[] = [];
let currentStream: StreamSession | null = null;

let postMarkDurationMs = DEFAULT_CLIP_POST_MARK_MS;

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
    const source = await captureManager.findBestCaptureSource(
      sourceId,
      twitchWindow
    );

    if (!source) throw new Error("No suitable capture source found");

    logger.log({ sourceName: source.name, twitchWindow });

    const result = await recordingService.startRecording(source.name);

    if (!result.success) {
      throw new Error(result.error || "Failed to start recording");
    }

    isRecording = true;
    currentStream = {
      startTime: Date.now(),
      sourceId: source.id,
      bufferFile: path.join(bufferDir, `buffer_${Date.now()}.mkv`),
    };

    mainWindow?.webContents.send("recording-started", {
      sourceId: source.id,
      startTime: currentStream.startTime,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Recording failed:", msg);

    mainWindow?.webContents.send("recording-error", msg);
    throw err;
  }
}

/**
 * Stop recording by requesting renderer to handle it.
 */
async function stopRecording(): Promise<void> {
  if (!isRecording) return;

  try {
    const result = await recordingService.stopRecording();
    if (!result.success) {
      throw new Error("Failed to stop recording");
    }

    isRecording = false;
    currentStream = null;
    recordingProcess = null;

    mainWindow?.webContents.send("recording-stopped");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Stop recording failed:", msg);
    mainWindow?.webContents.send("recording-error", msg);
    throw err;
  }
}

/**
 * Mark a clip by requesting renderer to handle it.
 */
async function markClip(): Promise<void> {
  if (!isRecording || !currentStream) return;

  try {
    const marker = await recordingService.createClipMarker(
      DEFAULT_CLIP_PRE_MARK_MS,
      postMarkDurationMs
    );
    if (!marker) return;

    const clipMarker: ClipMarker = {
      ...marker,
      streamStart: currentStream.startTime,
      bufferFile: currentStream.bufferFile,
      exported: false,
    };

    logger.log({ clipMarker });

    clipMarkers.push(clipMarker);
    recordingService.clipMarkers = clipMarkers;
    mainWindow?.webContents.send("clip-marked", clipMarker);
  } catch (error) {
    logger.error("Failed to mark clip:", error);
  }
}

async function clipBlob(
  startTimeMs: number,
  endTimeMs: number,
  options: ClipOptions = {}
): Promise<ClipResponse> {
  try {
    const tempOutputPath = path.join(bufferDir, `temp_clip_${Date.now()}.webm`);
    const result = await recordingService.extractClip(
      startTimeMs,
      endTimeMs,
      tempOutputPath
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to extract clip",
      };
    }

    let clipBuffer: Buffer;

    try {
      clipBuffer = fs.readFileSync(tempOutputPath);
    } catch (readError) {
      return { success: false, error: "Failed to read extracted clip file" };
    }

    if (
      options.convertAspectRatio &&
      options.convertAspectRatio !== "original"
    ) {
      try {
        const arrayBuffer = clipBuffer.buffer as ArrayBuffer;
        const slice = arrayBuffer.slice(
          clipBuffer.byteOffset,
          clipBuffer.byteOffset + clipBuffer.byteLength
        );

        const converted = await convertVideoAspectRatio(
          slice,
          options.convertAspectRatio,
          options.cropMode || "letterbox"
        );

        clipBuffer = Buffer.from(converted);
      } catch {
        // Keep original buffer if conversion fails
      }
    }

    const clipBlob = new Uint8Array(clipBuffer);

    try {
      fs.unlinkSync(tempOutputPath);
    } catch {}

    return { success: true, blob: clipBlob };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Export clip
 */
async function exportClip(
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  try {
    const output = path.join(data.outputPath, `${data.outputName}.mp4`);
    const result = await recordingService.extractClip(
      data.startTime,
      data.endTime,
      output
    );

    if (!result.success) {
      throw new Error(result.error || "Failed to export clip");
    }

    const clipIndex = clipMarkers.findIndex((marker) => marker.id === data.id);
    if (clipIndex !== -1) {
      clipMarkers[clipIndex] = { ...clipMarkers[clipIndex], exported: true };
      logger.log(`✅ Marked clip as exported: ${data.id}`);
    } else {
      logger.warn(`Clip marker not found for ID: ${data.id}`);
    }

    logger.log("✅ Clip exported successfully", { outputPath: output });
    return { success: true, outputPath: output };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Export clip failed:", msg);
    throw err;
  }
}

/**
 * Calculate appropriate scale factor based on video dimensions vs client display size
 */
function calculateScaleFactor(
  videoDimensions: { width: number; height: number },
  clientDisplaySize: { width: number; height: number }
): number {
  // Calculate scale factor based on the ratio of video to display size
  const videoAspectRatio = videoDimensions.width / videoDimensions.height;
  const displayAspectRatio = clientDisplaySize.width / clientDisplaySize.height;

  let scaleFactor: number;

  if (Math.abs(videoAspectRatio - displayAspectRatio) < 0.1) {
    logger.log("📏 Aspect ratios are similar. Scaling based on total area.");
    // Similar aspect ratios - scale based on area
    const videoArea = videoDimensions.width * videoDimensions.height;
    const displayArea = clientDisplaySize.width * clientDisplaySize.height;
    scaleFactor = Math.sqrt(videoArea / displayArea);
  } else {
    logger.log("⚠️ Aspect ratios differ. Scaling based on limiting dimension.");
    // Different aspect ratios - scale based on the limiting dimension
    const widthScale = videoDimensions.width / clientDisplaySize.width;
    const heightScale = videoDimensions.height / clientDisplaySize.height;
    scaleFactor = Math.max(widthScale, heightScale);
  }

  logger.log("✅ Scale factor within bounds:", scaleFactor);
  return scaleFactor;
}

/**
 * Render text overlay on canvas
 */
function renderTextOverlay(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  videoDimensions: { width: number; height: number },
  scaleFactor: number = 1.0,
  targetResolution?: { width: number; height: number }
): void {
  if (!overlay.visible) {
    logger.log("⛔ Overlay not visible, skipping render.");
    return;
  }

  const renderDimensions = targetResolution || videoDimensions;
  const { width: renderWidth, height: renderHeight } = renderDimensions;
  logger.log(`📐 Video dimensions: ${renderWidth} x ${renderHeight}`);

  // CSS padding from DraggableTextOverlay: "8px 12px" = top/bottom: 8px, left/right: 12px
  const basePaddingX = 12;
  const basePaddingY = 8;

  // Scale padding with scale factor
  const scaledPaddingX = Math.round(basePaddingX * scaleFactor);
  const scaledPaddingY = Math.round(basePaddingY * scaleFactor);
  const scaledFontSize = Math.round(overlay.fontSize * scaleFactor);

  // Set up font for text measurement
  let fontStyle = "";
  if (overlay.italic) fontStyle += "italic ";
  if (overlay.bold) fontStyle += "bold ";

  const weight = overlay.bold ? "700" : "400";
  const style = overlay.italic ? "italic" : "normal";

  const actualFontFamily = fontManager.getFontFamily(
    overlay.fontFamily,
    weight,
    style
  );

  ctx.font =
    `${style} ${weight} ${scaledFontSize}px "${actualFontFamily}"`.trim();
  ctx.fillStyle = overlay.color;
  ctx.globalAlpha = overlay.opacity;

  logger.log(`🔤 Using font: ${ctx.font}`);

  const scaledLetterSpacing = Math.round(
    (parseInt(overlay.letterSpacing) || 0) * scaleFactor
  );

  // Calculate content area width (maxWidth minus padding)
  const resolvedMaxWidth = parseFloat(overlay.maxWidth as string);
  const scaledMaxWidth =
    resolvedMaxWidth > 0 ? resolvedMaxWidth * scaleFactor : renderWidth * 0.8;
  const contentAreaWidth = scaledMaxWidth - 2 * scaledPaddingX;

  // Wrap text based on content area width
  const wrappedLines = wrapText(
    ctx,
    overlay.text,
    contentAreaWidth,
    scaledLetterSpacing
  );

  // Calculate actual content dimensions
  const maxLineWidth = Math.max(
    ...wrappedLines.map((line) =>
      measureTextWithSpacing(ctx, line, scaledLetterSpacing)
    )
  );
  const actualContentWidth = Math.min(maxLineWidth, contentAreaWidth);
  const scaledLineHeight = scaledFontSize * 1.2;
  const totalTextHeight = wrappedLines.length * scaledLineHeight;

  // Calculate div dimensions (content + padding)
  const divWidth = actualContentWidth + 2 * scaledPaddingX;
  const divHeight = totalTextHeight + 2 * scaledPaddingY;

  // Position div's border box at normalized coordinates
  const idealDivX = overlay.x * renderWidth;
  const idealDivY = overlay.y * renderHeight;

  // Clamp div to prevent clipping
  const clampedDivX = Math.max(0, Math.min(renderWidth - divWidth, idealDivX));
  const clampedDivY = Math.max(
    0,
    Math.min(renderHeight - divHeight, idealDivY)
  );

  logger.log("📦 Div positioning", {
    idealPosition: { x: idealDivX, y: idealDivY },
    clampedPosition: { x: clampedDivX, y: clampedDivY },
    divSize: { width: divWidth, height: divHeight },
    contentSize: { width: actualContentWidth, height: totalTextHeight },
    padding: { x: scaledPaddingX, y: scaledPaddingY },
  });

  // Draw background if specified
  if (overlay.backgroundColor && overlay.backgroundColor !== "transparent") {
    ctx.fillStyle = overlay.backgroundColor;
    logger.log(
      `🧱 Rendering background at (${clampedDivX}, ${clampedDivY}) with size ${divWidth} x ${divHeight}`
    );
    ctx.fillRect(clampedDivX, clampedDivY, divWidth, divHeight);
    ctx.fillStyle = overlay.color;
  }

  // Calculate content area position (inside padding)
  const contentAreaX = clampedDivX + scaledPaddingX;
  const contentAreaY = clampedDivY + scaledPaddingY;

  // Calculate text position based on alignment within content area
  let textX = contentAreaX;
  switch (overlay.alignment) {
    case "left":
      textX = contentAreaX;
      break;
    case "center":
      textX = contentAreaX + actualContentWidth / 2;
      break;
    case "right":
      textX = contentAreaX + actualContentWidth;
      break;
  }

  // Set text alignment for ctx.fillText
  ctx.textAlign = overlay.alignment;

  logger.log("🧭 Text positioning", {
    alignment: overlay.alignment,
    contentAreaX,
    textX,
    actualContentWidth,
  });

  // Render each line of text
  wrappedLines.forEach((line, lineIndex) => {
    const textY = contentAreaY + scaledFontSize + lineIndex * scaledLineHeight;

    if (scaledLetterSpacing > 0) {
      logger.log(`🖋️ Rendering with letter spacing at line ${lineIndex + 1}`);
      renderTextWithSpacing(
        ctx,
        line,
        textX,
        textY,
        scaledLetterSpacing,
        overlay.alignment,
        actualContentWidth
      );
    } else {
      logger.log(`🖋️ Rendering line ${lineIndex + 1} using fillText`);
      ctx.fillText(line, textX, textY, actualContentWidth);
    }

    // Draw underline if specified
    if (overlay.underline) {
      const lineWidth = measureTextWithSpacing(ctx, line, scaledLetterSpacing);
      const actualLineWidth = Math.min(lineWidth, actualContentWidth);
      const underlineY = textY + Math.round(3 * scaleFactor);

      let underlineX = textX;
      if (overlay.alignment === "center") {
        underlineX = textX - actualLineWidth / 2;
      } else if (overlay.alignment === "right") {
        underlineX = textX - actualLineWidth;
      }

      logger.log(
        `🧵 Drawing underline from (${underlineX}, ${underlineY}) to (${
          underlineX + actualLineWidth
        }, ${underlineY})`
      );

      ctx.strokeStyle = overlay.color;
      ctx.lineWidth = Math.round(2 * scaleFactor);
      ctx.beginPath();
      ctx.moveTo(underlineX, underlineY);
      ctx.lineTo(underlineX + actualLineWidth, underlineY);
      ctx.stroke();
    }
  });

  ctx.globalAlpha = 1.0;
  logger.log("✅ Text overlay rendering completed.\n");
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

      // Check if the single word itself is too wide - if so, force it anyway
      const wordWidth = measureTextWithSpacing(ctx, word, letterSpacing);
      if (wordWidth > maxWidth) {
        // Word is too long, but we have to include it
        lines.push(word);
        currentLine = "";
      }
    } else {
      currentLine = testLine;
    }
  }

  // Add the last line if it exists
  if (currentLine) {
    lines.push(currentLine);
  }

  // Ensure we always return at least one line
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
  clip: ExportClip,
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  const { blob, metadata } = clip;

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
          const clipIndex = clipMarkers.findIndex(
            (marker) => marker.id === data.id
          );
          if (clipIndex !== -1) {
            clipMarkers[clipIndex] = {
              ...clipMarkers[clipIndex],
              exported: true,
            };
            logger.log(`✅ Marked clip as exported: ${data.id}`);
          } else {
            logger.warn(`Clip marker not found for ID: ${data.id}`);
          }
          logger.log("✅ Clip export successful", {
            clipId: data.id,
            outputPath: output,
            outputSize: fs.existsSync(output)
              ? fs.statSync(output).size
              : "unknown",
          });
          mainWindow?.webContents.send("clip-exported", { clipId: data.id });
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
  clip: ExportClip,
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  const { blob, metadata } = clip;
  const { exportSettings, clientDisplaySize, targetResolution } = data;

  try {
    if (!blob || !metadata || !targetResolution || !clientDisplaySize) {
      throw new Error(
        "Missing blob, metadata, target resolution, or client display size"
      );
    }

    logger.log("🎬 Starting canvas-based clip export", {
      clipId: data.id,
      videoDimensions: metadata.dimensions,
      overlayCount: data.textOverlays?.length || 0,
      exportSettings: {
        preset: exportSettings.preset,
        crf: exportSettings.crf,
        fps: exportSettings.fps,
        format: exportSettings.format,
        resolution: exportSettings.resolution,
        bitrate: exportSettings.bitrate,
        customBitrateKbps: exportSettings.customBitrateKbps,
      },
      clientDisplaySize,
      targetResolution,
    });

    const tempInput = path.join(bufferDir, `temp_clip_${Date.now()}.webm`);
    fs.writeFileSync(tempInput, Buffer.from(blob));

    const outputFileName = `${data.outputName}.${exportSettings.format}`;
    const output = path.join(data.outputPath, outputFileName);
    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) throw new Error("FFmpeg binary not found");

    const startSeconds = data.startTime / 1000;
    const endSeconds = data.endTime / 1000;
    const duration = endSeconds - startSeconds;

    const targetFPS = exportSettings.fps;
    logger.log(
      "🎯 Using target FPS for overlay generation and export:",
      targetFPS
    );

    // Determine bitrate
    let finalBitrateKbps: number;
    const resolutionBitrates = EXPORT_BITRATE_MAP[exportSettings.resolution!];
    const fpsBitrates = resolutionBitrates
      ? resolutionBitrates[exportSettings.fps!]
      : undefined;

    if (
      exportSettings.bitrate === "custom" &&
      exportSettings.customBitrateKbps !== undefined
    ) {
      finalBitrateKbps = exportSettings.customBitrateKbps;
    } else if (exportSettings.bitrate === "high") {
      finalBitrateKbps = fpsBitrates?.high || 12000; // Default to 12Mbps
    } else if (exportSettings.bitrate === "min") {
      finalBitrateKbps = fpsBitrates?.min || 4000; // Default to 4Mbps
    } else {
      finalBitrateKbps = fpsBitrates?.standard || 8000; // Default to 8Mbps
    }
    finalBitrateKbps *= 1000; // Convert Mbps to Kbps

    logger.log("📊 Final bitrate for export:", finalBitrateKbps, "bps");

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
        targetFPS,
        clientDisplaySize,
        targetResolution
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
        targetFPS.toString(),
        "-i",
        path.join(overlayFramesDir, "overlay_%04d.png"),
        "-filter_complex",
        `[0:v]scale=${targetResolution.width}:${targetResolution.height}[scaled_video];` +
          `[scaled_video][1:v]overlay=0:0:enable='between(t,0,${duration})'[v]`,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-preset",
        exportSettings.preset,
        "-crf",
        exportSettings.crf.toString(),
        "-b:v",
        `${finalBitrateKbps}k`,
        "-r",
        targetFPS.toString(),
        "-f",
        exportSettings.format,
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
            const clipIndex = clipMarkers.findIndex(
              (marker) => marker.id === data.id
            );
            if (clipIndex !== -1) {
              clipMarkers[clipIndex] = {
                ...clipMarkers[clipIndex],
                exported: true,
              };
              logger.log(`✅ Marked clip as exported: ${data.id}`);
            } else {
              logger.warn(`Clip marker not found for ID: ${data.id}`);
            }

            mainWindow?.webContents.send("clip-exported", { clipId: data.id });
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
        "-s",
        `${targetResolution.width}x${targetResolution.height}`,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-preset",
        exportSettings.preset,
        "-crf",
        exportSettings.crf.toString(),
        "-b:v",
        `${finalBitrateKbps}k`,
        "-r",
        targetFPS.toString(),
        "-f",
        exportSettings.format,
        "-y",
        output,
      ];

      return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, args);
        ff.stderr.on("data", (chunk) => {
          const chunkStr = chunk.toString();
          logger.log("📊 FFmpeg stderr:", chunkStr.trim());
        });

        ff.on("close", (code) => {
          recordingProcess = null;

          try {
            fs.unlinkSync(tempInput);
          } catch (e) {}
          if (code === 0) {
            const clipIndex = clipMarkers.findIndex(
              (marker) => marker.id === data.id
            );
            if (clipIndex !== -1) {
              clipMarkers[clipIndex] = {
                ...clipMarkers[clipIndex],
                exported: true,
              };
              logger.log(`✅ Marked clip as exported: ${data.id}`);
            } else {
              logger.warn(`Clip marker not found for ID: ${data.id}`);
            }
            logger.log("✅ Clip export successful", {
              clipId: data.id,
              outputPath: output,
              outputSize: fs.existsSync(output)
                ? fs.statSync(output).size
                : "unknown",
            });
            mainWindow?.webContents.send("clip-exported", { clipId: data.id });
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
 * Get video frame rate
 */
async function getVideoFrameRate(inputPath: string): Promise<number> {
  const ffprobePath = ffprobeStatic.path;
  if (!ffprobePath) throw new Error("FFprobe binary not found");

  return new Promise((resolve, reject) => {
    const ffprobe = spawn(ffprobePath, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=r_frame_rate",
      "-of",
      "json",
      inputPath,
    ]);

    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.on("close", () => {
      try {
        const info = JSON.parse(output);
        const frameRate = info.streams[0].r_frame_rate;

        // Parse fractional frame rate like "30000/1001" or "30/1"
        const [numerator, denominator] = frameRate.split("/").map(Number);
        const fps = denominator ? numerator / denominator : numerator;

        logger.log("📊 Detected video FPS:", { frameRate, calculatedFPS: fps });
        resolve(Math.round(fps));
      } catch (err) {
        logger.warn("Could not detect FPS, defaulting to 30");
        resolve(30);
      }
    });

    ffprobe.on("error", reject);
  });
}

/**
 * Generate overlay frames
 */
async function generateOverlayFrames(
  overlays: TextOverlay[],
  videoDimensions: { width: number; height: number },
  duration: number,
  outputDir: string,
  fps: number,
  clientDisplaySize: { width: number; height: number },
  targetResolution?: { width: number; height: number }
): Promise<void> {
  const totalFrames = Math.ceil(duration * fps);

  const renderDimensions = targetResolution || videoDimensions;
  const { width: renderWidth, height: renderHeight } = renderDimensions;

  const canvas: Canvas = createCanvas(renderWidth, renderHeight);
  const ctx: CanvasRenderingContext2D = canvas.getContext("2d");

  const scaleFactor = calculateScaleFactor(videoDimensions, clientDisplaySize);

  logger.log("🧠 Generating overlay frames", {
    totalFrames,
    fps,
    duration,
    dimensions: videoDimensions,
    clientDisplaySize,
    scaleFactor,
  });

  // Calculate transition points where overlay visibility changes
  const transitionPoints = new Set<number>();

  overlays.forEach((overlay) => {
    const startFrame = Math.max(
      0,
      Math.floor((overlay.startTime / 1000) * fps)
    );
    const endFrame = Math.min(
      totalFrames - 1,
      Math.ceil((overlay.endTime / 1000) * fps)
    );

    transitionPoints.add(startFrame);
    transitionPoints.add(endFrame + 1); // Frame after end
  });

  // Includes first and last frame
  transitionPoints.add(0);
  transitionPoints.add(totalFrames - 1);

  const transitionArray = Array.from(transitionPoints).sort((a, b) => a - b);
  logger.log("🔑 Transition points identified:", transitionArray);

  // Unique overlay states
  const overlayStates = new Map<string, Buffer>();

  for (const frameIndex of transitionArray) {
    if (frameIndex >= totalFrames) continue;

    const currentTimeMs = (frameIndex / fps) * 1000;

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, videoDimensions.width, videoDimensions.height);

    // Determines visible overlays at this time
    const visibleOverlays = overlays.filter(
      (overlay) =>
        overlay.visible &&
        currentTimeMs >= overlay.startTime &&
        currentTimeMs <= overlay.endTime
    );

    // State key based on visible overlays
    const stateKey = visibleOverlays
      .map((o) => `${o.text}-${o.x}-${o.y}-${o.startTime}-${o.endTime}`)
      .join("|");

    // Only generate new buffer if state hasn't been seen before
    if (!overlayStates.has(stateKey)) {
      // Render overlays
      visibleOverlays.forEach((overlay) => {
        renderTextOverlay(
          canvas,
          ctx,
          overlay,
          videoDimensions,
          scaleFactor,
          targetResolution
        );
      });

      const frameBuffer = canvas.toBuffer("image/png");
      overlayStates.set(stateKey, frameBuffer);

      logger.log(
        `🎨 Generated unique overlay state: ${stateKey.substring(0, 50)}...`
      );
    }
  }

  logger.log(`📊 Generated ${overlayStates.size} unique overlay states`);

  // Map each frame to its appropriate overlay state
  let currentTransitionIndex = 0;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    // Check if we need to move to next transition
    if (
      currentTransitionIndex < transitionArray.length - 1 &&
      frameIndex >= transitionArray[currentTransitionIndex + 1]
    ) {
      currentTransitionIndex++;
    }

    const currentTimeMs = (frameIndex / fps) * 1000;
    const visibleOverlays = overlays.filter(
      (overlay) =>
        overlay.visible &&
        currentTimeMs >= overlay.startTime &&
        currentTimeMs <= overlay.endTime
    );

    const stateKey = visibleOverlays
      .map((o) => `${o.text}-${o.x}-${o.y}-${o.startTime}-${o.endTime}`)
      .join("|");

    const frameBuffer = overlayStates.get(stateKey) || overlayStates.get("");

    if (frameBuffer) {
      const framePath = path.join(
        outputDir,
        `overlay_${frameIndex.toString().padStart(4, "0")}.png`
      );
      fs.writeFileSync(framePath, frameBuffer);
    }

    // Log progress every 60 frames
    if (frameIndex % 60 === 0) {
      logger.log(`📸 Processed frame ${frameIndex}/${totalFrames}`);
    }
  }

  logger.log("✅ Overlay frames generated with state-based optimization", {
    totalFrames,
    uniqueStates: overlayStates.size,
    optimizationRatio: `${(
      (1 - overlayStates.size / totalFrames) *
      100
    ).toFixed(1)}%`,
  });
}

/**
 * Remux a set of video chunks into a trimmed WebM and optionally convert aspect ratio
 */
export async function remuxClip(
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

        logger.log("📐 Letterbox scale and pad expressions:", {
          scaleExpr,
          padExpr,
        });

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
      try {
        await startRecording(sourceId);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-clip-blob",
    async (
      _: IpcMainInvokeEvent,
      startTimeMs: number,
      endTimeMs: number,
      options: ClipOptions = {}
    ) => {
      await clipBlob(startTimeMs, endTimeMs, options);
    }
  );

  ipcMain.handle("get-buffer-duration", (): number => {
    const status = recordingService.getRecordingStatus();
    return status.duration;
  });

  ipcMain.handle(
    "set-clip-duration",
    async (_: IpcMainInvokeEvent, durationMs: number) => {
      try {
        if (durationMs <= 0) {
          throw new Error("Duration must be positive");
        }
        postMarkDurationMs = durationMs;
        logger.log("Set post-mark clip duration:", { durationMs });
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logger.error("Failed to set clip duration:", msg);
        return { success: false, error: msg };
      }
    }
  );

  ipcMain.handle("stop-recording", async () => {
    try {
      await stopRecording();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("get-clip-markers", () => clipMarkers);

  ipcMain.handle(
    "export-clip",
    async (_: IpcMainInvokeEvent, clip: ExportClip, data: ClipExportData) => {
      try {
        return await processClipForExportWithCanvas(clip, data);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }
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

  ipcMain.handle("get-streamer-name", () => {
    if (twitchWindow) {
      const url = twitchWindow.webContents.getURL();
      const match = url.match(/twitch\.tv\/([^/\?]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
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
        remuxClip(chunks, clipStartMs, clipEndMs, options)
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
    fontManager.cleanup();
    globalShortcut.unregisterAll();
    if (isRecording) stopRecording();
    recordingService.cleanup();
  })
  .on("certificate-error", (event, _, url, __, ___, callback) => {
    if (url.includes("twitch.tv")) {
      event.preventDefault();
      callback(true);
    } else {
      callback(false);
    }
  });
