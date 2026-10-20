import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches)

  React.useEffect(() => {
    // Use the same viewport decision as CSS, including when innerWidth differs
    // from the media viewport during browser zoom or overflowing layout.
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange);
  }, [])

  return !!isMobile
}

// A phone in landscape can be wider than the layout breakpoint. Its software
// keyboard must still open only after an intentional tap on a field.
export function canAutofocusForm() {
  return typeof window !== "undefined"
    && window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px) and (hover: hover) and (pointer: fine)`).matches
}
