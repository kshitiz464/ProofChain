import { useState, useEffect } from "react";
import { formatTimestamp, formatBytes } from "../utils/contract";
import { readApi } from "../utils/api";
import DocumentPreview from "./DocumentPreview";

const EMPTY = { q: "", filename: "", uploader: "", from: "", to: "" };
export default function History() {
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1), [limit, setLimit] = useState(10);
  const [result, setResult] = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setExpanded(null);
    const query = new URLSearchParams({ ...applied, page, limit });
    fetch(`/api/documents?${query}`, { signal: controller.signal }).then(readApi).then(json => {
      if (json.pages && page > json.pages) { setPage(json.pages); return; }
      setResult(json);
    }).catch(err => { if (err.name !== "AbortError") setError(err.message || "Unable to load history."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, page, limit, refresh]);
  const change = event => setFilters({ ...filters, [event.target.name]: event.target.value });
  return <div className="history">
    <form className="history-filters" onSubmit={e => { e.preventDefault(); setPage(1); setApplied({ ...filters }); }}>
      <label>Search<input id="history-search" name="q" className="input" placeholder="Filename, CID or uploader" value={filters.q} onChange={change} maxLength={200} /></label>
      <label>Filename<input name="filename" className="input" placeholder="Part of a filename" value={filters.filename} onChange={change} maxLength={200} /></label>
      <label>Uploader<input name="uploader" className="input mono" placeholder="Full 0x… address" value={filters.uploader} onChange={change} maxLength={42} /></label>
      <label>From (UTC)<input name="from" type="date" className="input" value={filters.from} onChange={change} max={filters.to || undefined} /></label>
      <label>To (UTC)<input name="to" type="date" className="input" value={filters.to} onChange={change} min={filters.from || undefined} /></label>
      <div className="flex gap-2 history-filter-actions">
        <button className="btn btn-primary" type="submit">Apply filters</button>
        <button className="btn btn-ghost" type="button" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); setPage(1); }}>Clear</button>
        <button id="refresh-btn" className="btn btn-ghost" type="button" onClick={() => setRefresh(v => v + 1)} disabled={loading}>↻ Refresh</button>
      </div>
    </form>
    {result.partial && !loading && !error && <div className="alert" role="status">MongoDB is unavailable. Showing documents saved in this computer's recovery queue; older database history will return when it reconnects.</div>}
    <div className="history-pagination">
      <span className="text-sm" aria-live="polite">{loading ? "Loading…" : `${result.total} matching ${result.total === 1 ? "document" : "documents"}`}</span>
      <label>Per page <select className="input" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>{[5,10,25,50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    </div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {loading && <div className="card text-center" role="status">Loading document history…</div>}
    {!loading && !error && result.data.length === 0 && <div className="card text-center"><h3>No documents found</h3><p>Try another filter or upload a document.</p></div>}
    {!loading && !error && result.data.map(doc => <article className="card history-document" key={doc.cid}>
      <button className="history-summary" aria-expanded={expanded === doc.cid} onClick={() => setExpanded(expanded === doc.cid ? null : doc.cid)}>
        <span style={{ minWidth: 0 }}><strong className="truncate">{doc.filename}</strong><span className="mono text-xs truncate">{doc.cid}</span><span className="text-xs">{formatTimestamp(doc.anchoredAt)} · {formatBytes(doc.fileSize)}</span></span>
        <span className="badge badge-success">Anchored {expanded === doc.cid ? "▴" : "▾"}</span>
      </button>
      {expanded === doc.cid && <div className="history-details">
        <dl className="result-grid">{[
          ["IPFS CID",doc.cid],["Transaction",doc.txHash],["Uploader",doc.uploader],
          ["Anchored",formatTimestamp(doc.anchoredAt)],["Block",doc.blockNumber],
          ["Gas used",doc.gasUsed || "Not recorded"],["Fee (wei)",doc.feeWei || "Not recorded"],
          ["Network",doc.chainId === 11155111 ? "Sepolia" : doc.chainId === 31337 ? "Local Hardhat" : `Chain ${doc.chainId}`],
        ].map(([label,value]) => <div className="result-row" key={label}><dt className="result-label">{label}</dt><dd className="result-value mono" style={{ overflowWrap: "anywhere", margin: 0 }}>{value}</dd></div>)}</dl>
        {doc.explorerUrl && <a href={doc.explorerUrl} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}
        <DocumentPreview doc={doc} />
      </div>}
    </article>)}
    <nav className="history-pagination" aria-label="History pagination">
      <button className="btn btn-ghost" onClick={() => setPage(p => p - 1)} disabled={loading || page === 1}>← Previous</button>
      <span aria-live="polite">Page {page} of {Math.max(1,result.pages)}</span>
      <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)} disabled={loading || page >= result.pages}>Next →</button>
    </nav>
  </div>;
}

