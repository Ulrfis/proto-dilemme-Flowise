# Waveform audio en temps réel pendant l'enregistrement vocal

**Date :** 2026-05-03
**Statut :** ✅ Spécification approuvée — implémentation en cours
**Scope :** `client/src/components/chat/ChatInput.tsx` uniquement

---

## 1. Objectif UX

Donner à l'élève un retour visuel **immédiat et discret** confirmant que l'application capte sa voix lorsqu'il appuie sur le bouton micro. Aucune latence ne doit être ajoutée à la chaîne d'enregistrement → transcription → envoi.

## 2. Contraintes

- **Latence nulle** : la visualisation lit directement le buffer audio en temps réel, en parallèle de `MediaRecorder` (ne ralentit pas la capture).
- **Discret** : même emprise visuelle que le champ texte (32 px de haut, même largeur), pas de pop-up, pas de modal.
- **Couleur** : violet `#a855f7` (variable CSS `--accent`), identique à la couleur des bulles utilisateur et du bouton micro.
- **Aucune dépendance externe** : utilisation exclusive du Web Audio API natif.
- **Scope minimal** : un seul fichier modifié, aucun changement d'API, aucune migration de schéma.

## 3. Choix technique

**Web Audio API (`AnalyserNode`) + `<canvas>` HTML5.**

| Critère | Web Audio API natif | wavesurfer.js | react-audio-visualize |
|---|---|---|---|
| Latence | **0 ms** (lit le buffer live) | ~50 ms (buffering interne) | ~5 ms |
| Poids | **0 KB** (natif) | ~600 KB | ~30 KB |
| Code | ~60 lignes | Wrapper + config | Composant + props |
| Contrôle visuel | Total | Limité au thème | Limité aux props |

→ **Le natif gagne sur tous les critères** pour ce besoin minimaliste.

## 4. Principe de fonctionnement

```
[Micro] → MediaStream ──┬──▶ MediaRecorder ──▶ webm blob ──▶ /api/transcribe
                        │
                        └──▶ AudioContext.createMediaStreamSource()
                                    │
                                    ▼
                             AnalyserNode (FFT)
                                    │
                                    ▼
                       requestAnimationFrame loop
                                    │
                                    ▼
                          getByteFrequencyData()
                                    │
                                    ▼
                              <canvas> (40 barres)
```

La même `MediaStream` alimente les deux branches en parallèle — aucune copie, aucun overhead.

## 5. Détails d'implémentation

### 5.1 Refs ajoutés dans `ChatInput`

```ts
const audioContextRef = useRef<AudioContext | null>(null);
const analyserRef = useRef<AnalyserNode | null>(null);
const animationFrameRef = useRef<number | null>(null);
const canvasRef = useRef<HTMLCanvasElement | null>(null);
```

### 5.2 Branchement dans `startRecording()`

Juste après `streamRef.current = stream;` :

```ts
const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const audioContext = new AudioContextClass();
const source = audioContext.createMediaStreamSource(stream);
const analyser = audioContext.createAnalyser();
analyser.fftSize = 128;          // → 64 bandes de fréquence
analyser.smoothingTimeConstant = 0.7;
source.connect(analyser);
audioContextRef.current = audioContext;
analyserRef.current = analyser;
```

### 5.3 Boucle de dessin

Déclenchée par `useEffect` quand `isRecording === true` :

