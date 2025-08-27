import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import logger from "../../src/utils/logger";
import { ClipMarker } from "../../src/types/app";
import OBSRecordingService from "./obs-recording-service";
import { normalizeError } from "../../src/utils/error-utils";

export interface AWSConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  folder?: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  clipId: string;
}

class AWSUploadService {
  private static instance: AWSUploadService;
  private s3Client: S3Client | null = null;
  private config: AWSConfig | null = null;
  private uploadQueue: { clip: ClipMarker; retries: number }[] = [];
  private isProcessing = false;
  private currentStreamerName: string | null = null;

  private constructor() {}

  static getInstance(): AWSUploadService {
    if (!AWSUploadService.instance) {
      AWSUploadService.instance = new AWSUploadService();
    }
    return AWSUploadService.instance;
  }

  initialize(config: AWSConfig): void {
    try {
      this.config = config;
      this.s3Client = new S3Client({
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
      logger.log("✅ AWS Upload Service initialized successfully", {
        region: config.region,
        bucket: config.bucket,
        folder: config.folder || "root",
      });
    } catch (error) {
      logger.error("❌ Failed to initialize AWS Upload Service:", error);
    }
  }

  /**
   * Check if the service is ready to use
   */
  isReady(): boolean {
    return this.s3Client !== null && this.config !== null;
  }

  /**
   * Queue a clip for automatic upload
   */
  async queueClipForUpload(clipMarker: ClipMarker): Promise<void> {
    if (!this.isReady()) {
      logger.warn("⚠️ AWS service not ready, skipping clip upload");
      return;
    }

    const task = { clip: clipMarker, retries: 0 };
    this.uploadQueue.push(task);

    logger.log("📤 Clip queued for AWS upload", {
      clipId: clipMarker.id,
      queueLength: this.uploadQueue.length,
      isProcessing: this.isProcessing,
    });

    if (!this.isProcessing) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Process the upload queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    logger.log("🚀 Starting AWS upload queue processing", {
      queueLength: this.uploadQueue.length,
    });

    while (this.uploadQueue.length > 0) {
      const task = this.uploadQueue.shift()!;
      const { clip, retries } = task;

      try {
        logger.log("📤 Processing clip for AWS upload", {
          clipId: clip.id,
          attempt: retries + 1,
        });

        const result = await this.uploadClip(clip);

        if (result.success) {
          logger.log("✅ Clip uploaded successfully to AWS", {
            clipId: clip.id,
            url: result.url,
          });
        } else {
          throw new Error(result.error || "Unknown upload error");
        }
      } catch (error) {
        logger.error("❌ Upload failed", {
          clipId: clip.id,
          error: normalizeError(error).message,
          attempt: retries + 1,
        });

        if (retries < 3) {
          const delay = Math.pow(2, retries) * 1000;
          logger.log("⏳ Retrying clip upload after delay", {
            clipId: clip.id,
            retryInMs: delay,
          });

          setTimeout(() => {
            this.uploadQueue.push({ clip, retries: retries + 1 });
            if (!this.isProcessing) {
              this.processQueue();
            }
          }, delay);
        } else {
          logger.error("💀 Max retries reached. Giving up on clip.", {
            clipId: clip.id,
          });
        }
      }
    }

    this.isProcessing = false;

    if (this.uploadQueue.length > 0) {
      logger.log("♻️ New tasks detected, restarting queue");
      setImmediate(() => this.processQueue());
    } else {
      logger.log("🏁 AWS upload queue processing completed");
    }
  }

  /**
   * Upload a clip to AWS S3
   */
  private async uploadClip(clipMarker: ClipMarker): Promise<UploadResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: "AWS service not ready",
        clipId: clipMarker.id,
      };
    }

