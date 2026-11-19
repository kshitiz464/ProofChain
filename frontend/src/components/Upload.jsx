import { useRef, useState } from "react";
import { formatBytes, formatTimestamp } from "../utils/contract";
import { checkFile, readApi } from "../utils/api";
import DocumentPreview from "./DocumentPreview";

export default function Upload({ serviceConfig }) {
  const [file, setFile] = useState(null), [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("idle"), [result, setResult] = useState(null);
  const [error, setError] = useState(""), [warning, setWarning] = useState("");
  const inputRef = useRef(null);
  const busy = status === "uploading";
  function selectFile(value) {
    if (busy || !value) return;
    setResult(null); setError(""); setWarning("");
    try { checkFile(value, serviceConfig.maxFileBytes); setFile(value); setStatus("idle"); }
    catch (err) { setFile(null); setStatus("error"); setError(err.message); }
  }
  function reset() {
    setFile(null); setResult(null); setError(""); setWarning(""); setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }
  async function handleUpload() {
    if (!file || busy) return;
    setStatus("uploading"); setError(""); setWarning("");
    try {
      checkFile(file, serviceConfig.maxFileBytes);
      const form = new FormData(); form.append("document", file);
      const json = await fetch("/api/upload", { method: "POST", body: form }).then(readApi);
      setResult(json.data); setWarning(json.warning || ""); setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof TypeError ? "Cannot reach the backend API. Check that ProofChain services are running." : err.message);
    }
  }
  return <div className="upload-content">
    <p className="text-sm">Uploads are anchored by the server's signer on <strong>{serviceConfig.networkName}</strong>. The connected MetaMask wallet is for display.</p>
    {status !== "success" && <div
      className={`upload-dropzone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
      onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files[0]); }}>
      <input ref={inputRef} id="file-input" aria-label="Choose document" type="file" disabled={busy} onChange={e => selectFile(e.target.files[0])} />
      {file ? <div className="file-preview">
        <span style={{ fontSize: "2rem" }}>📄</span>
        <div style={{ minWidth: 0, flex: 1 }}><strong className="truncate">{file.name}</strong><p className="text-sm">{formatBytes(file.size)} · {file.type || "Unknown file type"}</p></div>
        <button className="btn btn-ghost" disabled={busy} onClick={reset}>Remove</button>
      </div> : <div className="dropzone-content"><p>Drop a document here or choose a file above.</p><p className="text-sm">All file types · non-empty files up to {serviceConfig.maxFileBytes / 1024 / 1024} MB</p></div>}
    </div>}
    {busy && <div className="card" role="status" aria-live="polite">
      <div className="spinner" /><h3>Creating proof of existence…</h3>
      <p>Pinning to IPFS, waiting for blockchain confirmation and saving metadata. Public testnet confirmation can take several minutes.</p>
    </div>}
    {error && <div className="alert alert-error" role="alert"><strong>Upload could not complete</strong><p style={{ overflowWrap: "anywhere" }}>{error}</p></div>}
    {warning && <div className="alert" role="status">{warning}</div>}
    {result && <div className="card card-gradient">
      <h3 style={{ color: "var(--success)" }}>✓ Document anchored</h3>
      <p>Proof of existence confirmed on {serviceConfig.networkName}.</p>
      <dl className="result-grid">{[
        ["Filename", result.filename],["IPFS CID",result.cid],["Transaction",result.txHash],["Uploader",result.uploader],
        ["Block",result.blockNumber],["Anchored",formatTimestamp(result.anchoredAt)],["Gas used",result.gasUsed],["Transaction fee (wei)",result.feeWei],
      ].map(([label,value]) => <div className="result-row" key={label}><dt className="result-label">{label}</dt><dd className="result-value mono" style={{ overflowWrap: "anywhere", margin: 0 }}>{value}</dd></div>)}</dl>
      {result.explorerUrl && <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer">View transaction on Sepolia ↗</a>}
      <DocumentPreview doc={result} />
      <button className="btn btn-ghost" onClick={reset}>Upload another document</button>
    </div>}
    {status !== "success" && <button id="upload-btn" className="btn btn-primary w-full" onClick={handleUpload} disabled={!file || busy}>{busy ? "Waiting for confirmation…" : "Anchor document"}</button>}
    <p className="text-xs">IPFS files are publicly accessible. A matching CID proves existence of these bytes; it does not certify the document's truth or legal ownership.</p>
  </div>;
}

