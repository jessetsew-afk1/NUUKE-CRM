/**
 * The kits are written in Isaiah's voice. When someone else sends one it opens with
 * their own name instead ("Ashley here, from Isaiah's team."), so nobody texts as Isaiah.
 * Kept free of app imports so the Netlify reply assistant can use it too.
 */
export function signedMessage(message: string, sender: string | null | undefined) {
  const first = (sender ?? '').trim().split(/\s+/)[0];
  if (!first || /^isaiah$/i.test(first)) return message;
  return message
    .replace(/\bIsaiah here\./, `${first} here, from Isaiah's team.`)
    .replace(/\bSoy Isaiah\./, `Soy ${first}, del equipo de Isaiah.`)
    // Follow-ups word it more loosely: "Isaiah here again", "Isaiah again", "it's Isaiah",
    // and a "- Isaiah" sign-off on its own line or at the end of one.
    .replace(/\bIsaiah (here|again)\b/g, `${first} $1`)
    .replace(/\b(it's|it is|this is|soy) Isaiah\b/gi, `$1 ${first}`)
    .replace(/(^|\s)([-–—~]\s*)Isaiah\s*$/gm, `$1$2${first}`);
}
