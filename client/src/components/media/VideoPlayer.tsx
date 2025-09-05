import { useEffect, useRef, useState } from "react";
import { MediaItem } from "../../types/chat";
import { GumletPlayer } from '@gumlet/react-embed-player';

interface VideoPlayerProps {
  video: MediaItem | null;
}

export function VideoPlayer({ video }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [playerType, setPlayerType] = useState<'youtube' | 'gumlet' | 'unknown'>('unknown');
  const [videoData, setVideoData] = useState<{
    embedUrl?: string;
    gumletVideoId?: string;
    youtubeVideoId?: string;
  }>({});

  useEffect(() => {
    if (video) {
      let embedUrl = video.url;
      let type: 'youtube' | 'gumlet' | 'unknown' = 'unknown';
      let gumletVideoId = '';
      let youtubeVideoId = '';
      
      // Handle YouTube URLs
      if (video.url.includes('youtube.com') || video.url.includes('youtu.be')) {
        type = 'youtube';
        
        if (video.url.includes('youtu.be/')) {
          // Short URL format: https://youtu.be/VIDEO_ID
          youtubeVideoId = video.url.split('youtu.be/')[1].split('?')[0].split('&')[0];
        } else if (video.url.includes('watch?v=')) {
          // Long URL format: https://www.youtube.com/watch?v=VIDEO_ID
          const urlParams = new URLSearchParams(video.url.split('?')[1]);
          youtubeVideoId = urlParams.get('v') || '';
        } else if (video.url.includes('/embed/')) {
          // Already embed format, extract video ID
          const embedMatch = video.url.match(/\/embed\/([^?&/]+)/);
          youtubeVideoId = embedMatch ? embedMatch[1] : '';
        }
        
        if (youtubeVideoId) {
          // Clean YouTube embed with minimal distractions (updated for 2025)
          embedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?` +
            'rel=0&' +                    // Remove related videos at end
            'modestbranding=1&' +         // Remove YouTube logo
            'controls=1&' +               // Keep video controls
            'disablekb=0&' +              // Allow keyboard controls
            'fs=1&' +                     // Allow fullscreen
            'iv_load_policy=3&' +         // Hide annotations
            'cc_load_policy=0&' +         // Don't force closed captions
            'playsinline=1&' +            // Play inline on mobile
            'enablejsapi=0&' +            // Disable JS API to prevent CSP issues
            'origin=' + encodeURIComponent(window.location.origin);
        }
        
        console.log(`YouTube URL detected: "${video.url}" -> ID: "${youtubeVideoId}"`);
      }
      // Handle Gumlet URLs
      else if (video.url.includes('gumlet.io')) {
        type = 'gumlet';
        
        // Extract video ID from various Gumlet URL formats
        if (video.url.includes('/embed/')) {
          // Direct embed URL: https://play.gumlet.io/embed/VIDEO_ID
          const embedMatch = video.url.match(/\/embed\/([^?&/]+)/);
          gumletVideoId = embedMatch ? embedMatch[1] : '';
        } else if (video.url.includes('play.gumlet.io/')) {
          // Play URL: https://play.gumlet.io/VIDEO_ID or similar
          const playMatch = video.url.match(/play\.gumlet\.io\/([^?&/]+)/);
          gumletVideoId = playMatch ? playMatch[1] : '';
        } else {
          // Generic gumlet.io URL - try to extract ID from path
          const pathMatch = video.url.match(/gumlet\.io\/[^\/]*\/([^?&/]+)/);
          gumletVideoId = pathMatch ? pathMatch[1] : '';
        }
        
        console.log(`Gumlet URL detected: "${video.url}" -> ID: "${gumletVideoId}"`);
      }
      
      setPlayerType(type);
      setVideoData({
        embedUrl,
        gumletVideoId,
        youtubeVideoId
      });
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

  const renderPlayer = () => {
    if (playerType === 'gumlet' && videoData.gumletVideoId) {
      // Use Gumlet React Player
      return (
        <GumletPlayer
          videoID={videoData.gumletVideoId}
          title={video?.title || "Vidéo éducative Gumlet"}
          style={{ 
            height: "100%", 
            width: "100%", 
            borderRadius: "8px",
            overflow: "hidden"
          }}
          schemaOrgVideoObject={{
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": video?.title || "Vidéo éducative",
            "description": video?.description || "Contenu éducatif sur la pollution plastique",
            "embedUrl": `https://play.gumlet.io/embed/${videoData.gumletVideoId}`
          }}
          autoplay={false}
          preload={true}
          muted={false}
        />
      );
    } else if (playerType === 'youtube' && videoData.embedUrl) {
      // Use YouTube iframe embed with improved error handling
      return (
        <iframe
          key={videoData.youtubeVideoId} // Force re-render when video changes
          src={videoData.embedUrl}
          className="w-full h-full border-none rounded-lg shadow-lg"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          title={video?.title || "Lecteur vidéo YouTube éducatif"}
          data-testid="iframe-youtube-player"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          loading="lazy"
        />
      );
    } else {
      // Fallback for unknown video types
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="text-center text-gray-500 max-w-md p-6">
            <div className="w-16 h-16 mx-auto mb-4 text-gray-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600 mb-2">Format vidéo non supporté</p>
            <p className="text-xs text-gray-500">
              URL: {video?.url}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Formats supportés: YouTube, Gumlet
            </p>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 aspect-video min-h-[500px]">
        {renderPlayer()}
      </div>
      
      {(video?.title || video?.description) && (
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
      
      {/* Debug info in development */}
      {import.meta.env.DEV && video && (
        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
          <div><strong>Type:</strong> {playerType}</div>
          <div><strong>URL:</strong> {video.url}</div>
          {videoData.gumletVideoId && <div><strong>Gumlet ID:</strong> {videoData.gumletVideoId}</div>}
          {videoData.youtubeVideoId && <div><strong>YouTube ID:</strong> {videoData.youtubeVideoId}</div>}
        </div>
      )}
    </div>
  );
}
