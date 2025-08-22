import { useEffect, useRef } from "react";
import { MediaItem } from "../../types/chat";

interface VideoPlayerProps {
  video: MediaItem | null;
}

export function VideoPlayer({ video }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (video && iframeRef.current) {
      let embedUrl = video.url;
      
      // Handle YouTube URLs
      if (video.url.includes('youtube.com') || video.url.includes('youtu.be')) {
        let videoId = '';
        
        if (video.url.includes('youtu.be/')) {
          // Short URL format: https://youtu.be/VIDEO_ID
          videoId = video.url.split('youtu.be/')[1].split('?')[0].split('&')[0];
        } else if (video.url.includes('watch?v=')) {
          // Long URL format: https://www.youtube.com/watch?v=VIDEO_ID
          const urlParams = new URLSearchParams(video.url.split('?')[1]);
          videoId = urlParams.get('v') || '';
        } else if (video.url.includes('/embed/')) {
          // Already embed format, use as is
          embedUrl = video.url;
        }
        
        if (videoId && !video.url.includes('/embed/')) {
          // Clean YouTube embed with minimal distractions
          embedUrl = `https://www.youtube.com/embed/${videoId}?` +
            'rel=0&' +                    // Remove related videos at end
            'modestbranding=1&' +         // Remove YouTube logo
            'showinfo=0&' +               // Hide video title and uploader info
            'controls=1&' +               // Keep video controls
            'disablekb=0&' +              // Allow keyboard controls
            'fs=1&' +                     // Allow fullscreen
            'iv_load_policy=3&' +         // Hide annotations
            'cc_load_policy=0&' +         // Don't force closed captions
            'playsinline=1&' +            // Play inline on mobile
            'widget_referrer=' + encodeURIComponent(window.location.origin);
        }
        
        console.log(`YouTube URL converted: "${video.url}" -> "${embedUrl}"`);
      }
      // Handle Gumlet URLs
      else if (video.url.includes('gumlet.io')) {
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
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-400 max-w-md">
          <div className="w-20 h-20 mx-auto text-gray-300 mb-6">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-gray-600 mb-2">Aucune vidéo sélectionnée</h4>
          <p className="text-gray-500">
            Les vidéos éducatives partagées par Peter dans la conversation apparaîtront ici.
            Cliquez sur les boutons "📹 Voir la vidéo" pour les visionner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 aspect-video min-h-[400px]">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-none rounded-lg shadow-lg"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          title={video.title || "Lecteur vidéo éducatif"}
          data-testid="iframe-video-player"
          allowFullScreen
        />
      </div>
      
      {(video.title || video.description) && (
        <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          {video.title && (
            <h4 className="text-lg font-semibold text-gray-900 mb-2" data-testid="text-video-title">
              {video.title}
            </h4>
          )}
          {video.description && (
            <p className="text-gray-600 leading-relaxed" data-testid="text-video-description">
              {video.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
