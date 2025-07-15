import { IpcRendererEvent } from "electron";
import {
  ClipExportData,
  ClipMarker,
  DesktopSource,
  ExportProgressInfo,
  RecordingStartedInfo,
} from "@/types/app";

interface IpcRenderer {
  sendMessage(channel: string, ...args: any[]): void;
  on(channel: string, func: (...args: any[]) => void): () => void;
  once(channel: string, func: (...args: any[]) => void): void;
}

interface DesktopCapturer {
  getSources(options: any): Promise<any[]>;
}

export interface ElectronAPI {
  openTwitchStream: (channelName: string) => Promise<{ success: boolean }>;
  startRecording: (sourceId?: string) => Promise<{ success: boolean }>;
  stopRecording: () => Promise<{ success: boolean }>;
  getClipMarkers: () => Promise<ClipMarker[]>;
  exportClip: (
    clipData: ClipExportData
  ) => Promise<{ success: boolean; outputPath: string }>;
  selectOutputFolder: () => Promise<string | null>;
  getDesktopSources: () => Promise<DesktopSource[]>;

  onRecordingStarted: (
    callback: (_: IpcRendererEvent, info: RecordingStartedInfo) => void
  ) => void;
  onRecordingStopped: (callback: (_: IpcRendererEvent) => void) => void;
  onRecordingError: (
    callback: (_: IpcRendererEvent, message: string) => void
  ) => void;
  onClipMarked: (
    callback: (_: IpcRendererEvent, marker: ClipMarker) => void
  ) => void;
  onExportProgress: (
    callback: (_: IpcRendererEvent, progressInfo: ExportProgressInfo) => void
  ) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    screenCapture: {
      getUserMedia: (
        constraints: MediaStreamConstraints
      ) => Promise<MediaStream>;
      getSources: () => Promise<DesktopSource[]>;
    };
  }
}
