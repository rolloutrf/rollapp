export async function tonCardRequest(action, body, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`/api/contact-cards/ton/${action}`, { method: "POST", credentials: "include", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error || "Не удалось выполнить действие с визиткой");
  return value;
}

export function downloadContactFile(file) {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
  const link = document.createElement("a"); link.href = url; link.download = file.filename;
  document.body.append(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
