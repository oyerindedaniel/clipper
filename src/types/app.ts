/**
 * Represents a marked clip segment in the recording.
 */
export interface ClipMarker {
  id: string;
  startTime: number;
  endTime: number;
  markedAt: number;
  streamStart: number;
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
