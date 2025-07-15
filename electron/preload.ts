import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  ClipExportData,
  ClipMarker,
  DesktopSource,
  ExportProgressInfo,
  RecordingStartedInfo,
} from "@/types/app";

/**
 * Exposed APIs for the renderer process.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  openTwitchStream: (channelName: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("open-twitch-stream", channelName),

  startRecording: (sourceId?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("start-recording"),
  stopRecording: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("stop-recording"),

  getClipMarkers: (): Promise<ClipMarker[]> =>
    ipcRenderer.invoke("get-clip-markers"),
  exportClip: (
    clipData: ClipExportData
  ): Promise<{ success: boolean; outputPath: string }> =>
    ipcRenderer.invoke("export-clip", clipData),

  selectOutputFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("select-output-folder"),
  getDesktopSources: (): Promise<DesktopSource[]> =>
    ipcRenderer.invoke("get-desktop-sources"),

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
});

contextBridge.exposeInMainWorld("screenCapture", {
  getUserMedia: (constraints: MediaStreamConstraints): Promise<MediaStream> =>
    navigator.mediaDevices.getUserMedia(constraints),
  getSources: (): Promise<DesktopSource[]> =>
    ipcRenderer.invoke("get-desktop-sources"),
});