    try {
      const filename = `${clipMarker.id}.mp4`;

      const s3Key = this.config!.folder
        ? `${this.config!.folder}/${filename}`
        : filename;

      const clipDurationMs = clipMarker.endTime - clipMarker.startTime;
      const clipDurationSec = (clipDurationMs / 1000).toFixed(2);

      logger.log("📁 Preparing clip for AWS upload", {
        clipId: clipMarker.id,
        filename,
        s3Key,
        bucket: this.config!.bucket,
        duration: `${clipDurationSec}s`,
        startTime: clipMarker.startTime,
        endTime: clipMarker.endTime,
        streamerName: this.currentStreamerName || "unknown",
      });

      const tempDir = path.join(os.homedir(), "twitch-recorder-buffer");
      const tempClipPath = path.join(
        tempDir,
        `aws_upload_${clipMarker.id}.mp4`
      );

      const clipExtracted = await this.extractClipToFile(
        clipMarker,
        tempClipPath
      );

      if (!clipExtracted) {
        return {
          success: false,
          error: "Failed to extract clip to file",
          clipId: clipMarker.id,
        };
      }

      const uploadResult = await this.uploadFileToS3(
        tempClipPath,
        s3Key,
        this.getClipMetadata(clipMarker)
      );

      try {
        if (fs.existsSync(tempClipPath)) {
          fs.unlinkSync(tempClipPath);
          logger.log("🧹 Temporary clip file cleaned up", { tempClipPath });
        }
      } catch (cleanupError) {
        logger.warn(
          "⚠️ Failed to clean up temporary file:",
          normalizeError(cleanupError).message
        );
      }

      if (uploadResult.success) {
        return {
          success: true,
          url: uploadResult.url,
          clipId: clipMarker.id,
        };
      } else {
        return {
          success: false,
          error: uploadResult.error,
          clipId: clipMarker.id,
        };
      }
    } catch (error) {
      const msg = normalizeError(error).message;
      logger.error("💥 Error in uploadClip:", msg);
      return {
        success: false,
        error: msg,
        clipId: clipMarker.id,
      };
    }
  }

  /**
   * Extract a clip to a temporary file using the recording service
   */
  private async extractClipToFile(
    clipMarker: ClipMarker,
    outputPath: string
  ): Promise<boolean> {
    try {
      const recordingService = OBSRecordingService.getInstance();

      const startTimeMs = clipMarker.startTime;
      const endTimeMs = clipMarker.endTime;
      const duration = (endTimeMs - startTimeMs) / 1000;

      logger.log("🎬 Extracting clip for AWS upload", {
        clipId: clipMarker.id,
        startTime: startTimeMs,
        endTime: endTimeMs,
        duration,
        outputPath,
      });

      const result = await recordingService.extractClip(
        startTimeMs,
        endTimeMs,
        outputPath
      );

      if (result.success) {
        logger.log("✅ Clip extracted successfully for AWS upload", {
          clipId: clipMarker.id,
          outputPath: result.outputPath,
        });
        return true;
      } else {
        logger.error("❌ Failed to extract clip for AWS upload", {
          clipId: clipMarker.id,
          error: result.error,
        });
        return false;
      }
    } catch (error) {
      logger.error(
        "❌ Failed to extract clip to file:",
        normalizeError(error).message
      );
      return false;
    }
  }

  /**
   * Upload a file to S3
   */
  private async uploadFileToS3(
    filePath: string,
    s3Key: string,
    additionalMetadata: Record<string, string>
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const fileSize = fileBuffer.length;

      logger.log("📤 Uploading file to S3", {
        filePath,
        s3Key,
        fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
      });

      const uploadTimestamp = new Date().toISOString();
      const streamerName = this.currentStreamerName || "unknown";

      const metadata = {
        "upload-timestamp": uploadTimestamp,
        "original-filename": path.basename(filePath),
        "streamer-name": streamerName,
        "reference-id": additionalMetadata["clip-id"],
        ...additionalMetadata,
      };

      const command = new PutObjectCommand({
        Bucket: this.config!.bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: "video/mp4",
        Metadata: metadata,
        CacheControl: "max-age=86400, public",
        // ACL: "public-read",
      });

      await this.s3Client!.send(command);

      const url = `https://${this.config!.bucket}.s3.${
        this.config!.region
      }.amazonaws.com/${s3Key}`;

      logger.log("✅ File uploaded to S3 successfully", {
        s3Key,
        url,
        fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
        streamerName,
      });

      return { success: true, url };
    } catch (error) {
      const msg = normalizeError(error).message;
      logger.error("❌ Failed to upload file to S3:", msg);
      return {
        success: false,
        error: msg,
      };
    }
  }

  setStreamerName(streamerName: string): void {
    this.currentStreamerName = streamerName;
    logger.log("📝 Streamer name set for AWS uploads:", streamerName);
  }

  private getClipMetadata(clipMarker: ClipMarker): Record<string, string> {
    const clipDurationMs = clipMarker.endTime - clipMarker.startTime;

    return {
      "clip-id": clipMarker.id,
      "clip-duration-ms": clipDurationMs.toString(),
      "clip-start-time": clipMarker.startTime.toString(),
      "clip-end-time": clipMarker.endTime.toString(),
      "stream-start-time": clipMarker.streamStart
        ? clipMarker.streamStart.toString()
        : "unknown",
    };
  }

  cleanup(): void {
    this.s3Client = null;
    this.config = null;
    this.uploadQueue = [];
    this.isProcessing = false;
    this.currentStreamerName = null;
    logger.log("🧹 AWS Upload Service cleaned up");
  }
}

export default AWSUploadService;
