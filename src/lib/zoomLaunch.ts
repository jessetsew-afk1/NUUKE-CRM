/**
 * The Zoom buttons are zoomphonecall:// and zoomphonesms:// links. When the Zoom app
 * isn't installed, running or signed in, or Chrome was told not to open it, the browser
 * silently does nothing. This watches for Zoom taking focus after a click; if it doesn't,
 * the rep is told so (and gets the number copied) instead of a button that seems dead.
 */
import { useToast } from '@/ui/toast';
import { copyText } from '@/lib/clipboard';

/** How long to wait for Zoom to take over the window before saying it didn't open. */
const WAIT_MS = 3500;

/** Calls onFail if the window keeps focus for WAIT_MS after a Zoom link is clicked. */
export function watchZoomOpen(onFail: () => void, wait = WAIT_MS) {
  let opened = false;
  const mark = () => { opened = true; };
  const onVisibility = () => { if (document.visibilityState === 'hidden') opened = true; };
  window.addEventListener('blur', mark);
  document.addEventListener('visibilitychange', onVisibility);
  window.setTimeout(() => {
    window.removeEventListener('blur', mark);
    document.removeEventListener('visibilitychange', onVisibility);
    if (!opened && document.hasFocus()) onFail();
  }, wait);
}

const FIX = 'Open the Zoom app and check you are signed in to Zoom Phone, then try again. '
  + 'If Chrome asked to open Zoom, click Open (tick "Always allow").';

/** onClick for a Zoom call or text link: warns, and copies the number, if Zoom doesn't open. */
export function useZoomLink() {
  const toast = useToast();
  return (kind: 'call' | 'text', number: string) => watchZoomOpen(() => {
    if (kind === 'call') void copyText(number);
    toast({
      title: "Zoom didn't open",
      body: kind === 'call'
        ? `The number ${number} is copied, so you can paste it into Zoom. ${FIX}`
        : `Your message is copied. Start a text to ${number} in Zoom and paste it. ${FIX}`,
      tone: 'danger',
      duration: 12000,
    });
  });
}
