import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { User, Shuffle } from "lucide-react";

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
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState(currentAvatarUrl);
  const [isOpen, setIsOpen] = useState(false);

  const generateAvatarUrl = (name: string, gender: 'male' | 'female') => {
    if (!name.trim()) return '';
    const genderPath = gender === 'male' ? 'boy' : 'girl';
    return `https://avatar.iran.liara.run/public/${genderPath}?username=${encodeURIComponent(name.trim())}`;
  };

  const generateRandomName = () => {
    const names = [
      'Alex', 'Jordan', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Sage', 
      'River', 'Rowan', 'Phoenix', 'Sage', 'Sky', 'Ocean', 'Luna', 'Nova',
      'Aria', 'Leo', 'Maya', 'Noah', 'Emma', 'Liam', 'Sophia', 'Ethan',
      'Isabella', 'Mason', 'Mia', 'Lucas', 'Charlotte', 'Oliver'
    ];
    return names[Math.floor(Math.random() * names.length)];
  };

  const handleRandomAvatar = () => {
    const randomName = generateRandomName();
    const randomGender = Math.random() > 0.5 ? 'male' : 'female';
    setTempName(randomName);
    setTempGender(randomGender);
    setPreviewAvatarUrl(generateAvatarUrl(randomName, randomGender));
  };

  const handleNameChange = (name: string) => {
    setTempName(name);
    if (name.trim()) {
      setPreviewAvatarUrl(generateAvatarUrl(name, tempGender));
    }
  };

  const handleGenderChange = (gender: 'male' | 'female') => {
    setTempGender(gender);
    if (tempName.trim()) {
      setPreviewAvatarUrl(generateAvatarUrl(tempName, gender));
    }
  };

  const handleSave = () => {
    if (tempName.trim()) {
      const finalAvatarUrl = generateAvatarUrl(tempName, tempGender);
      onAvatarChange(tempName.trim(), tempGender, finalAvatarUrl);
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    setTempName(currentName);
    setTempGender(currentGender);
    setPreviewAvatarUrl(currentAvatarUrl);
    setIsOpen(false);
  };

  // Initialize preview when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTempName(currentName);
      setTempGender(currentGender);
      setPreviewAvatarUrl(currentAvatarUrl);
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

        <div className="space-y-6">
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
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Entrez votre nom..."
              data-testid="input-avatar-name"
            />
          </div>

          {/* Gender Selection */}
          <div className="space-y-3">
            <Label>Style d'avatar</Label>
            <RadioGroup 
              value={tempGender} 
              onValueChange={handleGenderChange}
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