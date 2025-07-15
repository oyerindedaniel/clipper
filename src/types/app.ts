/**
 * Represents a marked clip segment in the recording.
 */
export interface ClipMarker {
  id: string;
  startTime: number;
  endTime: number;
  markedAt: number;
  streamStart: number;
  bufferFile: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  letterSpacing: string;
  color: string;
  backgroundColor: string;
  opacity: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: "left" | "center" | "right";
  visible: boolean;
}

export interface AudioTrack {
  id: string;
  name: string;
  file: File | null;
  volume: number;
  startTime: number;
  endTime: number;
  visible: boolean;
}

export interface ExportSettings {
  format: "mp4" | "webm" | "mov";
  quality: "low" | "medium" | "high" | "ultra";
  resolution: "720p" | "1080p" | "1440p" | "4k";
  fps: 30 | 60;
  bitrate: number;
}

/**
 * Information required to export a clip.
 */
export interface ClipExportData {
  id: string;
  startTime: number;
  endTime: number;
  outputName: string;
  outputPath: string;
}

/**
 * Active recording session details.
 */
export interface StreamSession {
  startTime: number;
  sourceId: string;
  bufferFile: string;
}

export interface RecordingStartedInfo {
  sourceId: string;
  startTime: number;
}

/**
 * Types for desktop source metadata.
 */
export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
}

export interface ExportProgressInfo {
  clipId: string;
  progress: string;
}

/**
 * Represents a single recorded media chunk with a timestamp.
 */
export interface RecordedChunk {
  data: Blob;
  timestamp: number;
}
