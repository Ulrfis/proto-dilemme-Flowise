import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImage from "@assets/the-earth-in-a-plastic-bag-little_1756372076127.png";
import { InfoPanel } from "../media/InfoPanel";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

interface HeaderProps {
  onAboutClick: () => void;
  infoData?: InfoPanelData | null;
}

export function Header({ onAboutClick, infoData }: HeaderProps) {

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
            <p className="text-xs text-gray-600">Découvrez les raisons de l'impact négatif du plastique sur la santé humaine</p>
          </div>
        </div>
        
        <nav className="flex items-center space-x-4">
          {infoData && (
            <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span>Thématique :</span>
                  <span className="font-semibold">{infoData.theme || "à spécifier"}</span>
                </div>
                <div className="opacity-60">|</div>
                <div className="flex items-center gap-2">
                  <span>Indices :</span>
                  <span className="font-semibold">{infoData.nombre_d_indices || "0"}</span>
                </div>
                <div className="opacity-60">|</div>
                <div className="flex items-center gap-2">
                  <span>Score :</span>
                  <span className="font-semibold">{infoData.score_globale || "à venir"}</span>
                </div>
              </div>
            </div>
          )}
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
