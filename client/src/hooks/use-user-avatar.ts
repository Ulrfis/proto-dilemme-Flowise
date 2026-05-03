import { useState } from "react";

interface UserAvatarState {
  name: string;
  gender: 'male' | 'female';
  avatarUrl: string;
}

const STORAGE_KEY = 'dilemme-plastique-avatar';

const generateRandomName = () => {
  const names = [
    'Alex', 'Jordan', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Sage', 
    'River', 'Rowan', 'Phoenix', 'Luna', 'Nova', 'Aria', 'Leo', 'Maya', 
    'Noah', 'Emma', 'Liam', 'Sophia', 'Ethan', 'Isabella', 'Mason', 'Mia'
  ];
  return names[Math.floor(Math.random() * names.length)];
};

const generateAvatarUrl = (name: string, gender: 'male' | 'female') => {
  const genderPath = gender === 'male' ? 'boy' : 'girl';
  return `https://avatar.iran.liara.run/public/${genderPath}?username=${encodeURIComponent(name.trim())}`;
};

const getDefaultAvatar = (): UserAvatarState => {
  const randomName = generateRandomName();
  const randomGender = Math.random() > 0.5 ? 'male' : 'female';
  return {
    name: randomName,
    gender: randomGender,
    avatarUrl: generateAvatarUrl(randomName, randomGender),
  };
};

export function useUserAvatar() {
  const [userAvatar, setUserAvatar] = useState<UserAvatarState>(() => {
    // Try to load from localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as UserAvatarState;
          // Validate the stored data
          if (parsed.name && parsed.gender && parsed.avatarUrl) {
            return parsed;
          }
        }
      } catch (error) {
        console.warn('Failed to load stored avatar:', error);
      }
    }
    
    // Return default random avatar
    return getDefaultAvatar();
  });

  const updateAvatar = (name: string, gender: 'male' | 'female', avatarUrl: string) => {
    const newState = { name, gender, avatarUrl };
    setUserAvatar(newState);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      } catch (error) {
        console.warn('Failed to save avatar to storage:', error);
      }
    }
  };


  return {
    ...userAvatar,
    updateAvatar,
  };
}