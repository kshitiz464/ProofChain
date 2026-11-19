import { useState, useEffect } from "react";
import Upload  from "./components/Upload";
import History from "./components/History";
import Verify  from "./components/Verify";
import { connectWallet, getConnectedAddress, shortenAddress } from "./utils/contract";
import "./App.css";
import { readApi } from "./utils/api";

const TABS = [
  { id: "upload",  label: "Upload",  icon: "📤", desc: "Anchor a document" },
  { id: "history", label: "History", icon: "📋", desc: "View all records"  },
  { id: "verify",  label: "Verify",  icon: "🔍", desc: "Verify proof"      },
];

export default function App() {
  const [tab,         setTab]         = useState("upload");
  const [wallet,      setWallet]      = useState(null);
  const [connecting,  setConnecting]  = useState(false);
  const [walletError, setWalletError] = useState("");
  const [serviceConfig, setServiceConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const loadConfig = () => {
    setConfigError("");
    fetch("/api/config").then(readApi).then(setServiceConfig).catch(err => setConfigError(err.message));
  };
  useEffect(loadConfig, []);

  // ── Auto-detect already-connected wallet ───────────────────────────────
  useEffect(() => {
    getConnectedAddress().then(addr => { if (addr) setWallet(addr); });

    if (window.ethereum) {
      const onAccountsChanged = (accounts) => {
        setWallet(accounts[0] || null);
      };
      window.ethereum.on("accountsChanged", onAccountsChanged);
      return () => window.ethereum.removeListener("accountsChanged", onAccountsChanged);
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setWalletError("");
    try {
      const { address } = await connectWallet();
      setWallet(address);
    } catch (err) {
      setWalletError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const activeTab = TABS.find(t => t.id === tab);

  return (
    <div className="app-shell">

      {/* ═══════════════════ HEADER ══════════════════════════════════════ */}
      <header className="app-header">
        <div className="container flex items-center justify-between" style={{ height: "100%" }}>
          {/* Logo */}
          <div className="logo-wrap">
            <div className="logo-icon">⛓</div>
            <div>
              <span className="logo-text">ProofChain</span>
              <span className="logo-badge">BETA</span>
            </div>
          </div>

          {/* Wallet */}
          <div className="wallet-area">
            {serviceConfig && <span className="badge badge-muted">{serviceConfig.networkName}</span>}
            {walletError && (
              <span className="text-xs" style={{ color: "var(--error)", maxWidth: 180, display: "block", textAlign: "right" }}>
                {walletError}
              </span>
            )}
            {wallet ? (
              <div className="wallet-chip">
                <span className="wallet-dot" />
                <span className="text-xs mono">{shortenAddress(wallet)}</span>
              </div>
            ) : (
              <button
                id="connect-wallet-btn"
                className="btn btn-ghost"
                style={{ fontSize: "0.85rem" }}
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting
                  ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Connecting…</>
                  : "🦊 Connect MetaMask"
                }
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════ HERO SECTION ════════════════════════════════ */}
      <section className="hero-section">
        <div className="container text-center">
          <div className="hero-badge">
            <span>⛓ Blockchain + 📌 IPFS</span>
          </div>
          <h1 className="hero-title">
            Decentralized Document
            <br />
            <span className="gradient-text">Verification System</span>
          </h1>
          <p className="hero-subtitle">
            Upload any document, get a permanent cryptographic proof of existence anchored on the
            blockchain — independently verifiable by anyone, without trusting any central authority.
          </p>

          {/* Pipeline illustration */}
          <div className="pipeline-row">
            <PipeStep icon="📄" label="Document" />
            <div className="pipeline-arrow">→</div>
            <PipeStep icon="📌" label="IPFS" color="var(--secondary)" />
            <div className="pipeline-arrow">→</div>
            <PipeStep icon="⛓" label="Blockchain" color="var(--accent)" />
            <div className="pipeline-arrow">→</div>
            <PipeStep icon="✅" label="Proof" color="var(--success)" />
          </div>
        </div>
      </section>

      {/* ═══════════════════ MAIN PANEL ══════════════════════════════════ */}
      <main className="app-main">
        <div className="container">
          <div className="main-panel card">
            {/* Tab nav */}
            <div className="tab-nav">
              {TABS.map(t => (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  className={`tab-btn${tab === t.id ? " active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  <span className="tab-icon">{t.icon}</span>
                  <span className="tab-label">{t.label}</span>
                  <span className="tab-desc">{t.desc}</span>
                </button>
              ))}
            </div>

            {/* Panel header */}
            <div className="panel-header">
              <span style={{ fontSize: "1.5rem" }}>{activeTab?.icon}</span>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.3rem" }}>{activeTab?.label}</h2>
                <p style={{ margin: 0, fontSize: "0.875rem" }}>{activeTab?.desc}</p>
              </div>
            </div>

            {/* Tab content */}
            <div className="panel-body">
              {configError && <div className="alert alert-error" role="alert">Unable to read server configuration. {configError} <button className="btn btn-ghost" onClick={loadConfig}>Retry</button></div>}
              {!serviceConfig && !configError && <p role="status">Connecting to ProofChain…</p>}
              {tab === "upload" && serviceConfig && <Upload serviceConfig={serviceConfig} />}
              {tab === "history" && <History />}
              {tab === "verify" && serviceConfig && <Verify serviceConfig={serviceConfig} />}
            </div>
          </div>
        </div>
      </main>

      {/* ═══════════════════ FOOTER ══════════════════════════════════════ */}
      <footer className="app-footer">
        <div className="container text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            ProofChain · Final Year Project · Khushi Jangid · Kshitiz Yadav · Kunal Upadhyay
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Powered by IPFS · Solidity · Hardhat · MongoDB · React
          </p>
        </div>
      </footer>
    </div>
  );
}

function PipeStep({ icon, label, color = "var(--primary-light)" }) {
  return (
    <div className="pipe-step">
      <div className="pipe-step-icon" style={{ color }}>{icon}</div>
      <span className="pipe-step-label">{label}</span>
    </div>
  );
}
