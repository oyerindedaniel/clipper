import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  desktopCapturer,
  dialog,
  IpcMainInvokeEvent,
  IpcMainEvent,
} from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
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

const bufferDir = path.join(os.homedir(), "twitch-recorder-buffer");
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
    console.log({ sourceId, twitchWindow });
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

        console.log({ marker });

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
          processClipWithFFmpeg(response.blob, data)
            .then(resolve)
            .catch(reject);
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
async function processClipWithFFmpeg(
  blobBuffer: ArrayBuffer,
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  try {
    const tempInput = path.join(bufferDir, `temp_clip_${Date.now()}.webm`);
    fs.writeFileSync(tempInput, Buffer.from(blobBuffer));

    const output = path.join(data.outputPath, `${data.outputName}.mp4`);
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
      "-y",
      output,
    ];

    return new Promise((resolve, reject) => {
      const ff = spawn(path.join(__dirname, "../ffmpeg/ffmpeg"), args);
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

  ipcMain.handle("stop-recording", () => {
    stopRecording();
    return { success: true };
  });

  ipcMain.handle("get-clip-markers", () => clipMarkers);

  ipcMain.handle("export-clip", (_: IpcMainInvokeEvent, data) =>
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
