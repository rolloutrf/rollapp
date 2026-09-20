import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
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
