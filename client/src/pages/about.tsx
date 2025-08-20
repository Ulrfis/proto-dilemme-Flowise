import { Button } from "@/components/ui/button";
import { X, CheckCircle } from "lucide-react";

interface AboutProps {
  onClose: () => void;
}

export default function About({ onClose }: AboutProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">À propos de Dilemme Plastique</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="button-close-about"
              className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
          
          <div className="space-y-6">
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Objectifs pédagogiques</h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Développer la compréhension des enjeux environnementaux liés au plastique</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Explorer les dimensions économiques et sociales des alternatives au plastique</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Encourager la réflexion critique et la prise de décisions éclairées</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Proposer des actions concrètes applicables au quotidien</span>
                </li>
              </ul>
            </section>
            
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Guide pour les enseignants</h3>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Planification de séance (20-30 minutes)</h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <div><span className="font-medium">5 min :</span> Introduction et lancement de l'application</div>
                  <div><span className="font-medium">15-20 min :</span> Interaction avec Peter et exploration des scénarios</div>
                  <div><span className="font-medium">5 min :</span> Synthèse et discussion des solutions proposées</div>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-amber-50 rounded-lg">
                <h4 className="font-medium text-amber-900 mb-2">Conseils d'animation</h4>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Encouragez les étudiants à explorer différents choix</li>
                  <li>• Utilisez la fonction de réinitialisation pour comparer les scénarios</li>
                  <li>• Profitez des ressources multimédias pour approfondir les discussions</li>
                  <li>• Terminez par un échange sur les actions applicables</li>
                </ul>
              </div>
            </section>
            
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Accessibilité et confidentialité</h3>
              <div className="text-gray-700 space-y-2 text-sm">
                <p>
                  <span className="font-medium">Confidentialité :</span> 
                  Aucune donnée personnelle n'est collectée. Les conversations restent privées et ne sont pas sauvegardées.
                </p>
                <p>
                  <span className="font-medium">Accessibilité :</span> 
                  Interface conforme aux standards WCAG 2.1 AA avec navigation au clavier et contraste élevé.
                </p>
                <p>
                  <span className="font-medium">Compatibilité :</span> 
                  Optimisé pour les ordinateurs de bureau et portables (écran minimum 1024px).
                </p>
              </div>
            </section>
            
            <section className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Crédits et contact</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p>Développé avec l'intelligence artificielle Peter powered by Flowise</p>
                <p>Interface conçue selon les standards éducatifs français</p>
                <p>Lecteur vidéo Gumlet intégré pour une expérience optimisée</p>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="font-medium">Contact support technique :</p>
                  <p>support@dilemme-plastique.fr</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
