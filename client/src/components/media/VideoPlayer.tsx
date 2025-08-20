import { useEffect, useRef } from "react";
import { MediaItem } from "../../types/chat";

interface VideoPlayerProps {
  video: MediaItem | null;
}

export function VideoPlayer({ video }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (video && iframeRef.current) {
      // Extract Gumlet asset ID or use full URL
      let embedUrl = video.url;
      
      // Handle Gumlet URLs
      if (video.url.includes('gumlet.io')) {
        // If it's already an embed URL, use as is
        if (video.url.includes('/embed/')) {
          embedUrl = video.url;
        } else {
          // Extract asset ID and create embed URL
          const assetIdMatch = video.url.match(/\/([^\/]+)(?:\?|$)/);
          if (assetIdMatch) {
            embedUrl = `https://play.gumlet.io/embed/${assetIdMatch[1]}`;
          }
        }
      }
      
      iframeRef.current.src = embedUrl;
    }
  }, [video]);

  if (!video) {
    return (
      <div className="p-4">
        <div className="text-center text-gray-500 py-8">
          <div className="w-12 h-12 mx-auto text-gray-300 mb-3">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm">
            Les vidéos partagées par Peter<br />apparaîtront ici
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="aspect-video">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-none rounded-lg"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          title="Gumlet video player"
          data-testid="iframe-video-player"
        />
      </div>
      
      {(video.title || video.description) && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          {video.title && (
            <h4 className="font-medium text-gray-900" data-testid="text-video-title">
              {video.title}
            </h4>
          )}
          {video.description && (
            <p className="text-sm text-gray-600 mt-1" data-testid="text-video-description">
              {video.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
