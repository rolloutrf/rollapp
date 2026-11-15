import { useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingScreen } from "./page-feedback.jsx";

export function ScreenNavigation({ to }) {
  const navigate = useNavigate();
  const navigated = useRef(false);
  useLayoutEffect(() => {
    if (navigated.current) return;
    navigated.current = true;
    navigate(to);
  }, [navigate, to]);
  return <LoadingScreen />;
}
