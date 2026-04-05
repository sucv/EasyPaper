export function truncate(s: string, maxLen: number = 100): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

export function sanitizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100) || 'untitled';
}