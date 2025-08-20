import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, Lightbulb, Video, CheckCircle } from "lucide-react";
import { ChatInterface } from "../components/chat/ChatInterface";
import { MediaPanel } from "../components/media/MediaPanel";
import { useFlowise } from "../hooks/use-flowise";
import { useMediaPanel } from "../hooks/use-media-panel";
import { analytics } from "../lib/analytics";

export default function Homepage() {
  const [showChat, setShowChat] = useState(false);
  
  // Get Flowise config from environment variables
  const chatflowId = import.meta.env.VITE_FLOWISE_CHATFLOW_ID || 'default-chatflow-id';
  
  const {
    messages,
    isLoading,
    sendMessage,
    resetSession,
    initializeChat,
  } = useFlowise(chatflowId);

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
    analytics.trackPageView('chat_interface');
  };

  const handleResetSession = () => {
    resetSession();
    setShowChat(false);
    closeMediaPanel();
  };

  const handleVideoClick = (videoUrl: string) => {
    showVideo(videoUrl, "Vidéo éducative", "Ressource partagée par Peter");
    analytics.trackVideoOpened(videoUrl);
  };

  const handleLinkClick = (linkUrl: string) => {
    showWebpage(linkUrl, "Article externe");
    analytics.trackLinkOpened(linkUrl);
  };

  return (
    <main className="flex-1 flex overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white">
        {!showChat ? (
          /* Welcome Screen */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-2xl">
              <div className="mb-8">
                <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Rencontrez Peter, votre guide écologique
                </h2>
                <p className="text-lg text-gray-600 mb-8">
                  Explorez les dilemmes du plastique à travers des scénarios interactifs. 
                  Peter vous accompagne pour comprendre les enjeux environnementaux, économiques et sociaux.
                </p>
              </div>
              
              <div className="mb-8">
                <Button
                  size="lg"
                  onClick={handleStartChat}
                  data-testid="button-start-chat"
                  className="bg-primary hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-xl transition-all transform hover:scale-105 text-lg"
                >
                  Commencer avec Peter
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
          /* Chat Interface */
          <ChatInterface
            messages={messages}
            onSendMessage={sendMessage}
            onVideoClick={handleVideoClick}
            onLinkClick={handleLinkClick}
            onToggleMediaPanel={openMediaPanel}
            isLoading={isLoading}
            messageCount={messages.length}
          />
        )}
      </div>

      {/* Media Panel */}
      <MediaPanel
        isOpen={isMediaPanelOpen}
        activeTab={activeTab}
        currentVideo={currentVideo}
        currentWebpage={currentWebpage}
        onClose={closeMediaPanel}
        onTabChange={switchTab}
      />
    </main>
  );
}
