import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, Lightbulb, Video, CheckCircle } from "lucide-react";
import peterAvatarImage from "@assets/Peter Avatar_1756372265537.jpg";
import { ChatInterface } from "../components/chat/ChatInterface";
import { MediaPanel } from "../components/media/MediaPanel";
import { ConfettiEffect } from "../components/effects/ConfettiEffect";
import { useFlowise } from "../hooks/use-flowise";
import { useMediaPanel } from "../hooks/use-media-panel";
import { analytics } from "../lib/analytics";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

interface HomepageProps {
  onInfoDataUpdate?: (data: InfoPanelData | null) => void;
}

export default function Homepage({ onInfoDataUpdate }: HomepageProps) {
  const [showChat, setShowChat] = useState(false);
  const [infoData, setInfoData] = useState<InfoPanelData | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const previousIndicesRef = useRef<number>(0);
  
  // Get Flowise config from environment variables
  const chatflowId = import.meta.env.VITE_FLOWISE_CHATFLOW_ID || import.meta.env.FLOWISE_CHATFLOW_ID;
  
  // Callback to update info panel data from Flowise responses
  const handleInfoDataUpdate = (newData: InfoPanelData | null) => {
    if (!newData) return; // Skip if null
    
    setInfoData(prevData => {
      // Merge with existing data (keep previous values if new ones are not provided)
      const updatedData = {
        theme: newData.theme !== undefined ? newData.theme : prevData?.theme,
        nombre_d_indices: newData.nombre_d_indices !== undefined ? newData.nombre_d_indices : prevData?.nombre_d_indices,
        score_globale: newData.score_globale !== undefined ? newData.score_globale : prevData?.score_globale,
      };
      
      // Détecter si le nombre d'indices a augmenté pour déclencher l'effet confetti
      const currentIndices = parseInt(updatedData.nombre_d_indices || '0', 10);
      const previousIndices = previousIndicesRef.current;
      
      console.log('[Confetti] Vérification indices:', {
        previous: previousIndices,
        current: currentIndices,
        increased: currentIndices > previousIndices && currentIndices > 0
      });
      
      if (currentIndices > previousIndices && currentIndices > 0) {
        console.log('[Confetti] Indice trouvé ! Déclenchement de l\'effet confetti');
        setShowConfetti(true);
      }
      
      previousIndicesRef.current = currentIndices;
      
      // Also update parent component
      if (onInfoDataUpdate) {
        onInfoDataUpdate(updatedData);
      }
      
      return updatedData;
    });
  };

  const {
    messages,
    isLoading,
    sendMessage,
    resetSession,
    initializeChat,
  } = useFlowise(chatflowId, handleInfoDataUpdate);

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

  const handleStartChat = () => {
    setShowChat(true);
    initializeChat();
    // Media panel is always visible in the new split layout
    analytics.trackPageView('chat_interface');
  };

  const handleResetSession = () => {
    // Refresh the browser to completely reset the session
    window.location.reload();
  };

  const handleVideoClick = (videoUrl: string) => {
    // Determine video source for better title
    let title = "Vidéo éducative";
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      title = "Vidéo YouTube";
    } else if (videoUrl.includes('gumlet.io')) {
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
    // Send "OK" message to trigger next message from Peter
    await sendMessage("OK");
  };

  const handleChoiceClick = async (choice: string) => {
    // Send the selected choice as a message to Peter
    await sendMessage(choice);
  };

  const handleConfettiComplete = () => {
    setShowConfetti(false);
    console.log('[Confetti] Effet terminé');
  };

  return (
    <main className="flex-1 flex overflow-hidden relative">
      {/* Effet confetti futuriste */}
      <ConfettiEffect 
        isTriggered={showConfetti} 
        onComplete={handleConfettiComplete}
      />
      
      {!showChat ? (
        /* Welcome Screen - Full Width */
        <div className="flex-1 flex items-center justify-center p-8 bg-white">
          <div className="text-center max-w-2xl">
            <div className="mb-8">
              <div className="w-20 h-20 mx-auto mb-4">
                <img 
                  src={peterAvatarImage} 
                  alt="Peter - Guide écologique" 
                  className="w-20 h-20 rounded-full object-cover"
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
                onClick={handleStartChat}
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
      ) : (
        /* Chat Interface - Split Layout */
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
              isLoading={isLoading}
              messageCount={messages.length}
            />
          </div>

          {/* Right Side - Media Panel (2/3 width) - Always Visible */}
          <div className="w-2/3 bg-gray-50 media-panel-container">
            <MediaPanel
              isOpen={true}
              activeTab={activeTab}
              currentVideo={currentVideo}
              currentWebpage={currentWebpage}
              onClose={() => {}} // No close functionality needed since always visible
              onTabChange={switchTab}
            />
          </div>
        </>
      )}
    </main>
  );
}
