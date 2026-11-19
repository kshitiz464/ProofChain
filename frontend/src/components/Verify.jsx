import { useState, useRef, useCallback } from "react";
import { formatTimestamp } from "../utils/contract";
import { checkFile, readApi } from "../utils/api";

const API = "/api";

export default function Verify({ serviceConfig }) {
  const [mode,     setMode]     = useState("file"); // "file" | "cid"
  const [file,     setFile]     = useState(null);
  const [cid,      setCid]      = useState("");
  const [dragging, setDragging] = useState(false);
  const [status,   setStatus]   = useState("idle"); // idle | verifying | verified | not-found | error
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState("");
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setCid("");
    setStatus("idle");
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── File drag-and-drop ─────────────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = ()  => setDragging(false);

  // ── Verify ─────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (mode === "file" && !file) return;
    if (mode === "cid"  && !cid.trim()) return;

    setStatus("verifying");
    setError("");
    setResult(null);

    try {
      let res;
      if (mode === "file") {
        checkFile(file, serviceConfig.maxFileBytes);
        const form = new FormData();
        form.append("document", file);
        res = await fetch(`${API}/verify`, { method: "POST", body: form });
      } else {
        res = await fetch(`${API}/verify`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ cid: cid.trim() }),
        });
      }

      const json = await readApi(res);

      setResult(json);
      setStatus(json.verified ? "verified" : "not-found");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong");
    }
  };

  const canVerify = (mode === "file" && !!file) || (mode === "cid" && !!cid.trim());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── Mode Selector ── */}
      <div className="flex gap-1" style={{ background: "rgba(255,255,255,0.05)", padding: "0.35rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
        {[
          { key: "file", label: "📄  Verify by File" },
          { key: "cid",  label: "🔑  Verify by CID" },
        ].map(m => (
          <button
            key={m.key}
            className="btn"
            id={`verify-mode-${m.key}`}
            style={{
              flex:       1,
              background: mode === m.key ? "var(--grad-primary)" : "transparent",
              color:      mode === m.key ? "#fff" : "var(--text-muted)",
              boxShadow:  mode === m.key ? "var(--shadow-btn)" : "none",
              border:     "none",
              fontSize:   "0.875rem",
            }}
            onClick={() => { setMode(m.key); reset(); }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── File Drop Zone ── */}
      {mode === "file" && (
        <div
          className={`upload-dropzone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !file && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            id="verify-file-input"
            style={{ display: "none" }}
            onChange={e => { setFile(e.target.files[0]); setStatus("idle"); setResult(null); }}
          />

          {!file ? (
            <div className="dropzone-content">
              <div className="dropzone-icon" style={{ fontSize: "2rem" }}>🔍</div>
              <p style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                Drop the same document here to verify
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                We'll re-compute the CID and check the blockchain
              </p>
            </div>
          ) : (
            <div className="file-preview">
              <span style={{ fontSize: "1.25rem" }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="truncate" style={{ fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{file.name}</p>
                <p className="text-sm" style={{ color: "var(--text-muted)", margin: 0 }}>{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                onClick={e => { e.stopPropagation(); reset(); }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CID Input ── */}
      {mode === "cid" && (
        <div>
          <label htmlFor="cid-input" style={{ display: "block", fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontWeight: 500 }}>
            IPFS Content Identifier (CID)
          </label>
          <input
            id="cid-input"
            className="input"
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
            placeholder="bafybeig... or Qm..."
            value={cid}
            onChange={e => { setCid(e.target.value); setStatus("idle"); setResult(null); }}
          />
        </div>
      )}

      {/* ── Verifying spinner ── */}
      {status === "verifying" && (
        <div className="card text-center fade-in" style={{ padding: "2rem" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem", width: 32, height: 32, borderWidth: 3 }} />
          <p style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
            Checking the blockchain for proof of existence…
          </p>
        </div>
      )}

      {/* ── VERIFIED ✓ ── */}
      {status === "verified" && result && (
        <div
          className="card fade-in"
          style={{
            background:  "var(--grad-success)",
            border:      "1px solid var(--success-border)",
            boxShadow:   "var(--glow-success), var(--shadow-card)",
          }}
        >
          {/* Big badge */}
          <div className="text-center" style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>✅</div>
            <h2 style={{ color: "var(--success)", margin: "0.5rem 0 0.25rem" }}>VERIFIED</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              This document has an immutable blockchain proof of existence
            </p>
          </div>

          <div className="divider" />

          {/* Proof details */}
          <div className="result-grid">
            {result.filename  && <ResultRow label="Filename"    value={result.filename} />}
            <ResultRow label="IPFS CID"    value={result.cid}        mono />
            <ResultRow label="Owner"       value={result.uploader}   mono />
            <ResultRow label="Anchored At" value={formatTimestamp(result.timestamp)} />
            {result.txHash    && <ResultRow label="Tx Hash"    value={result.txHash}    mono />}
          </div>

          {result.ipfsUrl && (
            <a
              href={result.ipfsUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
              style={{ marginTop: "1.25rem", display: "inline-flex", textDecoration: "none", fontSize: "0.85rem" }}
            >
              📌 View Original on IPFS ↗
            </a>
          )}
        </div>
      )}

      {/* ── NOT FOUND ✗ ── */}
      {status === "not-found" && (
        <div
          className="card fade-in"
          style={{
            background: "var(--grad-error)",
            border:     "1px solid var(--error-border)",
            boxShadow:  "var(--glow-error), var(--shadow-card)",
            textAlign:  "center",
            padding:    "2.5rem",
          }}
        >
          <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>❌</div>
          <h2 style={{ color: "var(--error)", margin: "0.5rem 0 0.25rem" }}>NOT FOUND</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            No blockchain record found for this document.
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
            CID: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{result?.cid}</span>
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {status === "error" && (
        <div className="alert alert-error fade-in">
          <strong>❌ Verification Error</strong>
          <p style={{ marginTop: "0.25rem", fontSize: "0.875rem" }}>{error}</p>
        </div>
      )}

      {/* ── Verify button ── */}
      {status !== "verifying" && status !== "verified" && status !== "not-found" && (
        <button
          id="verify-btn"
          className="btn btn-primary w-full"
          style={{ padding: "0.875rem", fontSize: "1rem" }}
          disabled={!canVerify}
          onClick={handleVerify}
        >
          🔍 Verify Document on ProofChain
        </button>
      )}

      {/* ── Try again ── */}
      {(status === "verified" || status === "not-found" || status === "error") && (
        <button
          className="btn btn-ghost w-full"
          style={{ fontSize: "0.9rem" }}
          onClick={reset}
        >
          ↩ Verify another document
        </button>
      )}
    </div>
  );
}

function ResultRow({ label, value, mono }) {
  return (
    <div className="result-row">
      <span className="result-label">{label}</span>
      <span className={`result-value${mono ? " mono" : ""} truncate`}>{value || "—"}</span>
    </div>
  );
}
