import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  ClipExportData,
  ClipMarker,
  ClipOptions,
  ClipResponse,
  DesktopSource,
  ExportClip,
  ExportProgressInfo,
  RecordingStartedInfo,
} from "../src/types/app";

contextBridge.exposeInMainWorld("electronAPI", {
  openTwitchStream: (channelName: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("open-twitch-stream", channelName),

  startRecording: (sourceId?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("start-recording", sourceId),
  stopRecording: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("stop-recording"),
  remuxClip: (
    chunks: ArrayBuffer[],
    clipStartMs: number,
    clipEndMs: number,
    options: {
      convertAspectRatio?: string;
      cropMode?: "letterbox" | "crop" | "stretch";
    }
  ): Promise<ArrayBuffer> =>
    ipcRenderer.invoke("remux-clip", chunks, clipStartMs, clipEndMs, options),
  getClipMarkers: (): Promise<ClipMarker[]> =>
    ipcRenderer.invoke("get-clip-markers"),
  exportClip: (
    clip: ExportClip,
    data: ClipExportData
  ): Promise<{ success: boolean; outputPath: string }> =>
    ipcRenderer.invoke("export-clip", clip, data),
  selectOutputFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("select-output-folder"),
  getDesktopSources: (): Promise<DesktopSource[]> =>
    ipcRenderer.invoke("get-desktop-sources"),
  getStreamerName: (): Promise<string | null> =>
    ipcRenderer.invoke("get-streamer-name"),
  getClipBlob: (
    startTimeMs: number,
    endTimeMs: number,
    options: ClipOptions = {}
  ): Promise<ClipResponse> =>
    ipcRenderer.invoke("get-clip-blob", startTimeMs, endTimeMs, options),

  getBufferDuration: (): Promise<number> =>
    ipcRenderer.invoke("get-buffer-duration"),
  setClipDuration: (preDurationMs: number, postDurationMs: number) =>
    ipcRenderer.invoke("set-clip-duration", preDurationMs, postDurationMs),

  // Listeners for main process events
  onRecordingStarted: (
    callback: (_: IpcRendererEvent, info: RecordingStartedInfo) => void
  ): void => {
    ipcRenderer.on("recording-started", callback);
  },
  onRecordingStopped: (callback: (_: IpcRendererEvent) => void): void => {
    ipcRenderer.on("recording-stopped", callback);
  },
  onRecordingError: (
    callback: (_: IpcRendererEvent, message: string) => void
  ): void => {
    ipcRenderer.on("recording-error", callback);
  },
  onClipMarked: (
    callback: (_: IpcRendererEvent, marker: ClipMarker) => void
  ): void => {
    ipcRenderer.on("clip-marked", callback);
  },
  onExportProgress: (
    callback: (_: IpcRendererEvent, progressInfo: ExportProgressInfo) => void
  ): void => {
    ipcRenderer.on("export-progress", callback);
  },

  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel);
  },

  uploadClipToAWS: (
    clipMarker: ClipMarker
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("upload-clip-to-aws", clipMarker),
});

contextBridge.exposeInMainWorld("screenCapture", {
  getSources: (): Promise<DesktopSource[]> =>
    ipcRenderer.invoke("get-desktop-sources"),
});
