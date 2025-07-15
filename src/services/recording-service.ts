import { RecordedChunk } from "@/types/app";

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
  public async startRecording(sourceId: string): Promise<{ success: boolean }> {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
            minFrameRate: 30,
            maxFrameRate: 60,
          },
        } as MediaTrackConstraints,
      });

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "desktop",
          },
        } as MediaTrackConstraints,
        video: false,
      });

      const combinedStream = new MediaStream();
      videoStream
        .getVideoTracks()
        .forEach((track) => combinedStream.addTrack(track));
      audioStream
        .getAudioTracks()
        .forEach((track) => combinedStream.addTrack(track));

      this.stream = combinedStream;
      this.startTime = Date.now();

      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm; codecs=vp9,opus",
        bitsPerSecond: 8000000, // 8 Mbps
      });

      this.mediaRecorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size > 0 && this.startTime !== null) {
          this.recordedChunks.push({
            data: event.data,
            timestamp: Date.now() - this.startTime,
          });
        }
      };

      this.mediaRecorder.onstop = (): void => {
        this.isRecording = false;
        this.cleanupStream();
      };

      this.mediaRecorder.onerror = (event: ErrorEvent): void => {
        console.error("MediaRecorder error:", event.error);
        this.stopRecording();
      };

      this.mediaRecorder.start(1000);
      this.isRecording = true;

      this.startBufferManagement();

      return { success: true };
    } catch (error) {
      console.error("Failed to start recording:", error);
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
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }

    if (this.bufferInterval) {
      clearInterval(this.bufferInterval);
      this.bufferInterval = null;
    }

    this.cleanupStream();
    this.isRecording = false;
  }

  /**
   * Starts the internal buffer cleanup process.
   */
  private startBufferManagement(): void {
    this.bufferInterval = setInterval(() => {
      this.cleanOldChunks();
    }, 30_000); // every 30 seconds
  }

  /**
   * Cleans out old chunks beyond the configured buffer duration.
   */
  private cleanOldChunks(): void {
    if (this.startTime === null) return;

    const cutoffTime = Date.now() - this.startTime - this.bufferDuration;

    this.recordedChunks = this.recordedChunks.filter(
      (chunk) => chunk.timestamp > cutoffTime
    );
  }

  /**
   * Stops and clears the current media stream.
   */
  private cleanupStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /**
   * Retrieves a specific clip blob from the recorded buffer.
   * @param startTime The start timestamp (relative to start of recording).
   * @param endTime The end timestamp.
   * @returns A Blob of the clip or null if no data found.
   */
  public getClipBlob(startTime: number, endTime: number): Blob | null {
    const relevantChunks = this.recordedChunks.filter(
      (chunk) => chunk.timestamp >= startTime && chunk.timestamp <= endTime
    );

    if (relevantChunks.length === 0) return null;

    const blobParts = relevantChunks.map((chunk) => chunk.data);
    return new Blob(blobParts, { type: "video/webm" });
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
