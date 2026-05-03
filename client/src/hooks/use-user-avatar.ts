import { useState } from "react";

interface UserAvatarState {
  name: string;
  gender: 'male' | 'female';
  avatarUrl: string;
}

const STORAGE_KEY = 'dilemme-plastique-avatar';
const AVATAR_COUNT = 18;

const hashToIndex = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_COUNT;
};

const generateGridAvatarUrl = (name: string, gender: 'male' | 'female'): string => {
  const genderPath = gender === 'male' ? 'boy' : 'girl';
  const index = hashToIndex(name) + 1;
  return `https://avatar.iran.liara.run/public/${genderPath}/${index}`;
};

const isGridUrl = (url: string): boolean =>
  /avatar\.iran\.liara\.run\/public\/(boy|girl)\/\d+$/.test(url);

const isUploadedAvatarUrl = (url: string): boolean =>
  url.startsWith('data:image/');

const migrateAvatarUrl = (state: UserAvatarState): UserAvatarState => {
  if (isGridUrl(state.avatarUrl) || isUploadedAvatarUrl(state.avatarUrl)) return state;
  return { ...state, avatarUrl: generateGridAvatarUrl(state.name, state.gender) };
};

const generateRandomName = () => {
  const names = [
    'Alex', 'Jordan', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Sage', 
    'River', 'Rowan', 'Phoenix', 'Luna', 'Nova', 'Aria', 'Leo', 'Maya', 
    'Noah', 'Emma', 'Liam', 'Sophia', 'Ethan', 'Isabella', 'Mason', 'Mia'
  ];
  return names[Math.floor(Math.random() * names.length)];
};

const getDefaultAvatar = (): UserAvatarState => {
  const randomName = generateRandomName();
  const randomGender = Math.random() > 0.5 ? 'male' : 'female';
  return {
    name: randomName,
    gender: randomGender,
    avatarUrl: generateGridAvatarUrl(randomName, randomGender),
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
            const migrated = migrateAvatarUrl(parsed);
            if (migrated.avatarUrl !== parsed.avatarUrl) {
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
              } catch (error) {
                console.warn('Failed to persist migrated avatar:', error);
              }
            }
            return migrated;
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