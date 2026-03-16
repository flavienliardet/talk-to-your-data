import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { ResponseLevel } from '@chat-template/core';
import { useSession } from './SessionContext';

const LOCAL_STORAGE_KEY = 'custom_instructions';
const RESPONSE_LEVEL_STORAGE_KEY = 'response_level';

const VALID_RESPONSE_LEVELS: ResponseLevel[] = [
  'exploratoire',
  'statistique',
];

function isValidResponseLevel(v: string): v is ResponseLevel {
  return VALID_RESPONSE_LEVELS.includes(v as ResponseLevel);
}

interface CustomInstructionsContextType {
  customInstructions: string;
  setCustomInstructions: (value: string) => void;
  responseLevel: ResponseLevel;
  setResponseLevel: (value: ResponseLevel) => void;
  saveInstructions: () => Promise<void>;
  saveResponseLevel: () => Promise<void>;
  savingInstructions: boolean;
  savingResponseLevel: boolean;
  loaded: boolean;
}

const CustomInstructionsContext = createContext<
  CustomInstructionsContextType | undefined
>(undefined);

function getLocalStorageKey(userId?: string) {
  return userId ? `${LOCAL_STORAGE_KEY}_${userId}` : LOCAL_STORAGE_KEY;
}

function getResponseLevelStorageKey(userId?: string) {
  return userId ? `${RESPONSE_LEVEL_STORAGE_KEY}_${userId}` : RESPONSE_LEVEL_STORAGE_KEY;
}

export function CustomInstructionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { session } = useSession();
  const userId = session?.user?.email;

  const [customInstructions, setCustomInstructions] = useState('');
  const [responseLevel, setResponseLevel] = useState<ResponseLevel>('exploratoire');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [savingResponseLevel, setSavingResponseLevel] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const lsKey = getLocalStorageKey(userId);
    const rlKey = getResponseLevelStorageKey(userId);
    const cached = localStorage.getItem(lsKey);
    if (cached !== null) {
      setCustomInstructions(cached);
    }
    const cachedRl = localStorage.getItem(rlKey);
    if (cachedRl !== null && isValidResponseLevel(cachedRl)) {
      setResponseLevel(cachedRl);
    }

    fetch('/api/custom-instructions', { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data) {
          if (typeof data.customInstructions === 'string') {
            setCustomInstructions(data.customInstructions);
            localStorage.setItem(lsKey, data.customInstructions);
          }
          if (
            data.responseLevel &&
            isValidResponseLevel(data.responseLevel)
          ) {
            setResponseLevel(data.responseLevel);
            localStorage.setItem(
              getResponseLevelStorageKey(userId),
              data.responseLevel,
            );
          }
        }
      })
      .catch(() => {
        // API not available — keep localStorage value
      })
      .finally(() => setLoaded(true));
  }, [userId]);

  const saveInstructions = useCallback(async () => {
    setSavingInstructions(true);
    const lsKey = getLocalStorageKey(userId);
    localStorage.setItem(lsKey, customInstructions);
    try {
      await fetch('/api/custom-instructions', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customInstructions }),
      });
    } catch {
      // Saved in localStorage at least
    } finally {
      setSavingInstructions(false);
    }
  }, [customInstructions, userId]);

  const saveResponseLevel = useCallback(async () => {
    setSavingResponseLevel(true);
    const rlKey = getResponseLevelStorageKey(userId);
    localStorage.setItem(rlKey, responseLevel);
    try {
      await fetch('/api/custom-instructions', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseLevel }),
      });
    } catch {
      // Saved in localStorage at least
    } finally {
      setSavingResponseLevel(false);
    }
  }, [responseLevel, userId]);

  return (
    <CustomInstructionsContext.Provider
      value={{
        customInstructions,
        setCustomInstructions,
        responseLevel,
        setResponseLevel,
        saveInstructions,
        saveResponseLevel,
        savingInstructions,
        savingResponseLevel,
        loaded,
      }}
    >
      {children}
    </CustomInstructionsContext.Provider>
  );
}

export function useCustomInstructions() {
  const context = useContext(CustomInstructionsContext);
  if (context === undefined) {
    throw new Error(
      'useCustomInstructions must be used within a CustomInstructionsProvider',
    );
  }
  return context;
}
