export async function readApi(response) {
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`The API returned an empty or invalid response (HTTP ${response.status}). Check that the backend is running.`); }
  if (!response.ok || data.success === false) {
    const details = data.details?.txHash ? ` Transaction: ${data.details.txHash}. CID: ${data.details.cid}.` : "";
    throw new Error((data.error || `Request failed (HTTP ${response.status}).`) + details);
  }
  return data;
}
export function checkFile(file, maxFileBytes) {
  if (!file || file.size === 0) throw new Error("Choose a non-empty document.");
  if (file.size > maxFileBytes) throw new Error(`File exceeds the ${maxFileBytes / 1024 / 1024} MB upload limit.`);
  if (file.name.length > 255) throw new Error("Filename must be at most 255 characters.");
}
