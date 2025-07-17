import recordingService from "@/services/recording-service";

/**
 * Waits until the recording buffer has reached or exceeded the given target duration.
 */
async function waitUntilBufferCatchesUp(target: number, timeout = 15000) {
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

export { waitUntilBufferCatchesUp };
