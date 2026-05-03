import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Shuffle } from "lucide-react";

const AVATAR_COUNT = 18;

const getAvatarGrid = (gender: 'male' | 'female'): string[] => {
  const genderPath = gender === 'male' ? 'boy' : 'girl';
  return Array.from({ length: AVATAR_COUNT }, (_, i) =>
    `https://avatar.iran.liara.run/public/${genderPath}/${i + 1}`
  );
};

const parseGridUrl = (url: string): { gender: 'male' | 'female'; index: number } | null => {
  const match = url.match(/avatar\.iran\.liara\.run\/public\/(boy|girl)\/(\d+)$/);
  if (!match) return null;
  return {
    gender: match[1] === 'boy' ? 'male' : 'female',
    index: parseInt(match[2], 10) - 1,
  };
};

interface AvatarSelectorProps {
  currentName: string;
  currentGender: 'male' | 'female';
  currentAvatarUrl: string;
  onAvatarChange: (name: string, gender: 'male' | 'female', avatarUrl: string) => void;
}

export function AvatarSelector({ 
  currentName, 
  currentGender, 
  currentAvatarUrl, 
  onAvatarChange 
}: AvatarSelectorProps) {
  const [tempName, setTempName] = useState(currentName);
  const [tempGender, setTempGender] = useState<'male' | 'female'>(currentGender);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState(currentAvatarUrl);
  const [isOpen, setIsOpen] = useState(false);

  const avatarGrid = getAvatarGrid(tempGender);

  const handleThumbnailClick = (url: string, index: number) => {
    setSelectedIndex(index);
    setPreviewAvatarUrl(url);
  };

  const handleRandomAvatar = () => {
    const randomIndex = Math.floor(Math.random() * AVATAR_COUNT);
    const url = avatarGrid[randomIndex];
    setSelectedIndex(randomIndex);
    setPreviewAvatarUrl(url);
  };

  const handleGenderChange = (gender: 'male' | 'female') => {
    setTempGender(gender);
    const newGrid = getAvatarGrid(gender);
    const targetIndex = selectedIndex ?? 0;
    setSelectedIndex(targetIndex);
    setPreviewAvatarUrl(newGrid[targetIndex]);
  };

  const handleSave = () => {
    if (tempName.trim()) {
      onAvatarChange(tempName.trim(), tempGender, previewAvatarUrl);
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    setTempName(currentName);
    setTempGender(currentGender);
    setPreviewAvatarUrl(currentAvatarUrl);
    setIsOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      setTempName(currentName);
      setTempGender(currentGender);
      setPreviewAvatarUrl(currentAvatarUrl);
      const parsed = parseGridUrl(currentAvatarUrl);
      if (parsed && parsed.gender === currentGender) {
        setSelectedIndex(parsed.index);
      } else {
        setSelectedIndex(null);
      }
    }
  }, [isOpen, currentName, currentGender, currentAvatarUrl]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="p-0 h-8 w-8"
          data-testid="button-avatar-selector"
        >
          <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity">
            <AvatarImage src={currentAvatarUrl} alt={currentName} />
            <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-semibold">
              {currentName.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Personnaliser votre avatar</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Preview */}
          <div className="flex justify-center">
            <Avatar className="w-20 h-20">
              <AvatarImage src={previewAvatarUrl} alt={tempName} />
              <AvatarFallback className="bg-gray-200 text-gray-700 text-lg font-semibold">
                {tempName.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name">Votre nom</Label>
            <Input
              id="name"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Entrez votre nom..."
              data-testid="input-avatar-name"
            />
          </div>

          {/* Gender Selection */}
          <div className="space-y-3">
            <Label>Style d'avatar</Label>
            <RadioGroup 
              value={tempGender} 
              onValueChange={(v) => handleGenderChange(v as 'male' | 'female')}
              className="flex flex-row space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="male" />
                <Label htmlFor="male">Masculin</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" />
                <Label htmlFor="female">Féminin</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Avatar Grid */}
          <div className="space-y-2">
            <Label>Choisissez un avatar</Label>
            <div className="h-48 overflow-y-auto rounded-md border border-border p-2">
              <div className="grid grid-cols-6 gap-2">
                {avatarGrid.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => handleThumbnailClick(url, index)}
                    className={`rounded-full focus:outline-none transition-all ${
                      selectedIndex === index
                        ? 'ring-2 ring-offset-2 ring-primary'
                        : 'hover:ring-2 hover:ring-offset-2 hover:ring-muted-foreground/40'
                    }`}
                    aria-label={`Avatar ${index + 1}`}
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={url} alt={`Avatar ${index + 1}`} />
                      <AvatarFallback className="bg-gray-200 text-gray-500 text-xs">
                        {index + 1}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Random Button */}
          <Button 
            variant="outline" 
            onClick={handleRandomAvatar}
            className="w-full bg-accent border-accent text-accent-foreground hover:bg-accent/80"
            data-testid="button-random-avatar"
          >
            <Shuffle className="w-4 h-4 mr-2" />
            Avatar aléatoire
          </Button>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              className="bg-accent border-accent text-accent-foreground hover:bg-accent/80"
            >
              Annuler
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!tempName.trim()}
              data-testid="button-save-avatar"
              className="bg-accent hover:bg-accent/80 text-accent-foreground"
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