```ts
const draw = () => {
  const analyser = analyserRef.current;
  const canvas = canvasRef.current;
  if (!analyser || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bufferLength = analyser.frequencyBinCount; // 64
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const BAR_COUNT = 40;
  const BAR_WIDTH = 2;
  const GAP = (W - BAR_COUNT * BAR_WIDTH) / (BAR_COUNT - 1);

  for (let i = 0; i < BAR_COUNT; i++) {
    const v = dataArray[Math.floor(i * bufferLength / BAR_COUNT)] / 255; // 0..1
    const barH = Math.max(2, v * H * 0.9);
    const x = i * (BAR_WIDTH + GAP);
    const y = (H - barH) / 2;
    // opacité 0.4 quand silence, 1.0 sur pic
    const alpha = (0.4 + v * 0.6).toFixed(2);
    ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`; // #a855f7
    ctx.fillRect(x, y, BAR_WIDTH, barH);
  }

  animationFrameRef.current = requestAnimationFrame(draw);
};
```

### 5.4 Nettoyage dans `stopRecording()`

```ts
if (animationFrameRef.current !== null) {
  cancelAnimationFrame(animationFrameRef.current);
  animationFrameRef.current = null;
}
if (audioContextRef.current) {
  audioContextRef.current.close().catch(() => {});
  audioContextRef.current = null;
}
analyserRef.current = null;
```

### 5.5 JSX — bascule input ↔ canvas

```tsx
{isRecording ? (
  <canvas
    ref={canvasRef}
    width={400}
    height={36}
    className="w-full h-9 rounded-md bg-purple-50 border border-purple-200"
    aria-label="Enregistrement audio en cours"
    data-testid="canvas-waveform"
  />
) : (
  <Input ... />
)}
```

Le bouton micro reste affiché à droite et permet de stopper l'enregistrement (comme aujourd'hui).

### 5.6 Compatibilité HiDPI (Retina)

Pour éviter le rendu flou sur écrans Retina, on règle la résolution interne du canvas selon `window.devicePixelRatio` :

```ts
const dpr = window.devicePixelRatio || 1;
canvas.width = canvas.offsetWidth * dpr;
canvas.height = canvas.offsetHeight * dpr;
ctx.scale(dpr, dpr);
```

Géré une seule fois, à l'apparition du canvas.

## 6. Cycle de vie

| Événement | Action |
|---|---|
| Clic micro → `startRecording()` | `getUserMedia` → `MediaRecorder.start()` + `AudioContext` créé + `requestAnimationFrame` loop démarrée |
| Pendant l'enregistrement | Canvas dessine 40 barres violettes 60 fois/seconde |
| Clic micro à nouveau → `stopRecording()` | `MediaRecorder.stop()` + `cancelAnimationFrame()` + `AudioContext.close()` |
| `processRecording()` envoie à `/api/transcribe` | Canvas déjà disparu, input texte affiché en mode "Transcription..." |
| Démontage du composant | `useEffect` cleanup → `cancelAnimationFrame` + close `AudioContext` |

## 7. Tests d'acceptation

- [ ] Cliquer micro → champ texte remplacé par canvas violet animé en moins de 200 ms
- [ ] Parler → barres réagissent visuellement à la voix (amplitude visible)
- [ ] Silence → barres restent fines à opacité 0.4 (pas un trait plat)
- [ ] Cliquer à nouveau → canvas disparaît, "Transcription..." s'affiche
- [ ] Pas de fuite mémoire après plusieurs cycles enregistrement/arrêt (vérification : `audioContextRef.current` à `null`, pas de `requestAnimationFrame` actif)
- [ ] Pas de régression sur le flux MediaRecorder → /api/transcribe (la transcription reçoit le même blob qu'avant)
- [ ] Couleur visuellement identique aux bulles utilisateur

## 8. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Safari < 14 sans `AudioContext` | Fallback `webkitAudioContext` (déjà inclus) |
| `MediaStream` partagée entre `MediaRecorder` et `AudioContext` | Aucun risque : c'est un cas d'usage standard du Web Audio API, les deux consomment le même flux indépendamment |
| Boucle RAF non arrêtée → batterie/CPU | `useEffect` cleanup garantit l'arrêt à `isRecording === false` et au démontage |
| Canvas trop large/petit selon viewport | `width="100%"` + recalcul DPR à l'apparition |

## 9. Hors scope

- Visualisation pendant la lecture TTS de Peter (pourrait être un futur ajout)
- Indicateur d'amplitude moyenne / VU-mètre numérique
- Mode "barres miroir" haut/bas
- Détection automatique de fin de parole (VAD)
