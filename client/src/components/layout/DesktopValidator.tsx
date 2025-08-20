import { useState, useEffect } from "react";
import { Monitor } from "lucide-react";

export function DesktopValidator({ children }: { children: React.ReactNode }) {
  const [screenWidth, setScreenWidth] = useState<number>(0);
  const [isDesktop, setIsDesktop] = useState<boolean>(true);

  useEffect(() => {
    const updateScreenWidth = () => {
      const width = window.innerWidth;
      setScreenWidth(width);
      setIsDesktop(width >= 1024);
    };

    updateScreenWidth();
    window.addEventListener('resize', updateScreenWidth);
    
    return () => window.removeEventListener('resize', updateScreenWidth);
  }, []);

  if (!isDesktop) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <Monitor className="w-16 h-16 mx-auto text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Application de bureau uniquement
          </h1>
          <p className="text-gray-600 mb-6">
            Dilemme Plastique est conçu pour être utilisé sur un ordinateur de bureau ou un portable. 
            Veuillez accéder à cette application depuis un écran plus large (minimum 1024px).
          </p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>Largeur actuelle de l'écran : <span className="font-mono">{screenWidth}px</span></p>
            <p>Largeur minimale requise : <span className="font-mono">1024px</span></p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
