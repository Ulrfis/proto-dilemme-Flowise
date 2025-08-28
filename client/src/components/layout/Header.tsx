import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImage from "@assets/the-earth-in-a-plastic-bag-little_1756372076127.png";

interface HeaderProps {
  onAboutClick: () => void;
}

export function Header({ onAboutClick }: HeaderProps) {

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 flex items-center justify-center">
            <img 
              src={logoImage} 
              alt="Dilemme Plastique - La Terre dans un sac plastique" 
              className="w-10 h-10 object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dilemme Plastique</h1>
            <p className="text-sm text-gray-600">Explorez les défis environnementaux avec Peter</p>
          </div>
        </div>
        
        <nav className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={onAboutClick}
            data-testid="button-about"
            className="text-gray-700 hover:text-primary font-medium"
          >
            <Info className="w-4 h-4 mr-2" />
            À propos
          </Button>
        </nav>
      </div>
    </header>
  );
}
