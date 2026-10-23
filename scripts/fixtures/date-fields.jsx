import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { CourseDrawer } from "@/components/courses.jsx?drawer-smoke-export=CourseDrawer";
import { ConferenceDrawer } from "@/components/conferences.jsx?drawer-smoke-export=ConferenceDrawer";
import { CoachingSessionDrawer } from "@/components/coaching-sessions.jsx?drawer-smoke-export=CoachingSessionDrawer";
import { MedicationDrawer } from "@/components/medications.jsx?drawer-smoke-export=MedicationDrawer";
import { WorkoutDrawer } from "@/components/workouts.jsx?drawer-smoke-export=WorkoutDrawer";
import { ProfileSettingsModal, WishModal, SessionContext, ToastContext } from "@/App.jsx?date-fields-export";
import "../../src/styles.css";
import "../../src/index.css";

const user = { id: 'unsaved-user', name: 'Профиль', username: 'fixture', birthday: '2026-10-16' };
function Fixture() {
  useVisualViewport();
  const [open,setOpen]=useState(true);
  if(!open)return null;
  const props={open,onOpenChange:setOpen,onClose:()=>setOpen(false)};
  const form=new URLSearchParams(location.search).get('form');
  const forms={course:<CourseDrawer {...props}/>,conference:<ConferenceDrawer {...props}/>,coaching:<CoachingSessionDrawer {...props}/>,medication:<MedicationDrawer {...props} groups={[]}/>,workout:<WorkoutDrawer {...props}/>,birthday:<ProfileSettingsModal {...props} user={user}/>,event:<WishModal {...props} space="events"/>};
  return forms[form];
}
createRoot(document.getElementById('root')).render(<BrowserRouter><SessionContext.Provider value={{user,setSession:()=>{}}}><ToastContext.Provider value={()=>{}}><MobileFormPages><Fixture/></MobileFormPages></ToastContext.Provider></SessionContext.Provider></BrowserRouter>);
