import { useEffect, useRef, useState } from "react";
import { MediaItem } from "../../types/chat";
import { GumletPlayer } from '@gumlet/react-embed-player';

interface VideoPlayerProps {
  video: MediaItem | null;
  onVideoEnded?: () => void;
  onVideoPaused?: () => void;
  onVideoPlay?: () => void;
}

export function VideoPlayer({ video, onVideoEnded, onVideoPaused, onVideoPlay }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const gumletPlayerRef = useRef<any>(null);
  const [playerType, setPlayerType] = useState<'youtube' | 'gumlet' | 'vimeo' | 'unknown'>('unknown');
  const [videoData, setVideoData] = useState<{
    embedUrl?: string;
    gumletVideoId?: string;
    youtubeVideoId?: string;
    vimeoVideoId?: string;
  }>({});

  // Keep latest callbacks in refs so the polling loop never sees stale closures
  const onEndedRef = useRef(onVideoEnded);
  const onPausedRef = useRef(onVideoPaused);
  const onPlayRef = useRef(onVideoPlay);
  onEndedRef.current = onVideoEnded;
  onPausedRef.current = onVideoPaused;
  onPlayRef.current = onVideoPlay;

  // ---- Gumlet state tracking via postMessage ------------------------------
  // The GumletPlayer's React callbacks (onPause/onEnded) have a stale-closure
  // bug AND the imperative ref API (getPaused/getCurrentTime) returns Promises
  // that never resolve when the player isn't fully ready. We bypass both by
  // listening directly to the `player.js` protocol messages the iframe posts.
  // The lib already subscribes to play/pause/ended/timeupdate internally, so
  // these messages flow on the window — we just need to read them.
  useEffect(() => {
    if (playerType !== 'gumlet' || !videoData.gumletVideoId) return;

    let endFired = false;
    let lastDuration = 0;
    let lastTime = 0;

    const handler = (ev: MessageEvent) => {
      // Only listen to messages from our specific iframe
      const iframe = document.querySelector<HTMLIFrameElement>(
        `iframe[src*="${videoData.gumletVideoId}"]`,
      );
      if (iframe && ev.source !== iframe.contentWindow) return;

      let data: any = ev.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || data.context !== 'player.js') return;

      const event = data.event;
      const value = data.value;

      if (event === 'timeupdate' && value) {
        lastTime = value.seconds ?? lastTime;
        lastDuration = value.duration ?? lastDuration;

        if (
          !endFired &&
          lastDuration > 0 &&
          lastTime >= lastDuration - 0.4
        ) {
          endFired = true;
          console.log('[VideoPlayer] PM: end reached', { time: lastTime, duration: lastDuration });
          onEndedRef.current?.();
        }
      } else if (event === 'ended') {
        if (endFired) return;
        endFired = true;
        console.log('[VideoPlayer] PM: ended event');
        onEndedRef.current?.();
      } else if (event === 'pause') {
        if (endFired) return;
        // Don't fire pause if we're at end of video (player auto-pauses on end)
        if (lastDuration > 0 && lastTime >= lastDuration - 0.5) return;
        console.log('[VideoPlayer] PM: paused');
        onPausedRef.current?.();
      } else if (event === 'play') {
        console.log('[VideoPlayer] PM: play');
        onPlayRef.current?.();
      }
    };

    window.addEventListener('message', handler);
    console.log('[VideoPlayer] postMessage listener attached for', videoData.gumletVideoId);

    return () => {
      window.removeEventListener('message', handler);
    };
  }, [playerType, videoData.gumletVideoId]);

  useEffect(() => {
    if (video) {
      let embedUrl = video.url;
      let type: 'youtube' | 'gumlet' | 'vimeo' | 'unknown' = 'unknown';
      let gumletVideoId = '';
      let youtubeVideoId = '';
      let vimeoVideoId = '';
      
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
      // Handle Gumlet URLs (gumlet.io and gumlet.tv)
      else if (video.url.includes('gumlet.io') || video.url.includes('gumlet.tv')) {
        type = 'gumlet';
        
        // Extract video ID from various Gumlet URL formats
        if (video.url.includes('/embed/')) {
          // Direct embed URL: https://play.gumlet.io/embed/VIDEO_ID
          const embedMatch = video.url.match(/\/embed\/([^?&/]+)/);
          gumletVideoId = embedMatch ? embedMatch[1] : '';
        } else if (video.url.includes('play.gumlet.io/')) {
          const playMatch = video.url.match(/play\.gumlet\.io\/([^?&/]+)/);
          gumletVideoId = playMatch ? playMatch[1] : '';
        } else if (video.url.includes('gumlet.tv/watch/')) {
          // gumlet.tv watch URL: https://gumlet.tv/watch/VIDEO_ID
          const watchMatch = video.url.match(/gumlet\.tv\/watch\/([^?&/]+)/);
          gumletVideoId = watchMatch ? watchMatch[1] : '';
        } else {
          // Generic gumlet.io URL - try to extract ID from path
          const pathMatch = video.url.match(/gumlet\.(?:io|tv)\/[^\/]*\/([^?&/]+)/);
          gumletVideoId = pathMatch ? pathMatch[1] : '';
        }
        
        console.log(`Gumlet URL detected: "${video.url}" -> ID: "${gumletVideoId}"`);
      }
      // Handle Vimeo URLs — embed natively via player.vimeo.com (no proxy needed)
      else if (video.url.includes('vimeo.com')) {
        type = 'vimeo';

        // Supported formats:
        //   https://vimeo.com/123456789
        //   https://vimeo.com/123456789/abcd1234        (with private hash)
        //   https://player.vimeo.com/video/123456789
        //   https://vimeo.com/channels/foo/123456789
        const playerMatch = video.url.match(/player\.vimeo\.com\/video\/(\d+)(?:\/([\w]+))?/);
        const standardMatch = video.url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)(?:\/([\w]+))?/);

        let hash = '';
        if (playerMatch) {
          vimeoVideoId = playerMatch[1];
          hash = playerMatch[2] || '';
        } else if (standardMatch) {
          vimeoVideoId = standardMatch[1];
          hash = standardMatch[2] || '';
        }

        if (vimeoVideoId) {
          // Build a clean embed URL. The `h=` parameter carries the privacy hash
          // that Vimeo requires for unlisted videos.
          const params = new URLSearchParams({
            title: '0',
            byline: '0',
            portrait: '0',
            dnt: '1',
          });
          if (hash) params.set('h', hash);
          embedUrl = `https://player.vimeo.com/video/${vimeoVideoId}?${params.toString()}`;
        }

        console.log(`Vimeo URL detected: "${video.url}" -> ID: "${vimeoVideoId}"${hash ? ` hash: "${hash}"` : ''}`);
      }

      setPlayerType(type);
      setVideoData({
        embedUrl,
        gumletVideoId,
        youtubeVideoId,
        vimeoVideoId,
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
          ref={gumletPlayerRef}
          videoID={videoData.gumletVideoId}
          title={video?.title || "Vidéo éducative Gumlet"}
          style={{ 
            position: "relative",
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
          onEnded={onVideoEnded}
          onPause={onVideoPaused}
          onPlay={onVideoPlay}
        />
      );
    } else if (playerType === 'vimeo' && videoData.embedUrl && videoData.vimeoVideoId) {
      // Native Vimeo embed — runs entirely in the iframe sandbox, no proxy.
      return (
        <iframe
          key={videoData.vimeoVideoId}
          src={videoData.embedUrl}
          className="w-full h-full border-none rounded-lg shadow-lg"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          title={video?.title || "Lecteur vidéo Vimeo éducatif"}
          data-testid="iframe-vimeo-player"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
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
              Formats supportés: YouTube, Gumlet, Vimeo
            </p>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full aspect-video">
        {renderPlayer()}
      </div>
      
      {(video?.title || video?.description) && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
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
