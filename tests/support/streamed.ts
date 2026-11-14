// Screens with a loading outline (loading.tsx) stream: the server answers 200 with the
// outline first, so a redirect or not-found decided afterwards travels inside the page
// (Next.js's NEXT_REDIRECT / NEXT_HTTP_ERROR_FALLBACK markers) and the browser acts on it.
// These helpers accept either form, so the tests assert what she sees, not the transport.
export async function redirectsTo(res: Response, path: string): Promise<boolean> {
  if (res.status >= 300 && res.status < 400) return new RegExp(`${path}$`).test(res.headers.get("location") ?? "");
  const body = await res.text();
  return res.status === 200 && new RegExp(`NEXT_REDIRECT;\\w+;${path.replace(/\//g, "\\/")};`).test(body);
}

export async function isNotFound(res: Response): Promise<boolean> {
  if (res.status === 404) return true;
  return res.status === 200 && (await res.text()).includes("NEXT_HTTP_ERROR_FALLBACK;404");
}
