import { useCallback, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, Lightbulb, Video, CheckCircle } from "lucide-react";
import peterAvatarImage from "@assets/Peter_Avatar_white_1777751289628.jpeg";
import { ChatInterface } from "../components/chat/ChatInterface";
import { MediaPanel } from "../components/media/MediaPanel";
import { ConfettiEffect } from "../components/effects/ConfettiEffect";
import { useFlowise } from "../hooks/use-flowise";
import { useMediaPanel } from "../hooks/use-media-panel";
import { analytics } from "../lib/analytics";
import { INTRO_VIDEO_URL } from "../../../shared/welcome-message";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

interface HomepageProps {
  onInfoDataUpdate?: (data: InfoPanelData | null) => void;
}

// After this many ms of being paused, Peter continues without the video
const PAUSE_TIMEOUT_MS = 3000;

export default function Homepage({ onInfoDataUpdate }: HomepageProps) {
  const [showWelcome, setShowWelcome] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [infoData, setInfoData] = useState<InfoPanelData | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const previousIndicesRef = useRef<number>(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: welcome message added at most once per session
  const welcomeAddedRef = useRef(false);

  const chatflowId = import.meta.env.VITE_FLOWISE_CHATFLOW_ID;

  const handleInfoDataUpdate = (newData: InfoPanelData | null) => {
    if (!newData) return;

    setInfoData(prevData => {
      const updatedData = {
        theme: newData.theme !== undefined ? newData.theme : prevData?.theme,
        nombre_d_indices: newData.nombre_d_indices !== undefined ? newData.nombre_d_indices : prevData?.nombre_d_indices,
        score_globale: newData.score_globale !== undefined ? newData.score_globale : prevData?.score_globale,
      };

      const currentIndices = parseInt(updatedData.nombre_d_indices || '0', 10);
      const previousIndices = previousIndicesRef.current;

      if (currentIndices > previousIndices && currentIndices > 0) {
        setShowConfetti(true);
      }

      previousIndicesRef.current = currentIndices;

      if (onInfoDataUpdate) {
        onInfoDataUpdate(updatedData);
      }

      return updatedData;
    });
  };

  const ttsEnqueueRef = useRef<((text: string) => void) | null>(null);
  const handleSentenceComplete = useCallback((sentence: string) => {
    ttsEnqueueRef.current?.(sentence);
  }, []);

  const {
    messages,
    isLoading,
    currentStepLabel,
    sendMessage,
    resetSession,
    initializeChat,
    addWelcomeMessage,
  } = useFlowise(chatflowId, handleInfoDataUpdate, {
    onSentenceComplete: handleSentenceComplete,
  });

  const {
    isOpen: isMediaPanelOpen,
    activeTab,
    currentVideo,
    currentWebpage,
    openMediaPanel,
    closeMediaPanel,
    showVideo,
    showWebpage,
    switchTab,
  } = useMediaPanel();

  // Called once to add PETER_WELCOME_MESSAGE — idempotent via ref guard
  const triggerWelcome = useCallback(() => {
    if (welcomeAddedRef.current) return;
    welcomeAddedRef.current = true;
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    addWelcomeMessage();
  }, [addWelcomeMessage]);

  // Video ended → Peter continues immediately
  const handleVideoEnded = useCallback(() => {
    console.log('[Intro] Video ended → Peter continues');
    triggerWelcome();
  }, [triggerWelcome]);

  // Video paused → start 3s timer (then Peter continues)
  const handleVideoPaused = useCallback(() => {
    if (welcomeAddedRef.current) return;
    console.log('[Intro] Video paused → starting 3s timer');
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => {
      console.log('[Intro] 3s elapsed after pause → Peter continues');
      triggerWelcome();
    }, PAUSE_TIMEOUT_MS);
  }, [triggerWelcome]);

  // Video resumed → cancel pending pause timer
  const handleVideoPlay = useCallback(() => {
    if (pauseTimerRef.current) {
      console.log('[Intro] Video resumed → cancelling pause timer');
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const handleStartAdventure = () => {
    setShowWelcome(false);
    setShowChat(true);
    initializeChat();
    // Load intro video immediately in the panel
    showVideo(INTRO_VIDEO_URL, "Introduction — Dilemme Plastique", "Regarde cette vidéo pour démarrer l'aventure");
    analytics.trackPageView('chat_interface');
  };

  const handleResetSession = () => {
    window.location.reload();
  };

  const handleVideoClick = (videoUrl: string) => {
    let title = "Vidéo éducative";
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      title = "Vidéo YouTube";
    } else if (videoUrl.includes('gumlet.io') || videoUrl.includes('gumlet.tv')) {
      title = "Vidéo Gumlet";
    }

    showVideo(videoUrl, title, "Ressource partagée par Peter");
    analytics.trackVideoOpened(videoUrl);
  };

  const handleLinkClick = (linkUrl: string) => {
    showWebpage(linkUrl, "Article externe");
    analytics.trackLinkOpened(linkUrl);
  };

  const handleThumbsUp = async () => {
    await sendMessage("OK");
  };

  const handleChoiceClick = async (choice: string) => {
    await sendMessage(choice);
  };

  const handleConfettiComplete = () => {
    setShowConfetti(false);
  };

  return (
    <main className="flex-1 flex overflow-hidden relative">
      <ConfettiEffect
        isTriggered={showConfetti}
        onComplete={handleConfettiComplete}
      />

      {showWelcome && !showChat ? (
        <div className="flex-1 flex items-center justify-center p-8 bg-white">
          <div className="text-center max-w-2xl">
            <div className="mb-8">
              <div className="w-40 h-40 mx-auto mb-4">
                <img
                  src={peterAvatarImage}
                  alt="Peter - Guide écologique"
                  className="w-40 h-40 object-contain"
                />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Peter vous guide pour comprendre comment le plastique impacte notre santé
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Explorez les dilemmes du plastique à travers des scénarios interactifs, avec de la vidéo et des documents.
              </p>
            </div>

            <div className="mb-8">
              <Button
                size="lg"
                onClick={handleStartAdventure}
                data-testid="button-start-chat"
                className="bg-accent hover:bg-accent/80 text-accent-foreground font-semibold py-4 px-8 rounded-xl transition-all transform hover:scale-105 text-lg"
              >
                Démarrer l'aventure !
              </Button>
              <p className="text-sm text-gray-500 mt-4">
                Session d'apprentissage : 20-30 minutes
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 text-sm text-gray-600">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                  <Lightbulb className="w-6 h-6 text-green-600" />
                </div>
                <div className="font-medium">Scénarios réels</div>
                <div>Cas concrets du quotidien</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                  <Video className="w-6 h-6 text-blue-600" />
                </div>
                <div className="font-medium">Contenu multimédia</div>
                <div>Vidéos et ressources</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle className="w-6 h-6 text-purple-600" />
                </div>
                <div className="font-medium">Actions concrètes</div>
                <div>Solutions applicables</div>
              </div>
            </div>
          </div>
        </div>
      ) : showChat ? (
        <>
          {/* Left Side - Chat (1/3 width) */}
          <div className="w-1/3 flex flex-col bg-white border-r border-gray-200 chat-container chat-sidebar">
            <ChatInterface
              messages={messages}
              onSendMessage={sendMessage}
              onVideoClick={handleVideoClick}
              onLinkClick={handleLinkClick}
              onToggleMediaPanel={openMediaPanel}
              onThumbsUp={handleThumbsUp}
              onChoiceClick={handleChoiceClick}
              onWatchedVideo={triggerWelcome}
              isLoading={isLoading}
              messageCount={messages.length}
              currentStepLabel={currentStepLabel}
              ttsEnqueueRef={ttsEnqueueRef}
            />
          </div>

          {/* Right Side - Media Panel (2/3 width) - Always Visible */}
          <div className="w-2/3 bg-gray-50 media-panel-container">
            <MediaPanel
              isOpen={true}
              activeTab={activeTab}
              currentVideo={currentVideo}
              currentWebpage={currentWebpage}
              onClose={() => {}}
              onTabChange={switchTab}
              onVideoEnded={handleVideoEnded}
              onVideoPaused={handleVideoPaused}
              onVideoPlay={handleVideoPlay}
            />
          </div>
        </>
      ) : null}
    </main>
  );
}
