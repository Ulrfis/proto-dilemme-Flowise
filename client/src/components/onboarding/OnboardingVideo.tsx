import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SkipForward } from "lucide-react";
import { GumletPlayer } from '@gumlet/react-embed-player';

interface OnboardingVideoProps {
  onComplete: () => void;
}

const VIDEO_ID = "69577dbaf3928b38fc32c32b";

export function OnboardingVideo({ onComplete }: OnboardingVideoProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const playerRef = useRef<any>(null);

  const handleVideoEnded = useCallback(() => {
    console.log('[OnboardingVideo] Video ended');
    onComplete();
  }, [onComplete]);

  const handleSkip = () => {
    console.log('[OnboardingVideo] Skip pressed');
    onComplete();
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

  return (
    <div 
      className="fixed inset-0 z-50 bg-black flex flex-col"
      data-testid="onboarding-video-container"
    >
      <div className="flex-1 relative flex items-center justify-center">
        <div 
          style={{ width: '100%', height: '100%' }} 
          data-testid="video-player-main"
        >
          <GumletPlayer
            ref={playerRef}
            videoID={VIDEO_ID}
            title="Vidéo d'introduction"
            style={{ 
              width: '100%',
              height: '100%',
              borderRadius: 0,
            }}
            autoplay={false}
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
        <div className="flex items-center justify-end max-w-4xl mx-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSkip}
            className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
            data-testid="button-skip-onboarding"
          >
            {hasStarted ? "Commencer" : "Passer"}
            <SkipForward className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
