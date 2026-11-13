/**
 * Splits a conventional-commit subject into its type prefix (`feat:`, `fix(ui)!:`) and the rest, so the history view
 * can show the prefix muted. Subjects without a prefix come back whole as the message.
 */
export function splitSubject(subject: string): { type: string | null; message: string } {
  const match = /^([a-z]+(?:\([^()\s]*\))?!?:)\s+(\S.*)$/i.exec(subject);
  if (!match) return { type: null, message: subject };
  return { type: match[1], message: match[2] };
}
