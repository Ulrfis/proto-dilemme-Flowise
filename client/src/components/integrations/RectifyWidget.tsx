import { useEffect } from 'react';

declare global {
  interface Window {
    Rectify?: any;
    RectifyInstance?: any;
  }
}

export function RectifyWidget() {
  useEffect(() => {
    // Éviter de charger le script plusieurs fois
    if (window.RectifyInstance) {
      return;
    }

    // Configuration du widget Rectify
    const config = {
      widgetSrc: 'https://api.rectify.so/widget/widget.umd.js',
      projectId: '67fa3feb2c561c2729b9fc5d',
    };

    // Créer et charger le script
    const script = document.createElement('script');
    script.src = config.widgetSrc;
    script.async = true;
    
    script.onload = () => {
      console.log('[Rectify] Widget chargé avec succès');
      // Attendre un peu pour que le script soit complètement initialisé
      setTimeout(() => {
        if (typeof window.Rectify === 'function') {
          try {
            window.RectifyInstance = new window.Rectify();
            window.RectifyInstance.init(config.projectId, undefined, undefined);
            console.log('[Rectify] Widget initialisé avec le projet:', config.projectId);
          } catch (error) {
            console.error('[Rectify] Erreur lors de l\'initialisation:', error);
          }
        } else {
          console.error('[Rectify] Fonction Rectify non disponible après le chargement');
          console.log('[Rectify] Objets disponibles sur window:', Object.keys(window).filter(key => key.toLowerCase().includes('rect')));
        }
      }, 100);
    };

    script.onerror = (error) => {
      console.error('[Rectify] Erreur de chargement du script:', error);
    };

    // Ajouter le script au head
    document.head.appendChild(script);

    // Cleanup function
    return () => {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (window.RectifyInstance) {
        window.RectifyInstance = undefined;
      }
    };
  }, []);

  // Ce composant ne rend rien visuellement
  return null;
}