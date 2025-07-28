import recordingService from "@/services/recording-service";
import { WAIT_UNTIL_BUFFER_TIMEOUT_MS } from "@/constants/app";

/**
 * Waits until the recording buffer has reached or exceeded the given target duration.
 */
async function waitUntilBufferCatchesUp(
  target: number,
  timeout = WAIT_UNTIL_BUFFER_TIMEOUT_MS
) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const buffer = recordingService.getBufferDuration();
      if (buffer >= target) return resolve();
      if (Date.now() - start > timeout)
        return reject(new Error("Buffer timeout"));
      setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Calculate the visible bounding box of a video element inside its container.
 *
 * @param video - The HTMLVideoElement
 * @returns Bounding box { x, y, width, height } relative to the video element's container
 */
function getVideoBoundingBox(video: HTMLVideoElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const playerWidth = video.clientWidth;
  const playerHeight = video.clientHeight;
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  const playerRatio = playerWidth / playerHeight;
  const videoRatio = videoWidth / videoHeight;

  let width: number;
  let height: number;
  let x: number;
  let y: number;

  if (videoRatio < playerRatio) {
    height = playerHeight;
    width = height * videoRatio;
    x = (playerWidth - width) / 2;
    y = 0;
  } else if (videoRatio > playerRatio) {
    width = playerWidth;
    height = width / videoRatio;
    x = 0;
    y = (playerHeight - height) / 2;
  } else {
    width = playerWidth;
    height = playerHeight;
    x = 0;
    y = 0;
  }

  return { x, y, width, height };
}

/**
 * Convert overlay DOM position to normalized (0–1) coordinates
 * relative to the intrinsic video frame.
 *
 * @param video - HTML video element
 * @param position - Overlay position relative to video element
 * @returns Normalized { x, y } in intrinsic video coordinate space
 */
function getOverlayNormalizedCoords(
  video: HTMLVideoElement,
  position: { overlayX: number; overlayY: number }
): { x: number; y: number } {
  const { overlayX, overlayY } = position;
  const {
    x: frameX,
    y: frameY,
    width: frameW,
    height: frameH,
  } = getVideoBoundingBox(video);

  // Convert from absolute overlay offset → relative to video frame
  const relativeX = overlayX - frameX;
  const relativeY = overlayY - frameY;

  // Normalize to the intrinsic video frame (clamped between 0 and 1)
  const x = Math.max(0, Math.min(1, relativeX / frameW));
  const y = Math.max(0, Math.min(1, relativeY / frameH));

  return { x, y };
}

/**
 * Calculates the target video dimensions (width and height) based on a given resolution string (e.g., "1080p", "4k")
 * and the aspect ratio of the original video. It prioritizes the height from the resolution string
 * and derives the width to maintain the aspect ratio.
 *
 * @param resolution - The target resolution string (e.g., "720p", "1080p", "1440p", "4k").
 * @param aspectRatio - The aspect ratio of the original video (width / height).
 * @returns An object containing the calculated width and height.
 */
function getTargetVideoDimensions(
  resolution: "720p" | "1080p" | "1440p" | "4k",
  aspectRatio: number
): { width: number; height: number } {
  let targetHeight: number;

  switch (resolution) {
    case "720p":
      targetHeight = 720;
      break;
    case "1080p":
      targetHeight = 1080;
      break;
    case "1440p":
      targetHeight = 1440;
      break;
    case "4k":
      targetHeight = 2160; // 4K resolution is 3840x2160 (height)
      break;
    default:
      targetHeight = 1080; // Default to 1080p if unrecognized
  }

  const targetWidth = Math.round(targetHeight * aspectRatio);

  // Ensure width is an even number, which is often required by video encoders
  return {
    width: targetWidth % 2 === 0 ? targetWidth : targetWidth + 1,
    height: targetHeight,
  };
}

export {
  waitUntilBufferCatchesUp,
  getVideoBoundingBox,
  getOverlayNormalizedCoords,
  getTargetVideoDimensions,
};
