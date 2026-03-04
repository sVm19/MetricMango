import { useMemo } from 'react';

export function useEmbedded() {
    const isEmbedded = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return new URLSearchParams(window.location.search).has("host");
    }, []);

    return { isEmbedded };
}
