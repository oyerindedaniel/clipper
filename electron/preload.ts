import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  ClipExportData,
  ClipMarker,
  DesktopSource,
  ExportProgressInfo,
  MarkClipResponse,
  RecordingStartedInfo,
  StartRecordingResponse,
  StopRecordingResponse,
} from "../src/types/app";

/**
 * Exposed APIs for the renderer process.
 */
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
    clipEndMs: number
  ): Promise<ArrayBuffer> =>
    ipcRenderer.invoke("remux-clip", chunks, clipStartMs, clipEndMs),
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

  // Recording service communication
  onRequestStartRecording: (
    callback: (
      _: IpcRendererEvent,
      data: { sourceId: string; requestId: string }
    ) => void
  ): void => {
    ipcRenderer.on("request-start-recording", callback);
  },

  onRequestStopRecording: (
    callback: (_: IpcRendererEvent, data: { requestId: string }) => void
  ): void => {
    ipcRenderer.on("request-stop-recording", callback);
  },

  onRequestMarkClip: (
    callback: (
      _: IpcRendererEvent,
      data: { requestId: string; streamStartTime: number }
    ) => void
  ): void => {
    ipcRenderer.on("request-mark-clip", callback);
  },

  onRequestExportClip: (
    callback: (
      _: IpcRendererEvent,
      data: { requestId: string; clipData: ClipExportData }
    ) => void
  ): void => {
    ipcRenderer.on("request-export-clip", callback);
  },

  // Response senders
  sendStartRecordingResponse: (response: StartRecordingResponse): void => {
    ipcRenderer.send("start-recording-response", response);
  },

  sendStopRecordingResponse: (response: StopRecordingResponse): void => {
    ipcRenderer.send("stop-recording-response", response);
  },

  sendMarkClipResponse: (response: MarkClipResponse): void => {
    ipcRenderer.send("mark-clip-response", response);
  },

  sendExportClipResponse: (response: ExportProgressInfo): void => {
    ipcRenderer.send("export-clip-response", response);
  },

  // Existing listeners
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
