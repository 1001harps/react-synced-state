import { useRef } from "react";

export const useInstance = <T>(factory: () => T): T => {
  const instance = useRef<T | null>(null);

  if (!instance.current) {
    instance.current = factory();
  }

  return instance.current;
};
