# Audit chatflow Flowise — Dilemme Plastique P1 simplifié
> Généré le 2026-05-02T18:30:15.548Z

**ID** : `1a7e3c86-6cbd-4fcf-ac01-bbf8b59a5bd9`
**Type** : AGENTFLOW  |  **Catégorie** : ?
**Nœuds** : 28  |  **Arêtes** : 28

## Inventaire des nœuds

| ID | Label | Catégorie | Type |
|---|---|---|---|
| `startAgentflow_0` | Start | Agent Flows | agentFlow |
| `agentAgentflow_0` | Agent_Peter_Mer | Agent Flows | agentFlow |
| `customFunctionAgentflow_0` | verifier_si_l'utilisateur_a_trouvé_un_mot_de_la_liste | Agent Flows | agentFlow |
| `conditionAgentflow_0` | Condition_au_cas_ou_l'utilisateur_a_trouvé_un_mot | Agent Flows | agentFlow |
| `customFunctionAgentflow_1` | update_liste_en_enlevant_le_mot_l'utilisateur_a_deja_trouvé | Agent Flows | agentFlow |
| `customFunctionAgentflow_2` | ajouter_un_point_au_score_de_theme | Agent Flows | agentFlow |
| `conditionAgentflow_1` | condition_si_l'utilisatur_a_trouvé_nombre_d'indices_necessaires_pour_passer_au_niveau_suivant | Agent Flows | agentFlow |
| `agentAgentflow_1` | Agent_Peter_Mer | Agent Flows | agentFlow |
| `customFunctionAgentflow_3` | l'enfant_a_choisit_de_passer_au_jeu_puis_de_passer_au_niveau_suivant | Agent Flows | agentFlow |
| `conditionAgentflow_2` | Condition_mode_peter_ou_jeux | Agent Flows | agentFlow |
| `conditionAgentflow_3` | type_jeux | Agent Flows | agentFlow |
| `agentAgentflow_2` | Agent quiz | Agent Flows | agentFlow |
| `conditionAgentflow_4` | verfier_si_on_a_fini_jeux_quiz | Agent Flows | agentFlow |
| `customFunctionAgentflow_4` | quiz_fini | Agent Flows | agentFlow |
| `customFunctionAgentflow_6` | nombre_de_quiz | Agent Flows | agentFlow |
| `conditionAgentflow_8` | condition_selon_le_theme_existant | Agent Flows | agentFlow |
| `llmAgentflow_2` | initialisation_nom_utilisateur | Agent Flows | agentFlow |
| `customFunctionAgentflow_14` | changer_le_theme_vers_l'intoduction | Agent Flows | agentFlow |
| `agentAgentflow_5` | Peter_Introduction | Agent Flows | agentFlow |
| `loopAgentflow_0` | Loop 0 | Agent Flows | agentFlow |
| `conditionAgentflow_9` | Condition_theme_change | Agent Flows | agentFlow |
| `llmAgentflow_3` | LLM | Agent Flows | agentFlow |
| `customFunctionAgentflow_15` | changer_theme | Agent Flows | agentFlow |
| `customFunctionAgentflow_16` | enlever_theme_de_la_liste_des_themes | Agent Flows | agentFlow |
| `customFunctionAgentflow_17` | l'enfant_a_choisit_de_passer_au_niveau_suivant_directement_sans_passer_de_jeu | Agent Flows | agentFlow |
| `humanInputAgentflow_2` | Human Input 0 (2) | Agent Flows | agentFlow |
| `conditionAgentflow_21` | Condition_si_on_est_au_dernier_niveau_ou_non | Agent Flows | agentFlow |
| `directReplyAgentflow_1` | fin_jeu_félicitation_etudiant | Agent Flows | agentFlow |

## Goulots de latence détectés

| Nœud | Type détecté | Recommandation |
|---|---|---|
| `Start` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Agent_Peter_Mer` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `verifier_si_l'utilisateur_a_trouvé_un_mot_de_la_liste` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Condition_au_cas_ou_l'utilisateur_a_trouvé_un_mot` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `update_liste_en_enlevant_le_mot_l'utilisateur_a_deja_trouvé` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `ajouter_un_point_au_score_de_theme` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `condition_si_l'utilisatur_a_trouvé_nombre_d'indices_necessaires_pour_passer_au_niveau_suivant` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Agent_Peter_Mer` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `l'enfant_a_choisit_de_passer_au_jeu_puis_de_passer_au_niveau_suivant` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Condition_mode_peter_ou_jeux` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `type_jeux` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Agent quiz` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `verfier_si_on_a_fini_jeux_quiz` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `quiz_fini` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `nombre_de_quiz` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `condition_selon_le_theme_existant` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `initialisation_nom_utilisateur` | LLM call | Vérifier streaming activé; activer prompt caching (OpenAI/Anthropic) |
| `changer_le_theme_vers_l'intoduction` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Peter_Introduction` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Loop 0` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Condition_theme_change` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `LLM` | LLM call | Vérifier streaming activé; activer prompt caching (OpenAI/Anthropic) |
| `changer_theme` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `enlever_theme_de_la_liste_des_themes` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `l'enfant_a_choisit_de_passer_au_niveau_suivant_directement_sans_passer_de_jeu` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Human Input 0 (2)` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `Condition_si_on_est_au_dernier_niveau_ou_non` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |
| `fin_jeu_félicitation_etudiant` | Routing/agent | Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués |

## Topologie d'exécution

- **Roots (entrées)** : 1 (Start)
- **Plus long chemin** : 15 nœuds

> ⚠️ Le plus long chemin contient 15 nœuds, ce qui correspond aux ~11 cycles `agentFlowEvent` observés dans les logs. Chaque nœud ajoute de la latence séquentielle.

**Détail du chemin le plus long :**

1. `Start` (agentFlow)
2. `LLM` (agentFlow)
3. `Condition_theme_change` (agentFlow)
4. `changer_theme` (agentFlow)
5. `enlever_theme_de_la_liste_des_themes` (agentFlow)
6. `condition_selon_le_theme_existant` (agentFlow)
7. `Condition_mode_peter_ou_jeux` (agentFlow)
8. `verifier_si_l'utilisateur_a_trouvé_un_mot_de_la_liste` (agentFlow)
9. `Condition_au_cas_ou_l'utilisateur_a_trouvé_un_mot` (agentFlow)
10. `update_liste_en_enlevant_le_mot_l'utilisateur_a_deja_trouvé` (agentFlow)
11. `ajouter_un_point_au_score_de_theme` (agentFlow)
12. `condition_si_l'utilisatur_a_trouvé_nombre_d'indices_necessaires_pour_passer_au_niveau_suivant` (agentFlow)
13. `Condition_si_on_est_au_dernier_niveau_ou_non` (agentFlow)
14. `Human Input 0 (2)` (agentFlow)
15. `l'enfant_a_choisit_de_passer_au_jeu_puis_de_passer_au_niveau_suivant` (agentFlow)

## Recommandations actionnables

### Quick wins (à appliquer en priorité)

- 🎯 **LLM** : vérifier que le streaming est activé sur tous les nœuds LLM ; activer prompt caching côté provider (OpenAI > 1024 tokens, Anthropic via cache_control)
- 🎯 **Chemin séquentiel** : audit manuel des 15 nœuds du chemin le plus long pour identifier ceux qui peuvent être supprimés ou rendus parallèles

### Vérifications côté Flowise

- `streaming: true` activé sur le LLM final
- `returnSourceDocuments: false` (déjà fait côté serveur)
- Mémoire : limiter à N derniers échanges
- Tools : annoter `async: true` quand le résultat n'est pas critique pour la réponse
