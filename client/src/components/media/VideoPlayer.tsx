import { useEffect, useRef, useState } from "react";
import { MediaItem } from "../../types/chat";
import { GumletPlayer } from '@gumlet/react-embed-player';
import { analytics } from "../../lib/analytics";

// ─── Typed postMessage payload schemas ────────────────────────────────────────

interface GumletTimeupdateValue { seconds?: number; duration?: number; }
interface GumletMessage {
  context: 'player.js';
  event: string;
  value?: GumletTimeupdateValue;
}
function isGumletMessage(d: unknown): d is GumletMessage {
  if (typeof d !== 'object' || d === null) return false;
  const r = d as Record<string, unknown>;
  return r['context'] === 'player.js' && typeof r['event'] === 'string';
}

interface YouTubeInfoDelivery {
  event: 'infoDelivery';
  info: Record<string, unknown>;
}
function isYouTubeInfoDelivery(d: unknown): d is YouTubeInfoDelivery {
  if (typeof d !== 'object' || d === null) return false;
  const r = d as Record<string, unknown>;
  return r['event'] === 'infoDelivery' && typeof r['info'] === 'object' && r['info'] !== null;
}

interface VimeoTimeupdateMessage { event: 'timeupdate'; data: { percent: number; seconds: number; duration: number } }
interface VimeoEndedMessage     { event: 'ended' }
type VimeoMessage = VimeoTimeupdateMessage | VimeoEndedMessage;
function isVimeoMessage(d: unknown): d is VimeoMessage {
  if (typeof d !== 'object' || d === null) return false;
  const ev = (d as Record<string, unknown>)['event'];
  return ev === 'timeupdate' || ev === 'ended';
}

