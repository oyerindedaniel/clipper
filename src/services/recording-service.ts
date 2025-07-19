import { RecordedChunk } from "../types/app";
import logger from "../utils/logger";

/**
 * Handles screen and audio recording, buffering, and clip extraction.
 */
class RecordingService {
  private static instance: RecordingService | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: RecordedChunk[] = [];
  private isRecording = false;
  private readonly bufferDuration = 15 * 60 * 1000; // 15 minutes
  private stream: MediaStream | null = null;
  private startTime: number | null = null;
  private bufferInterval: NodeJS.Timeout | null = null;

  /**
   * Starts recording a screen and system audio stream.
   * @param sourceId The desktop capture source ID.
   */
  public async startRecording(
    sourceId: string,
    resetBuffer: boolean = true
  ): Promise<{ success: boolean }> {
    try {
      if (resetBuffer) {
        this.reset();
      }

      if (this.isRecording) {
        logger.warn("⚠️ Recording already in progress");
        return { success: false };
      }

      logger.log("🚀 Starting recording with sourceId:", sourceId);
      logger.log("⏰ Recording start time:", new Date().toISOString());

      // Get combined audio/video stream in one call
      logger.log("📡 Requesting combined audio/video stream...");
      const combinedStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
          },
        } as MediaTrackConstraints,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 1920,
            // maxWidth: 1280,
            minHeight: 720,
            maxHeight: 1080,
            minFrameRate: 30,
            maxFrameRate: 60,
          },
        } as MediaTrackConstraints,
      });

      logger.log("✅ Combined stream obtained successfully");
      logger.log("🎥 Video tracks:", combinedStream.getVideoTracks().length);
      logger.log("🔊 Audio tracks:", combinedStream.getAudioTracks().length);
      logger.log("📊 Total tracks:", combinedStream.getTracks().length);

      // Log track details
      combinedStream.getVideoTracks().forEach((track, index) => {
        logger.log(`🎥 Video track ${index}:`, {
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings(),
        });
      });

      combinedStream.getAudioTracks().forEach((track, index) => {
        logger.log(`🔊 Audio track ${index}:`, {
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings(),
        });
      });

      this.stream = combinedStream;
      this.startTime = Date.now();
      logger.log("⏱️ Recording startTime set to:", this.startTime);

      // Check MediaRecorder support
      const mimeType = "video/webm; codecs=vp9,opus";
      const isSupported = MediaRecorder.isTypeSupported(mimeType);
      logger.log(
        "🎬 MediaRecorder mimeType support:",
        mimeType,
        "->",
        isSupported
      );

      if (!isSupported) {
        logger.warn("⚠️ Preferred mimeType not supported, trying fallback...");
        const fallbackMimeType = "video/webm";
        logger.log(
          "🎬 Fallback mimeType:",
          fallbackMimeType,
          "->",
          MediaRecorder.isTypeSupported(fallbackMimeType)
        );
      }

      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: isSupported ? mimeType : "video/webm",
        bitsPerSecond: 8000000, // 8 Mbps
      });

      logger.log(
        "📹 MediaRecorder created with state:",
        this.mediaRecorder.state
      );

      this.mediaRecorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size > 0 && this.startTime !== null) {
          const timestamp = Date.now() - this.startTime;
          this.recordedChunks.push({
            data: event.data,
            timestamp: timestamp,
          });
          logger.log("📦 Chunk received:", {
            size: event.data.size,
            timestamp: timestamp,
            totalChunks: this.recordedChunks.length,
            bufferDuration: this.getBufferDuration(),
          });
        } else {
          logger.warn("⚠️ Empty chunk received or startTime is null");
        }
      };

      this.mediaRecorder.onstop = (): void => {
        logger.log("🛑 MediaRecorder stopped");
        logger.log("📊 Final stats:", {
          totalChunks: this.recordedChunks.length,
          bufferDuration: this.getBufferDuration(),
          recordingDuration: this.startTime ? Date.now() - this.startTime : 0,
        });
        this.isRecording = false;
        this.cleanupStream();

        logger.log("✅ Recording stopped successfully");
      };

      this.mediaRecorder.onerror = (event: ErrorEvent): void => {
        logger.error("❌ MediaRecorder error:", event.error);
        logger.error("📊 Error context:", {
          state: this.mediaRecorder?.state,
          isRecording: this.isRecording,
          chunksCount: this.recordedChunks.length,
        });
        this.stopRecording();
      };

      this.mediaRecorder.onstart = (): void => {
        logger.log("▶️ MediaRecorder started successfully");
        logger.log("📊 Initial state:", {
          state: this.mediaRecorder?.state,
          streamActive: this.stream?.active,
          trackCount: this.stream?.getTracks().length,
        });
      };

      this.mediaRecorder.onpause = (): void => {
        logger.log("⏸️ MediaRecorder paused");
      };

      this.mediaRecorder.onresume = (): void => {
        logger.log("▶️ MediaRecorder resumed");
      };

      logger.log("🎬 Starting MediaRecorder with 1000ms timeslice...");
      this.mediaRecorder.start(1000);
      this.isRecording = true;

      logger.log("🧹 Starting buffer management...");
      this.startBufferManagement();

      logger.log("✅ Recording started successfully!");
      return { success: true };
    } catch (error) {
      logger.error("❌ Failed to start recording:", error);
      logger.error("🔍 Error details:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Cleanup on error
      if (this.stream) {
        logger.log("🧹 Cleaning up stream due to error...");
        this.cleanupStream();
      }

      throw error;
    }
  }

  /**
   * Provides access to the singleton instance of the RecordingService.
   * @returns The RecordingService instance.
   */
  public static getInstance(): RecordingService {
    if (!RecordingService.instance) {
      RecordingService.instance = new RecordingService();
    }

    return RecordingService.instance;
  }

  /**
   * Stops the ongoing recording session.
   */
  public stopRecording(): void {
    logger.log("🛑 Stopping recording...");
    logger.log("📊 Pre-stop stats:", {
      isRecording: this.isRecording,
      chunksCount: this.recordedChunks.length,
      bufferDuration: this.getBufferDuration(),
      mediaRecorderState: this.mediaRecorder?.state,
    });

    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }

    if (this.bufferInterval) {
      clearInterval(this.bufferInterval);
      this.bufferInterval = null;
      logger.log("🧹 Buffer management stopped");
    }
  }

  /**
   * Starts the internal buffer cleanup process.
   */
  private startBufferManagement(): void {
    logger.log("🧹 Buffer management started (cleanup every 30s)");
    this.bufferInterval = setInterval(() => {
      const beforeCount = this.recordedChunks.length;
      this.cleanOldChunks();
      const afterCount = this.recordedChunks.length;
      const cleaned = beforeCount - afterCount;

      if (cleaned > 0) {
        logger.log("🧹 Buffer cleanup:", {
          chunksRemoved: cleaned,
          remainingChunks: afterCount,
          bufferDuration: this.getBufferDuration(),
        });
      }
    }, 30_000);
  }

  /**
   * Cleans out old chunks beyond the configured buffer duration.
   */
  private cleanOldChunks(): void {
    if (this.startTime === null) return;

    const cutoffTime = Date.now() - this.startTime - this.bufferDuration;
    const originalLength = this.recordedChunks.length;

    this.recordedChunks = this.recordedChunks.filter(
      (chunk) => chunk.timestamp > cutoffTime
    );

    const removedCount = originalLength - this.recordedChunks.length;
    if (removedCount > 0) {
      logger.log("🗑️ Cleaned old chunks:", {
        removed: removedCount,
        remaining: this.recordedChunks.length,
        cutoffTime: cutoffTime,
      });
    }
  }

  /**
   * Stops and clears the current media stream.
   */
  private cleanupStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.mediaRecorder = null;

    if (this.bufferInterval) {
      clearInterval(this.bufferInterval);
      this.bufferInterval = null;
    }

    // DO NOT clear: recordedChunks, startTime, isRecording
    // These are needed for clip extraction after recording stops
  }

  /**
   * Completely resets the recording service state.
   * Call this when you want to start fresh (e.g., new recording session).
   */
  public reset(): void {
    this.cleanupStream();

    this.recordedChunks = [];
    this.isRecording = false;
    this.startTime = null;

    logger.log("🔄 RecordingService reset completely");
  }

  /**
   * Creates a trimmed WebM clip from recorded chunks.
   */
  public async getClipBlob(
    startTime: number,
    endTime: number
  ): Promise<Blob | null> {
    logger.log("🎞️ Clip blob creation:", {
      requestedRange: { startTime, endTime },
      totalChunks: this.recordedChunks.length,
      bufferDuration: this.getBufferDuration(),
    });

    if (this.recordedChunks.length === 0) {
      logger.warn("⚠️ No chunks available for clip");
      return null;
    }

    try {
      const chunkArrayBuffers = await Promise.all(
        this.recordedChunks.map((chunk) => chunk.data.arrayBuffer())
      );

      const remuxedBuffer = await window.electronAPI.remuxClip(
        chunkArrayBuffers,
        startTime,
        endTime
      );

      const finalBlob = new Blob([remuxedBuffer], { type: "video/webm" });
      logger.log("✅ Remuxing successful, returning final clip blob");
      return finalBlob;
    } catch (error) {
      logger.error("❌ Remuxing failed:", error);
      return null;
    }
  }

  /**
   * Returns the full current buffer as a single Blob.
   */
  public getCurrentBuffer(): Blob | null {
    if (this.recordedChunks.length === 0) return null;

    const allChunks = this.recordedChunks.map((chunk) => chunk.data);
    return new Blob(allChunks, { type: "video/webm" });
  }

  /**
   * Gets the total duration of the current buffer in milliseconds.
   */
  public getBufferDuration(): number {
    if (this.recordedChunks.length === 0) return 0;

    const first = this.recordedChunks[0];
    const last = this.recordedChunks[this.recordedChunks.length - 1];
    return last.timestamp - first.timestamp;
  }

  /**
   * Indicates if recording is currently active.
   */
  public isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Returns the Unix timestamp when recording started.
   */
  public getRecordingStartTime(): number | null {
    return this.startTime;
  }
}

const recordingService = RecordingService.getInstance();
export default recordingService;
