// Remove a legacy fact-record label, never the underlying contact or experience text.
export function resumeText(value: string) {
  return value.replace(/^[\t ]*事实[\t ]*[:：][\t ]*/gm, '').trim()
}
