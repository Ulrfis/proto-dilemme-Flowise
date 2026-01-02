import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SkipForward, Play } from "lucide-react";
import { GumletPlayer } from '@gumlet/react-embed-player';
import { useDeviceType, DeviceType } from "../../hooks/use-device-type";

interface OnboardingVideoProps {
  onComplete: () => void;
}

interface VideoConfig {
  videoId: string;
  aspectRatio: '16/9' | '9/16';
}

const VIDEO_IDS = {
  initial: "69577dbaf3928b38fc32c32b",
  desktop: "69577d67d73a53e69e607fbf",
  smartphone: "69577d67f3928b38fc32bb95",
};

export function OnboardingVideo({ onComplete }: OnboardingVideoProps) {
  const { deviceType, isVerticalPhone, orientation } = useDeviceType();
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const playerRef = useRef<any>(null);

  const getVideoSequence = useCallback((): VideoConfig[] => {
    const secondVideo = deviceType === 'smartphone' 
      ? { videoId: VIDEO_IDS.smartphone, aspectRatio: '9/16' as const }
      : { videoId: VIDEO_IDS.desktop, aspectRatio: '16/9' as const };

    return [
      { videoId: VIDEO_IDS.initial, aspectRatio: '16/9' },
      secondVideo,
    ];
  }, [deviceType]);

  const videoSequence = getVideoSequence();
  const currentVideo = videoSequence[currentVideoIndex];
  const isLastVideo = currentVideoIndex >= videoSequence.length - 1;

  const handleVideoEnded = useCallback(() => {
    console.log('[OnboardingVideo] Video ended, index:', currentVideoIndex, 'isLast:', isLastVideo);
    
    if (isLastVideo) {
      onComplete();
    } else {
      setIsTransitioning(true);
      
      setTimeout(() => {
        setCurrentVideoIndex(prev => prev + 1);
        setIsTransitioning(false);
        setHasStarted(true);
      }, 300);
    }
  }, [currentVideoIndex, isLastVideo, onComplete]);

  const handleSkip = () => {
    console.log('[OnboardingVideo] Skip pressed');
    onComplete();
  };

  const handleNextVideo = () => {
    if (!isLastVideo) {
      console.log('[OnboardingVideo] Next video pressed');
      handleVideoEnded();
    } else {
      onComplete();
    }
  };

  const handlePlayerReady = () => {
    console.log('[OnboardingVideo] Player ready');
  };

  const handlePlay = () => {
    setIsPlaying(true);
    setHasStarted(true);
    console.log('[OnboardingVideo] Video started playing');
  };

  const handlePause = () => {
    setIsPlaying(false);
    console.log('[OnboardingVideo] Video paused');
  };

  const getPlayerStyles = (): React.CSSProperties => {
    if (isVerticalPhone && currentVideo.aspectRatio === '16/9') {
      return {
        width: '100%',
        height: 'auto',
        aspectRatio: '16/9',
      };
    }
    
    if (currentVideo.aspectRatio === '9/16') {
      return {
        width: 'auto',
        height: '100%',
        maxWidth: '100%',
        aspectRatio: '9/16',
        margin: '0 auto',
      };
    }
    
    return {
      width: '100%',
      height: '100%',
    };
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black flex flex-col"
      data-testid="onboarding-video-container"
    >
      <div 
        className={`flex-1 relative transition-opacity duration-300 flex items-center justify-center ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
      >
        <div style={getPlayerStyles()} data-testid="video-player-main">
          <GumletPlayer
            key={currentVideo.videoId}
            ref={playerRef}
            videoID={currentVideo.videoId}
            title={`Vidéo d'introduction ${currentVideoIndex + 1}`}
            style={{ 
              width: '100%',
              height: '100%',
              borderRadius: 0,
            }}
            autoplay={currentVideoIndex > 0}
            preload={true}
            muted={false}
            onReady={handlePlayerReady}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleVideoEnded}
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            {videoSequence.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentVideoIndex 
                    ? 'w-8 bg-white' 
                    : index < currentVideoIndex 
                      ? 'w-4 bg-white/70' 
                      : 'w-4 bg-white/30'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {!isLastVideo && hasStarted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextVideo}
                className="text-white/80 hover:text-white hover:bg-white/20"
                data-testid="button-next-video"
              >
                Suivant
                <SkipForward className="w-4 h-4 ml-2" />
              </Button>
            )}
            
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSkip}
              className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
              data-testid="button-skip-onboarding"
            >
              {isLastVideo ? "Commencer" : "Passer"}
              <SkipForward className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {import.meta.env.DEV && (
        <div className="absolute top-4 left-4 p-2 bg-black/70 text-white text-xs rounded">
          <div>Device: {deviceType}</div>
          <div>Orientation: {orientation}</div>
          <div>Video: {currentVideoIndex + 1}/{videoSequence.length}</div>
          <div>Aspect: {currentVideo.aspectRatio}</div>
          <div>isVerticalPhone: {String(isVerticalPhone)}</div>
        </div>
      )}
    </div>
  );
}
