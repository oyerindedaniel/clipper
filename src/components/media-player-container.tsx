import React, { memo, forwardRef } from "react";
import * as MediaPlayer from "@/components/ui/media-player";

interface MediaPlayerContainerProps {
  poster?: string;
}

const MediaPlayerContainer = forwardRef<
  HTMLVideoElement,
  MediaPlayerContainerProps
>(({ poster = "/thumbnails/video-thumb.png" }, ref) => {
  return (
    <MediaPlayer.Root>
      <MediaPlayer.Video
        ref={ref}
        playsInline
        className="w-full aspect-video"
        poster={poster}
      />
      <MediaPlayer.Loading />
      <MediaPlayer.Error />
      <MediaPlayer.VolumeIndicator />
      <MediaPlayer.Controls>
        <MediaPlayer.ControlsOverlay />
        <MediaPlayer.Play />
        <MediaPlayer.SeekBackward />
        <MediaPlayer.SeekForward />
        <MediaPlayer.Volume />
        <MediaPlayer.Seek />
        <MediaPlayer.Time />
        <MediaPlayer.PlaybackSpeed />
        <MediaPlayer.Loop />
        <MediaPlayer.Captions />
        <MediaPlayer.PiP />
        <MediaPlayer.Fullscreen />
        <MediaPlayer.Download />
      </MediaPlayer.Controls>
    </MediaPlayer.Root>
  );
});

MediaPlayerContainer.displayName = "MediaPlayerContainer";

export default memo(MediaPlayerContainer);
