// ANSI styling, enabled only for interactive terminals so piped/captured
// output (agents, scripts) stays plain text. Honors NO_COLOR and FORCE_COLOR.
const enabled =
  !process.env.NO_COLOR &&
  (process.stdout.isTTY === true || process.env.FORCE_COLOR !== undefined);

function style(open: number, close: number): (s: string) => string {
  return (s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);
}

export const bold = style(1, 22);
export const dim = style(2, 22);
export const cyan = style(36, 39);
export const yellow = style(33, 39);
export const green = style(32, 39);
export const red = style(31, 39);
