import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ 
  onSendMessage, 
  disabled = false,
  placeholder = "Tapez votre message..."
}: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="flex items-center space-x-3">
        <div className="flex-1 relative">
          <Input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            data-testid="input-chat-message"
            className="pr-12"
            aria-label="Message pour Peter"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!message.trim() || disabled}
            data-testid="button-send-message"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
            aria-label="Envoyer le message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
      <div className="mt-2 text-xs text-gray-500">
        Appuyez sur Entrée pour envoyer • 
        <span className="text-green-600 ml-1">Conversation sécurisée et privée</span>
      </div>
    </div>
  );
}
