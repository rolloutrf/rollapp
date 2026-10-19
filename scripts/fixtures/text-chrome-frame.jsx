import { GlobalAppChrome, SessionContext, ToastContext, CollectionNavigationContext } from '@/App.jsx?text-chrome';
// Real application chrome, supplied presentation context; API requests remain forbidden.
export default function TextChromeFrame({children}){
 const user={canDiscoverSpheres:true,accountType:'personal'};
 return <SessionContext.Provider value={{user}}><ToastContext.Provider value={()=>{}}><CollectionNavigationContext.Provider value={{collection:null}}>
  <GlobalAppChrome/>
  <div className="app-layout app-layout--dark"><main className="app-main"><div className="app-shell-chrome-spacer"/><section className="app-page">{children}</section></main></div>
 </CollectionNavigationContext.Provider></ToastContext.Provider></SessionContext.Provider>;
}
