import { Button } from "@/components/ui/button";
import { X, CheckCircle, Shield, AlertTriangle, Lock } from "lucide-react";

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
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Sécurité et confidentialité</h3>
              
              {/* Security Improvements */}
              <div className="bg-green-50 p-4 rounded-lg mb-4">
                <div className="flex items-center mb-3">
                  <Shield className="w-5 h-5 text-green-600 mr-2" />
                  <h4 className="font-medium text-green-900">Protections mises en place</h4>
                </div>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Protection contre les attaques par déni de service (10 messages/minute)</li>
                  <li>• Headers de sécurité avancés contre les attaques XSS</li>
                  <li>• Identifiants de session cryptographiquement sécurisés</li>
                  <li>• Journalisation minimale sans contenu de conversation</li>
                  <li>• Connexions HTTPS chiffrées exclusivement</li>
                </ul>
              </div>

              {/* Privacy Reality */}
              <div className="bg-amber-50 p-4 rounded-lg mb-4">
                <div className="flex items-center mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mr-2" />
                  <h4 className="font-medium text-amber-900">Transparence sur la confidentialité</h4>
                </div>
                <div className="text-sm text-amber-800 space-y-2">
                  <p><span className="font-medium">✓ Adapté pour l'éducation :</span> Conversations anonymes, pas de données personnelles collectées</p>
                  <p><span className="font-medium">⚠ Limitations techniques :</span> L'infrastructure Replit et le serveur Flowise (Suisse) peuvent techniquement accéder aux conversations</p>
                  <p><span className="font-medium">⚠ Usage recommandé :</span> Parfait pour l'apprentissage environnemental, inadapté aux conversations confidentielles</p>
                </div>
              </div>

              {/* Technical Details */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center mb-3">
                  <Lock className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="font-medium text-blue-900">Détails techniques</h4>
                </div>
                <div className="text-sm text-blue-800 space-y-2">
                  <p><span className="font-medium">Stockage :</span> Aucune sauvegarde permanente, conversations en mémoire temporaire uniquement</p>
                  <p><span className="font-medium">Anonymat :</span> Pas de comptes utilisateurs, identifiants de session temporaires</p>
                  <p><span className="font-medium">Durée de session :</span> 20-30 minutes typiques, données effacées à la fermeture</p>
                  <p><span className="font-medium">Conformité RGPD :</span> Traitement minimal de données, base légale éducative</p>
                </div>
              </div>
            </section>
            
            <section className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Accessibilité et compatibilité</h3>
              <div className="text-gray-700 space-y-2 text-sm">
                <p>
                  <span className="font-medium">Accessibilité :</span> 
                  Interface conforme aux standards WCAG 2.1 AA avec navigation au clavier et contraste élevé.
                </p>
                <p>
                  <span className="font-medium">Compatibilité :</span> 
                  Optimisé pour les ordinateurs de bureau et portables (écran minimum 1024px).
                </p>
                <p>
                  <span className="font-medium">Navigateurs supportés :</span> 
                  Chrome, Firefox, Safari, Edge (versions récentes recommandées).
                </p>
              </div>
            </section>
            
            <section className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Crédits et architecture technique</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p><span className="font-medium">Intelligence Artificielle :</span> Peter, assistant éducatif powered by Flowise (serveur hébergé en Suisse)</p>
                <p><span className="font-medium">Interface utilisateur :</span> React/TypeScript avec composants accessibles shadcn/ui</p>
                <p><span className="font-medium">Lecteurs vidéo :</span> YouTube embed éducatif et Gumlet player intégrés</p>
                <p><span className="font-medium">Sécurité :</span> Helmet.js, express-rate-limit, identifiants crypto.randomUUID()</p>
                <p><span className="font-medium">Hébergement :</span> Plateforme Replit avec chiffrement HTTPS</p>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="font-medium">Audit de sécurité :</p>
                  <p>Dernière révision : Août 2025 • Niveau : Adapté usage éducatif</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Cette application est conçue pour un usage pédagogique en environnement scolaire. 
                    Pour des besoins de confidentialité renforcée, consultez votre DSI.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
