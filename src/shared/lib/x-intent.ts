/** The X "post" intent with the text and the link. Nothing is posted until the person posts it on X. */
export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url })}`;
}
