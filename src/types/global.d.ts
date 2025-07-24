import { IpcRendererEvent } from "electron";
import {
  ClipExportData,
  ClipMarker,
  DesktopSource,
  ExportProgressInfo,
  RecordingStartedInfo,
  StartRecordingResponse,
  StopRecordingResponse,
  MarkClipResponse,
  ExportClipResponse,
} from "@/types/app";

export interface ElectronAPI {
  openTwitchStream: (channelName: string) => Promise<{ success: boolean }>;
  startRecording: (
    sourceId?: string,
    resetBuffer?: boolean
  ) => Promise<{ success: boolean }>;
  stopRecording: () => Promise<{ success: boolean }>;
  getClipMarkers: () => Promise<ClipMarker[]>;
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
  onRequestStartRecording: (
    callback: (
      _: IpcRendererEvent,
      data: { sourceId: string; requestId: string }
    ) => void
  ) => void;
  onRequestStopRecording: (
    callback: (_: IpcRendererEvent, data: { requestId: string }) => void
  ) => void;
  onRequestMarkClip: (
    callback: (
      _: IpcRendererEvent,
      data: { requestId: string; streamStartTime: number }
    ) => void
  ) => void;
  onRequestExportClip: (
    callback: (
      _: IpcRendererEvent,
      data: { requestId: string; clipData: ClipExportData }
    ) => void
  ) => void;
  sendStartRecordingResponse: (response: StartRecordingResponse) => void;
  sendStopRecordingResponse: (response: StopRecordingResponse) => void;
  sendMarkClipResponse: (response: MarkClipResponse) => void;
  sendExportClipResponse: (response: ExportClipResponse) => void;
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
