/** "feat(referrals): invite page" reads as a muted "referrals" and the subject. */
export function splitTitle(title: string): { scope: string | null; subject: string } {
  const match = title.match(/^\w+(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (!match) return { scope: null, subject: title };
  return { scope: match[1] ?? null, subject: match[2] };
}

export function PrTitle({ title }: { title: string }) {
  const { scope, subject } = splitTitle(title);
  return (
    <>
      {scope && <span className="font-medium text-ink-3">{scope} </span>}
      {subject}
    </>
  );
}