/** Parse a raw postMessage payload (string or object) into a typed value. */
function parsePostMessage(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

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

  // Track which progress milestones have been fired for the current video
  const progressFiredRef = useRef<Set<number>>(new Set());
  const currentVideoUrlRef = useRef<string | null>(null);

  // Reset progress tracking on new video
  useEffect(() => {
    if (video?.url !== currentVideoUrlRef.current) {
      progressFiredRef.current = new Set();
      currentVideoUrlRef.current = video?.url ?? null;
    }
  }, [video?.url]);

  const fireProgressIfNeeded = (pct: number, url: string) => {
    const milestone = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0;
    if (milestone === 0) return;
    if (!progressFiredRef.current.has(milestone)) {
      progressFiredRef.current.add(milestone);
      analytics.trackVideoProgress({ url, progressPct: milestone as 25 | 50 | 75 | 100 });
    }
  };

  // ---- Gumlet state tracking via postMessage ------------------------------
  useEffect(() => {
    if (playerType !== 'gumlet' || !videoData.gumletVideoId) return;

    let endFired = false;
    let lastDuration = 0;
    let lastTime = 0;

    const handler = (ev: MessageEvent) => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        `iframe[src*="${videoData.gumletVideoId}"]`,
      );
      if (iframe && ev.source !== iframe.contentWindow) return;

      const data = parsePostMessage(ev.data);
      if (!isGumletMessage(data)) return;

      const { event, value } = data;

      if (event === 'timeupdate' && value) {
        lastTime = value.seconds ?? lastTime;
        lastDuration = value.duration ?? lastDuration;

        if (lastDuration > 0 && currentVideoUrlRef.current) {
          const pct = (lastTime / lastDuration) * 100;
          fireProgressIfNeeded(pct, currentVideoUrlRef.current);
        }

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
        if (currentVideoUrlRef.current) {
          fireProgressIfNeeded(100, currentVideoUrlRef.current);
        }
        onEndedRef.current?.();
      } else if (event === 'pause') {
        if (endFired) return;
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

  // ---- YouTube IFrame API progress tracking via postMessage ---------------
  useEffect(() => {
    if (playerType !== 'youtube' || !videoData.youtubeVideoId) return;

    // Send the "listening" command so YouTube starts pushing infoDelivery messages.
    // Retried at 0.5 s, 2 s, and 5 s to catch the iframe after it finishes loading.
    const sendListening = () => {
      const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-youtube-player"]');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
      }
    };
    const t1 = setTimeout(sendListening, 500);
    const t2 = setTimeout(sendListening, 2000);
    const t3 = setTimeout(sendListening, 5000);

    const handler = (ev: MessageEvent) => {
      const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-youtube-player"]');
      if (iframe && ev.source !== iframe.contentWindow) return;

      const data = parsePostMessage(ev.data);
      if (!isYouTubeInfoDelivery(data)) return;

      const currentTime = data.info['currentTime'];
      const duration    = data.info['duration'];
      if (typeof currentTime === 'number' && typeof duration === 'number' && duration > 0 && currentVideoUrlRef.current) {
        fireProgressIfNeeded((currentTime / duration) * 100, currentVideoUrlRef.current);
      }
    };

    window.addEventListener('message', handler);
    console.log('[VideoPlayer] YouTube postMessage listener attached for', videoData.youtubeVideoId);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('message', handler);
    };
  }, [playerType, videoData.youtubeVideoId]);

  // ---- Vimeo postMessage progress tracking --------------------------------
  useEffect(() => {
    if (playerType !== 'vimeo' || !videoData.vimeoVideoId) return;

    // Subscribe to timeupdate events from the Vimeo player.
    // Retried at 0.5 s and 2 s to account for iframe load time.
    const subscribe = () => {
      const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-vimeo-player"]');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), '*');
        iframe.contentWindow.postMessage(JSON.stringify({ method: 'addEventListener', value: 'ended' }), '*');
      }
    };
    const t1 = setTimeout(subscribe, 500);
    const t2 = setTimeout(subscribe, 2000);

    const handler = (ev: MessageEvent) => {
      const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-vimeo-player"]');
      if (iframe && ev.source !== iframe.contentWindow) return;

      const data = parsePostMessage(ev.data);
      if (!isVimeoMessage(data)) return;

      if (data.event === 'timeupdate' && currentVideoUrlRef.current) {
        fireProgressIfNeeded(data.data.percent * 100, currentVideoUrlRef.current);
      } else if (data.event === 'ended' && currentVideoUrlRef.current) {
        fireProgressIfNeeded(100, currentVideoUrlRef.current);
        onEndedRef.current?.();
      }
    };

    window.addEventListener('message', handler);
    console.log('[VideoPlayer] Vimeo postMessage listener attached for', videoData.vimeoVideoId);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('message', handler);
    };
  }, [playerType, videoData.vimeoVideoId]);

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
          youtubeVideoId = video.url.split('youtu.be/')[1].split('?')[0].split('&')[0];
        } else if (video.url.includes('watch?v=')) {
          const urlParams = new URLSearchParams(video.url.split('?')[1]);
          youtubeVideoId = urlParams.get('v') || '';
        } else if (video.url.includes('/embed/')) {
          const embedMatch = video.url.match(/\/embed\/([^?&/]+)/);
          youtubeVideoId = embedMatch ? embedMatch[1] : '';
        }
        
        if (youtubeVideoId) {
          embedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?` +
            'rel=0&' +
            'modestbranding=1&' +
            'controls=1&' +
            'disablekb=0&' +
            'fs=1&' +
            'iv_load_policy=3&' +
            'cc_load_policy=0&' +
            'playsinline=1&' +
            'enablejsapi=1&' +
            'origin=' + encodeURIComponent(window.location.origin);
        }
        
        console.log(`YouTube URL detected: "${video.url}" -> ID: "${youtubeVideoId}"`);
      }
      // Handle Gumlet URLs (gumlet.io and gumlet.tv)
      else if (video.url.includes('gumlet.io') || video.url.includes('gumlet.tv')) {
        type = 'gumlet';
        
        if (video.url.includes('/embed/')) {
          const embedMatch = video.url.match(/\/embed\/([^?&/]+)/);
          gumletVideoId = embedMatch ? embedMatch[1] : '';
        } else if (video.url.includes('play.gumlet.io/')) {
          const playMatch = video.url.match(/play\.gumlet\.io\/([^?&/]+)/);
          gumletVideoId = playMatch ? playMatch[1] : '';
        } else if (video.url.includes('gumlet.tv/watch/')) {
          const watchMatch = video.url.match(/gumlet\.tv\/watch\/([^?&/]+)/);
          gumletVideoId = watchMatch ? watchMatch[1] : '';
        } else {
          const pathMatch = video.url.match(/gumlet\.(?:io|tv)\/[^\/]*\/([^?&/]+)/);
          gumletVideoId = pathMatch ? pathMatch[1] : '';
        }
        
        console.log(`Gumlet URL detected: "${video.url}" -> ID: "${gumletVideoId}"`);
      }
      // Handle Vimeo URLs
      else if (video.url.includes('vimeo.com')) {
        type = 'vimeo';

        const playerMatch = video.url.match(/player\.vimeo\.com\/video\/(\d+)(?:\/([\w]+))?/);
        const manageMatch = video.url.match(/vimeo\.com\/manage\/videos\/(\d+)(?:\/([\w]+))?/);
        const standardMatch = video.url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)(?:\/([\w]+))?/);

        let hash = '';
        if (playerMatch) {
          vimeoVideoId = playerMatch[1];
          hash = playerMatch[2] || '';
        } else if (manageMatch) {
          vimeoVideoId = manageMatch[1];
          hash = manageMatch[2] || '';
        } else if (standardMatch) {
          vimeoVideoId = standardMatch[1];
          hash = standardMatch[2] || '';
        }

        if (vimeoVideoId) {
          const params = new URLSearchParams({
            title: '0',
            byline: '0',
            portrait: '0',
            dnt: '1',
            api: '1',
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
          onEnded={() => {
            if (currentVideoUrlRef.current) {
              fireProgressIfNeeded(100, currentVideoUrlRef.current);
            }
            onVideoEnded?.();
          }}
          onPause={onVideoPaused}
          onPlay={onVideoPlay}
        />
      );
    } else if (playerType === 'vimeo' && videoData.embedUrl && videoData.vimeoVideoId) {
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
      return (
        <iframe
          key={videoData.youtubeVideoId}
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
