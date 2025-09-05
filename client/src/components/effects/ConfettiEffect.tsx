import { useEffect, useState } from "react";

interface ConfettiEffectProps {
  isTriggered: boolean;
  onComplete?: () => void;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  type: 'star' | 'sparkle' | 'crystal';
  color: string;
  life: number;
  maxLife: number;
}

export function ConfettiEffect({ isTriggered, onComplete }: ConfettiEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (isTriggered && !isActive) {
      setIsActive(true);
      createParticles();
      
      // Auto-cleanup après 4 secondes
      const timer = setTimeout(() => {
        setIsActive(false);
        setParticles([]);
        onComplete?.();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [isTriggered, isActive, onComplete]);

  const createParticles = () => {
    const newParticles: Particle[] = [];
    const particleCount = 50;
    
    const colors = [
      '#00f5ff', // cyan futuriste
      '#ff00ff', // magenta 
      '#00ff88', // vert néon
      '#ffff00', // jaune électrique
      '#ff4444', // rouge vif
      '#8844ff', // violet
      '#ffffff', // blanc pur
    ];
    
    const types: Array<'star' | 'sparkle' | 'crystal'> = ['star', 'sparkle', 'crystal'];

    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: Math.random(),
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight * 0.3, // Concentré en haut
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        scale: Math.random() * 0.8 + 0.4,
        type: types[Math.floor(Math.random() * types.length)],
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        maxLife: 3000 + Math.random() * 2000, // 3-5 secondes
      });
    }
    
    setParticles(newParticles);
  };

  useEffect(() => {
    if (!isActive || particles.length === 0) return;

    const animationFrame = requestAnimationFrame(function animate() {
      setParticles(prevParticles => {
        return prevParticles
          .map(particle => ({
            ...particle,
            x: particle.x + particle.vx,
            y: particle.y + particle.vy,
            rotation: particle.rotation + particle.rotationSpeed,
            vy: particle.vy + 0.15, // gravité
            life: particle.life - 16 / particle.maxLife, // diminue avec le temps
          }))
          .filter(particle => 
            particle.life > 0 && 
            particle.y < window.innerHeight + 100 &&
            particle.x > -100 && 
            particle.x < window.innerWidth + 100
          );
      });

      if (isActive) {
        requestAnimationFrame(animate);
      }
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [isActive, particles.length]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map(particle => {
        const opacity = Math.max(0, particle.life);
        
        return (
          <div
            key={particle.id}
            className={`absolute confetti-particle confetti-${particle.type}`}
            style={{
              left: particle.x,
              top: particle.y,
              transform: `rotate(${particle.rotation}deg) scale(${particle.scale})`,
              opacity: opacity,
              color: particle.color,
              textShadow: `0 0 10px ${particle.color}, 0 0 20px ${particle.color}, 0 0 30px ${particle.color}`,
              filter: `brightness(${1 + opacity * 0.5})`,
            }}
          >
            {particle.type === 'star' && '✦'}
            {particle.type === 'sparkle' && '✨'}
            {particle.type === 'crystal' && '◆'}
          </div>
        );
      })}
      
      {/* Effet d'éclair de fond */}
      <div className="confetti-flash" />
    </div>
  );
}