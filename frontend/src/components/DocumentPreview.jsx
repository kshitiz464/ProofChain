import { useState } from "react";

export default function DocumentPreview({ doc }) {
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const cid = encodeURIComponent(doc.cid);
  const filename = doc.filename || doc.cid;
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  const query = new URLSearchParams({ filename, download: "true" });
  const download = `https://ipfs.io/ipfs/${cid}?${query}`;
  const previewUrl = `${url}?${new URLSearchParams({ filename })}`;
  const previewable = /^(image\/(png|jpeg|gif|webp)$|application\/pdf$|text\/)/.test(doc.mimeType || "");
  return <div className="document-actions">
    <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
      <button className="btn btn-ghost" aria-expanded={preview} onClick={() => { setPreview(!preview); setError(""); }} disabled={!previewable}>{preview ? "Close preview" : "Preview file"}</button>
      <a className="btn btn-ghost" href={download} target="_blank" rel="noopener noreferrer">Download from IPFS</a>
      <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer">Open on IPFS ↗</a>
    </div>
    {!previewable && <p className="text-xs">Preview is available for PDF, images and text. Download other file types to view them.</p>}
    {error && <p role="alert" className="text-sm" style={{ color: "var(--error)" }}>{error}</p>}
    {preview && <div className="document-preview">
      {doc.mimeType?.startsWith("image/") ? <img src={previewUrl} alt={filename} referrerPolicy="no-referrer" onError={() => setError("Preview unavailable. Try Open on IPFS.")} /> :
        <iframe title={`Preview of ${filename}`} src={previewUrl} sandbox="" referrerPolicy="no-referrer" />}
      <p className="text-xs">Preview loads from IPFS. If the gateway is unavailable, try Open on IPFS.</p>
    </div>}
  </div>;
}

