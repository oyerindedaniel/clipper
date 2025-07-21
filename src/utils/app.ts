import recordingService from "@/services/recording-service";
import logger from "./logger";

/**
 * Waits until the recording buffer has reached or exceeded the given target duration.
 */
async function waitUntilBufferCatchesUp(target: number, timeout = 20000) {
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

export { waitUntilBufferCatchesUp, getVideoBoundingBox };
