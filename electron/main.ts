import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  desktopCapturer,
  dialog,
  IpcMainInvokeEvent,
} from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { ClipExportData, ClipMarker, StreamSession } from "../src/types/app";

let mainWindow: BrowserWindow | null = null;
let twitchWindow: BrowserWindow | null = null;
let isRecording = false;
let recordingProcess: ChildProcessWithoutNullStreams | null = null;
let clipMarkers: ClipMarker[] = [];
let currentStream: StreamSession | null = null;

const bufferDir = path.join(os.tmpdir(), "twitch-recorder-buffer");
if (!fs.existsSync(bufferDir)) {
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const isDev = process.env.NODE_ENV === "development";
  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../out/index.html")}`;

  mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Create or focus the Twitch viewer window.
 * @param channelName - Twitch channel to open
 */
function createTwitchWindow(channelName: string): void {
  if (twitchWindow) {
    twitchWindow.focus();
    return;
  }

  twitchWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    parent: mainWindow ?? undefined,
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
 * Start capturing desktop/window for recording.
 */
async function startRecording(): Promise<void> {
  if (isRecording) return;

  try {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
    });
    const source = sources.find((s) => /twitch|chrome/i.test(s.name));
    if (!source) throw new Error("No suitable capture source found");

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Recording failed:", msg);
    mainWindow?.webContents.send("recording-error", msg);
  }
}

/**
 * Stop the current recording session.
 */
function stopRecording(): void {
  if (!isRecording) return;

  isRecording = false;
  currentStream = null;
  if (recordingProcess) {
    recordingProcess.kill();
    recordingProcess = null;
  }
  mainWindow?.webContents.send("recording-stopped");
}

/**
 * Mark a clip segment around current time.
 */
function markClip(): void {
  if (!isRecording || !currentStream) return;

  const now = Date.now();
  const relative = now - currentStream.startTime;
  const marker: ClipMarker = {
    id: `clip_${now}`,
    startTime: Math.max(0, relative - 10_000),
    endTime: relative + 10_000,
    markedAt: now,
    streamStart: currentStream.startTime,
  };
  clipMarkers.push(marker);
  mainWindow?.webContents.send("clip-marked", marker);
}

/**
 * Remove outdated buffer files older than 15 minutes.
 */
function cleanOldBuffers(): void {
  const cutoff = Date.now() - 15 * 60 * 1000;
  try {
    for (const f of fs.readdirSync(bufferDir)) {
      const full = path.join(bufferDir, f);
      if (fs.statSync(full).mtime.getTime() < cutoff) fs.unlinkSync(full);
    }
  } catch (err) {
    console.error("Buffer cleanup failed:", err);
  }
}

/**
 * Export a marked clip using FFmpeg.
 * @param data - Clip export data
 * @returns success status and path to output file
 */
async function exportClip(
  data: ClipExportData
): Promise<{ success: boolean; outputPath: string }> {
  if (!currentStream) throw new Error("No active stream for export");

  const input = currentStream.bufferFile;
  const output = path.join(data.outputPath, `${data.outputName}.mp4`);
  const args = [
    "-i",
    input,
    "-ss",
    (data.startTime / 1000).toFixed(2),
    "-t",
    ((data.endTime - data.startTime) / 1000).toFixed(2),
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-preset",
    "fast",
    "-crf",
    "23",
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
    ff.on("close", (code) =>
      code === 0
        ? resolve({ success: true, outputPath: output })
        : reject(new Error(`FFmpeg exited ${code}`))
    );
    ff.on("error", reject);
  });
}

/**
 * Register all IPC channels for renderer communication.
 */
function setupIpc(): void {
  ipcMain.handle(
    "open-twitch-stream",
    (_: IpcMainInvokeEvent, channel: string) => {
      createTwitchWindow(channel);
      return { success: true };
    }
  );
  ipcMain.handle("start-recording", async () => {
    await startRecording();
    return { success: true };
  });
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
    const srcs = await desktopCapturer.getSources({
      types: ["window", "screen"],
    });
    return srcs.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
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
