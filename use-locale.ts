import { useEffect, useState } from "react";
import { resolveLocale } from "./messages";

export function useLocale() {
  const [locale, setLocale] = useState(() => resolveLocale(navigator.language));
  useEffect(() => {
    const update = () => setLocale(resolveLocale(navigator.language));
    window.addEventListener("languagechange", update);
    return () => window.removeEventListener("languagechange", update);
  }, []);
  return locale;
}
