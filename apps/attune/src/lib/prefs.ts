/** Shared by the server layout (boot script) and the client settings provider. */
export const PREFS_KEY = "attune:prefs";

/** Runs inline in <head> before paint; keep it tiny and dependency-free. */
export const BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"{}");var d=document.documentElement;if(p.theme==="light"||p.theme==="dark")d.dataset.theme=p.theme;if(p.motion==="reduce"||p.motion==="full")d.dataset.motion=p.motion;}catch(e){}})();`;
