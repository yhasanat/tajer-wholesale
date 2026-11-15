type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome:'accepted'|'dismissed'}>;
};

let promptEvent:InstallPrompt|undefined;
let installed=false;
const displayMode=window.matchMedia('(display-mode: standalone)');
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  promptEvent=event as InstallPrompt;
  notify();
});
window.addEventListener('appinstalled',()=>{
  installed=true;
  promptEvent=undefined;
  notify();
});
if(displayMode.addEventListener) displayMode.addEventListener('change',notify);
else displayMode.addListener(notify);

export function subscribeInstall(listener:()=>void) {
  listeners.add(listener);
  return ()=>{listeners.delete(listener);};
}

export function showInstallButton() {
  return !installed&&!displayMode.matches&&!(navigator as Navigator&{standalone?:boolean}).standalone;
}

export async function installTajer() {
  const event=promptEvent;
  if(!event) return false;
  promptEvent=undefined;
  try {
    await event.prompt();
    await event.userChoice;
    return true;
  } catch {
    return false;
  }
}

export function installationInstructions() {
  const agent=navigator.userAgent;
  if(/iPad|iPhone|iPod/.test(agent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)) {
    return 'افتح الرابط في Safari. اضغط مشاركة، ثم «إضافة إلى الشاشة الرئيسية». فعّل «فتح كتطبيق ويب» إذا ظهر الخيار، ثم اضغط «إضافة».';
  }
  if(/Android/i.test(agent)) {
    return 'افتح الرابط في Chrome. من قائمة ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».';
  }
  if(/Safari/.test(agent)&&!/Chrome|Chromium|Edg/.test(agent)) {
    return 'من قائمة «ملف» في Safari على Mac اختر «إضافة إلى Dock» إذا كان الخيار متاحًا.';
  }
  return 'افتح الرابط في Chrome أو Edge. اضغط رمز التثبيت قرب شريط العنوان، أو ابحث عن «تثبيت تاجر» في قائمة المتصفح.';
}
