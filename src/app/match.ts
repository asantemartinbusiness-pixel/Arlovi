export interface RouteScreen {
  id: string;
  title: string;
  route: string;
}

export function specificity(route: string): number {
  return route.split("/").filter((part) => part && !part.startsWith(":")).length * 10 + route.length;
}

export function matchPath(pathname: string, screens: RouteScreen[]): { screen: RouteScreen; params: Record<string, string> } | null {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const ordered = [...screens].sort((a, b) => specificity(b.route) - specificity(a.route));
  for (const screen of ordered) {
    const routeParts = screen.route.split("/").filter(Boolean);
    if (routeParts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let index = 0; index < routeParts.length; index += 1) {
      const token = routeParts[index];
      if (token.startsWith(":")) params[token.slice(1)] = decodeURIComponent(parts[index]);
      else if (token !== parts[index]) {
        ok = false;
        break;
      }
    }
    if (ok) return { screen, params };
  }
  return null;
}
