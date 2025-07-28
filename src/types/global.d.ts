import { IpcRendererEvent } from "electron";
import {
  ClipExportData,
  ClipMarker,
  ClipOptions,
  ClipResponse,
  DesktopSource,
  ExportProgressInfo,
  RecordingStartedInfo,
} from "@/types/app";

export interface ElectronAPI {
  openTwitchStream: (channelName: string) => Promise<{ success: boolean }>;
  startRecording: (
    sourceId?: string,
    resetBuffer?: boolean
  ) => Promise<{ success: boolean }>;
  stopRecording: () => Promise<{ success: boolean }>;
  setClipDuration: (
    durationMs: number
  ) => Promise<{ success: boolean; error?: string }>;
  getClipMarkers: () => Promise<ClipMarker[]>;
  getClipBlob: (
    startTimeMs: number,
    endTimeMs: number,
    options?: ClipOptions
  ) => Promise<ClipResponse>;
  getBufferDuration: () => Promise<number>;
  remuxClip: (
    chunks: ArrayBuffer[],
    clipStartMs: number,
    clipEndMs: number,
    options: {
      convertAspectRatio?: string;
      cropMode?: "letterbox" | "crop" | "stretch";
    }
  ) => Promise<ArrayBuffer>;
  exportClip: (
    clipData: ClipExportData
  ) => Promise<{ success: boolean; outputPath: string }>;
  selectOutputFolder: () => Promise<string | null>;
  getDesktopSources: () => Promise<DesktopSource[]>;
  getStreamerName: () => Promise<string | null>;
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
  }
}
