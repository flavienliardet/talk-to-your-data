import { useState, useCallback } from 'react';

export interface Memory {
  key: string;
  value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useUserMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/memories', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch memories');
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteMemory = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/memories/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete memory');
      setMemories((prev) => prev.filter((m) => m.key !== key));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  const deleteAll = useCallback(async () => {
    try {
      const res = await fetch('/api/memories', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete all memories');
      setMemories([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  return { memories, loading, error, fetchMemories, deleteMemory, deleteAll };
}
