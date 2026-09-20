export async function miniGet<T>(path: string, initData: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `tma ${initData}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function miniGetBlob(path: string, initData: string): Promise<Blob> {
  const response = await fetch(path, {
    headers: { Authorization: `tma ${initData}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return response.blob();
}
