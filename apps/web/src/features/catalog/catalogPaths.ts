/** Keep links in the public, workspace, or legacy catalog that is currently open. */
export function catalogHomePath(pathname: string) {
  const match = pathname.match(/^(.*\/catalog)(?:\/|$)/);
  return match?.[1] ?? "/app/catalog";
}
