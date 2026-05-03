# PostHog – Funnel & Dashboard "Usage Dilemme Plastique"

Ce document décrit **comment configurer dans l'UI PostHog** le funnel et le dashboard demandés
par la tâche « Définir un funnel PostHog et un tableau de bord usage ». Il n'y a aucune
configuration côté code : tous les events listés ici sont déjà émis par
`client/src/lib/analytics.ts`.

> Une fois le dashboard créé, copier son URL dans `replit.md`
> (section *External Dependencies → PostHog*) à l'emplacement marqué `Dashboard: …`.

---

## 1. Events disponibles

Source : `client/src/lib/analytics.ts`. Tous les events portent une propriété `sessionId`.

| Event PostHog        | Émis quand…                                              | Propriétés utiles                  |
|----------------------|----------------------------------------------------------|------------------------------------|
| `page_view`          | Chargement d'une page (`page` = nom de la route)         | `page`                             |
| `session_started`    | Démarrage d'une session                                  | —                                  |
| `identity_captured`  | Prénom de l'élève détecté pendant la conversation        | `firstName` (si présent)           |
| `aventure_demarree`  | Clic sur « Démarrer l'aventure »                         | —                                  |
| `chat_start`         | Première interaction dans le chat                        | —                                  |
| `message_sent` / `message_envoye` | Élève envoie un message                     | `length`                           |
| `peter_replied` / `peter_repondu` | Réponse complète de Peter reçue             | `length`, `ttftMs`, `totalMs`      |
| `video_opened` / `video_ouverte`  | Lecture d'une vidéo                         | `url`                              |
| `link_opened` / `article_ouvert`  | Ouverture d'un lien article dans la webview | `url`                              |
| `panneau_media_change` | Changement de panneau média                            | `panel`                            |
| `mute_bascule`       | Toggle audio                                             | `muted`                            |
| `session_complete` / `session_terminee` | Fin de session                          | `durationMs`                       |

> Les noms FR et EN sont émis en parallèle pour rétro-compatibilité ;
> dans PostHog, **utiliser de préférence les noms EN** (`message_sent`, `peter_replied`,
> `video_opened`, `link_opened`, `session_complete`) pour les insights ci-dessous.

---

## 2. Funnel principal — « Parcours élève »

**Type :** Funnel (ordered)
**Conversion window :** 30 minutes
**Étapes :**

1. `page_view` — filtrer `page = "homepage"` (valeur émise par `client/src/App.tsx`
   via `analytics.trackPageView('homepage')`)
2. `identity_captured`
3. `message_sent` — 1er message élève
4. `peter_replied` — Peter répond
5. `message_sent` — 2e message élève
6. `peter_replied` — Peter répond (2e)
7. `message_sent` — 3e message élève

> **Pourquoi cette structure ?** PostHog ne permet pas de poser un seuil
> « count ≥ N » directement sur une étape de funnel. On encode donc
> l'objectif « ≥ 3 messages échangés » en exigeant 3 occurrences ordonnées
> de `message_sent` (entrelacées avec les `peter_replied`). Atteindre la
> dernière étape garantit ≥ 3 messages élève et ≥ 5 messages échangés au
> total dans la conversation. C'est ce que crée le script
> `scripts/posthog-setup-dashboard.mjs`.

**Breakdown :** aucun par défaut ; ajouter `$current_url` ou `page` si plusieurs entrées.
**Visualization :** Funnel steps (default).

---

## 3. Dashboard « Usage Dilemme Plastique »

Créer un dashboard PostHog nommé **« Usage – Dilemme Plastique »** et y ajouter les
insights suivants :

### 3.1 Sessions / jour
- Insight : **Trends**
- Event : `session_started`
- Aggregation : *Unique sessions* (sur `sessionId`) ou *Total count*
- Interval : `Day`
- Période : 30 derniers jours

### 3.2 Durée moyenne de session
- Insight : **Trends**
- Event : `session_complete`
- Math : *Average* sur la propriété numérique `durationMs`
- Affichage : convertir mentalement en minutes (`durationMs / 60000`)
- Interval : `Day`

### 3.3 Taux d'abandon par étape (funnel)
- Insight : copier le funnel de la section §2
- Visualization : *Funnel steps* (affiche directement le drop-off entre chaque étape)

### 3.4 Top vidéos cliquées
- Insight : **Trends**
- Event : `video_opened`
- Breakdown by : propriété `url`
- Visualization : *Bar chart* (top 10)
- Période : 30 jours

### 3.5 Top liens articles ouverts
- Insight : **Trends**
- Event : `link_opened`
- Breakdown by : propriété `url`
- Visualization : *Bar chart* (top 10)
- Période : 30 jours

### 3.6 (Bonus utile) Latence moyenne Peter
- Insight : **Trends**
- Event : `peter_replied`
- Math : *Average* sur `ttftMs` et second insight pour `totalMs`
- Interval : `Day`

---

## 4. Après création

1. Récupérer l'URL du dashboard (`https://eu.posthog.com/project/<id>/dashboard/<id>`).
2. La coller dans `replit.md` à la ligne « PostHog » de la section *External Dependencies*.
3. Partager l'accès (lecture) avec les enseignants concernés via l'UI PostHog.
