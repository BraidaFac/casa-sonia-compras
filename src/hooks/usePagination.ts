import { useState, useCallback } from "react";

export interface UsePaginationReturn {
  offset: number;
  limit: number;
  goNext: () => void;
  goPrev: () => void;
  reset: () => void;
}

export function usePagination(pageSize = 30): UsePaginationReturn {
  const [offset, setOffset] = useState(0);

  const goNext = useCallback(() => {
    setOffset((o) => o + pageSize);
  }, [pageSize]);

  const goPrev = useCallback(() => {
    setOffset((o) => Math.max(0, o - pageSize));
  }, [pageSize]);

  const reset = useCallback(() => {
    setOffset(0);
  }, []);

  return {
    offset,
    limit: pageSize,
    goNext,
    goPrev,
    reset,
  };
}
