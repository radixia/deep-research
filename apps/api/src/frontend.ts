/**
 * Inline frontend page for the Deep Research Agent.
 * Served at GET /app — no build step, just vanilla HTML/CSS/JS.
 */
export const FRONTEND_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Deep Research Agent</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #242836;
    --border: #2e3346;
    --text: #e1e4ed;
    --text2: #9ca3b8;
    --accent: #6c8aff;
    --accent2: #4e6bdf;
    --green: #34d399;
    --red: #f87171;
    --yellow: #fbbf24;
    --radius: 8px;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --mono: "SF Mono", "Fira Code", "Fira Mono", monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.6;
  }
  .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 0.25rem; }
  h1 span { color: var(--accent); }
  .subtitle { color: var(--text2); font-size: 0.9rem; margin-bottom: 2rem; }

  /* ── Form ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .form-row { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .form-group { flex: 1; min-width: 200px; }
  .form-group label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text2);
    margin-bottom: 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  input[type="text"], input[type="password"], select {
    width: 100%;
    padding: 0.6rem 0.75rem;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.9rem;
    font-family: var(--font);
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus { border-color: var(--accent); }
  .providers-grid {
    display: flex; gap: 0.5rem; flex-wrap: wrap;
  }
  .provider-chip {
    display: flex; align-items: center; gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.82rem;
    transition: all 0.15s;
    user-select: none;
  }
  .provider-chip:hover { border-color: var(--accent); }
  .provider-chip input { display: none; }
  .provider-chip.active { background: var(--accent2); border-color: var(--accent); color: #fff; }
  .provider-chip .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--text2); transition: background 0.15s;
  }
  .provider-chip.active .dot { background: var(--green); }

  .btn {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.65rem 1.5rem;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn:hover { background: var(--accent2); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-row { display: flex; justify-content: space-between; align-items: center; }

  /* ── Status ── */
  .status-bar {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 1.5rem;
    font-size: 0.85rem;
  }
  .status-dot {
    width: 10px; height: 10px; border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.pending { background: var(--yellow); animation: pulse 1.5s infinite; }
  .status-dot.running { background: var(--yellow); animation: pulse 1.5s infinite; }
  .status-dot.completed { background: var(--green); }
  .status-dot.failed { background: var(--red); }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  .status-text { flex: 1; }
  .status-meta { color: var(--text2); font-size: 0.8rem; }

  /* ── Results ── */
  .result-section { margin-bottom: 1.5rem; }
  .result-section h2 {
    font-size: 1.1rem; font-weight: 700;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .exec-summary {
    white-space: pre-wrap;
    font-size: 0.9rem;
    line-height: 1.7;
    padding: 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .detail-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 0.75rem;
    overflow: hidden;
  }
  .detail-header {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface2);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .detail-header .badge {
    padding: 0.15rem 0.5rem;
    background: var(--accent2);
    border-radius: 12px;
    font-size: 0.7rem;
    color: #fff;
    font-weight: 700;
  }
  .detail-body {
    padding: 1rem;
    font-size: 0.85rem;
    white-space: pre-wrap;
    max-height: 400px;
    overflow-y: auto;
    display: none;
  }
  .detail-body.open { display: block; }
  .chunk {
    padding: 0.6rem 0.75rem;
    margin-bottom: 0.5rem;
    background: var(--surface2);
    border-radius: var(--radius);
    border-left: 3px solid var(--accent);
  }
  .chunk-url {
    font-size: 0.75rem;
    color: var(--accent);
    word-break: break-all;
    margin-top: 0.25rem;
  }
  .chunk-url a { color: var(--accent); text-decoration: none; }
  .chunk-url a:hover { text-decoration: underline; }

  .ref-list { list-style: none; }
  .ref-item {
    display: flex; gap: 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .ref-item:last-child { border-bottom: none; }
  .ref-idx {
    flex-shrink: 0;
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface2);
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent);
  }
  .ref-content { flex: 1; min-width: 0; }
  .ref-title { font-weight: 600; }
  .ref-url {
    font-size: 0.75rem;
    color: var(--accent);
    word-break: break-all;
  }
  .ref-url a { color: var(--accent); text-decoration: none; }
  .ref-url a:hover { text-decoration: underline; }
  .ref-snippet { color: var(--text2); font-size: 0.8rem; margin-top: 0.15rem; }
  .ref-tool { font-size: 0.7rem; color: var(--text2); }

  .confidence-bar {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 1rem;
  }
  .confidence-track {
    flex: 1; height: 8px;
    background: var(--surface2);
    border-radius: 4px;
    overflow: hidden;
  }
  .confidence-fill {
    height: 100%;
    background: var(--green);
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  .confidence-value { font-weight: 700; font-size: 0.9rem; min-width: 48px; text-align: right; }

  .hidden { display: none !important; }
  .error-msg { color: var(--red); font-size: 0.85rem; margin-top: 0.5rem; }
</style>
</head>
<body>
<div class="container">
  <h1>🔍 <span>Deep Research</span> Agent</h1>
  <p class="subtitle">Multi-provider research with citations, domain filtering, and structured output</p>

  <!-- ── Form ── -->
  <div class="card">
    <div class="form-row">
      <div class="form-group" style="flex:3">
        <label>Research Query</label>
        <input type="text" id="query" placeholder="e.g. State of agentic AI in 2026" autofocus />
      </div>
      <div class="form-group" style="flex:1; min-width:130px">
        <label>Depth</label>
        <select id="depth">
          <option value="quick">Quick (~30s)</option>
          <option value="standard" selected>Standard (~1m)</option>
          <option value="deep">Deep (~10m)</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Providers <span style="font-weight:400; text-transform:none">(leave unchecked for depth-based auto-selection)</span></label>
        <div class="providers-grid">
          <label class="provider-chip" data-provider="perplexity"><input type="checkbox" value="perplexity"/><span class="dot"></span>Perplexity</label>
          <label class="provider-chip" data-provider="tavily"><input type="checkbox" value="tavily"/><span class="dot"></span>Tavily</label>
          <label class="provider-chip" data-provider="brave"><input type="checkbox" value="brave"/><span class="dot"></span>Brave</label>
          <label class="provider-chip" data-provider="firecrawl"><input type="checkbox" value="firecrawl"/><span class="dot"></span>Firecrawl</label>
          <label class="provider-chip" data-provider="manus"><input type="checkbox" value="manus"/><span class="dot"></span>Manus</label>
        </div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Allowed Domains <span style="font-weight:400; text-transform:none">(comma-separated, leave empty for full internet)</span></label>
        <input type="text" id="domains" placeholder="e.g. arxiv.org, github.com, docs.python.org" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group" style="max-width:350px">
        <label>API Key <span style="font-weight:400; text-transform:none">(required if server has API_KEY set)</span></label>
        <input type="password" id="apiKey" placeholder="your-api-key" />
      </div>
    </div>

    <div class="btn-row">
      <button class="btn" id="submitBtn" onclick="submitResearch()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Research
      </button>
      <div id="formError" class="error-msg hidden"></div>
    </div>
  </div>

  <!-- ── Status bar ── -->
  <div id="statusBar" class="status-bar hidden">
    <div id="statusDot" class="status-dot pending"></div>
    <span id="statusText" class="status-text">Submitting…</span>
    <span id="statusMeta" class="status-meta"></span>
  </div>

  <!-- ── Results ── -->
  <div id="results" class="hidden">

    <!-- Confidence -->
    <div class="confidence-bar">
      <span style="font-size:0.85rem; font-weight:600;">Confidence</span>
      <div class="confidence-track">
        <div id="confidenceFill" class="confidence-fill" style="width:0%"></div>
      </div>
      <span id="confidenceValue" class="confidence-value">0%</span>
    </div>

    <!-- Executive Summary -->
    <div class="result-section">
      <h2>📋 Executive Summary</h2>
      <div id="execSummary" class="exec-summary"></div>
    </div>

    <!-- Detail Sections -->
    <div id="detailSections" class="result-section hidden">
      <h2>🔎 Detailed Findings</h2>
      <div id="detailContainer"></div>
    </div>

    <!-- References -->
    <div id="refSection" class="result-section hidden">
      <h2>📚 References</h2>
      <ul id="refList" class="ref-list"></ul>
    </div>
  </div>
</div>

<script>
// ── Provider chip toggle ─────────────────────────────────────────────────────
document.querySelectorAll('.provider-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const cb = chip.querySelector('input');
    cb.checked = !cb.checked;
    chip.classList.toggle('active', cb.checked);
  });
});

// Enter key submits
document.getElementById('query').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitResearch();
});

let pollTimer = null;

async function submitResearch() {
  const query = document.getElementById('query').value.trim();
  if (!query) {
    showError('Please enter a research query.');
    return;
  }

  const depth = document.getElementById('depth').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const domainsRaw = document.getElementById('domains').value.trim();
  const providers = Array.from(document.querySelectorAll('.provider-chip input:checked')).map(cb => cb.value);

  const body = { query, depth };
  if (providers.length > 0) body.providers = providers;
  if (domainsRaw) body.allowedDomains = domainsRaw.split(',').map(d => d.trim()).filter(Boolean);

  // Reset UI
  hideError();
  document.getElementById('results').classList.add('hidden');
  document.getElementById('statusBar').classList.remove('hidden');
  setStatus('pending', 'Submitting research request…');
  document.getElementById('submitBtn').disabled = true;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  try {
    const res = await fetch('/research', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed: ' + res.status }));
      throw new Error(err.error || err.details || 'Request failed');
    }
    const data = await res.json();
    setStatus('running', 'Research in progress…', 'Job: ' + data.jobId.slice(0, 8));
    startPolling(data.jobId, apiKey);
  } catch (err) {
    setStatus('failed', err.message);
    document.getElementById('submitBtn').disabled = false;
  }
}

function startPolling(jobId, apiKey) {
  if (pollTimer) clearInterval(pollTimer);
  const startTime = Date.now();

  pollTimer = setInterval(async () => {
    try {
      const headers = {};
      if (apiKey) headers['x-api-key'] = apiKey;
      const res = await fetch('/research/' + jobId, { headers });
      const data = await res.json();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

      if (data.status === 'completed') {
        clearInterval(pollTimer);
        pollTimer = null;
        setStatus('completed', 'Research completed', elapsed + 's');
        renderResults(data.result);
        document.getElementById('submitBtn').disabled = false;
      } else if (data.status === 'failed') {
        clearInterval(pollTimer);
        pollTimer = null;
        setStatus('failed', 'Research failed: ' + (data.error || 'unknown error'));
        document.getElementById('submitBtn').disabled = false;
      } else {
        setStatus('running', 'Research in progress…', elapsed + 's elapsed');
      }
    } catch (err) {
      // Network error — keep polling
    }
  }, 2000);
}

function setStatus(state, text, meta) {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + state;
  document.getElementById('statusText').textContent = text;
  document.getElementById('statusMeta').textContent = meta || '';
}

function showError(msg) {
  const el = document.getElementById('formError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  document.getElementById('formError').classList.add('hidden');
}

function renderResults(result) {
  document.getElementById('results').classList.remove('hidden');

  // Confidence
  const pct = Math.round((result.confidenceScore || 0) * 100);
  document.getElementById('confidenceFill').style.width = pct + '%';
  document.getElementById('confidenceValue').textContent = pct + '%';

  // Executive Summary
  const summary = result.executiveSummary || result.summary || 'No summary available.';
  document.getElementById('execSummary').textContent = summary;

  // Detail Sections
  const detailContainer = document.getElementById('detailContainer');
  detailContainer.innerHTML = '';
  const sections = result.detailSections || [];
  if (sections.length > 0) {
    document.getElementById('detailSections').classList.remove('hidden');
    sections.forEach((section, idx) => {
      const div = document.createElement('div');
      div.className = 'detail-section';

      const header = document.createElement('div');
      header.className = 'detail-header';
      header.innerHTML = '<span class="badge">' + esc(section.tool) + '</span> ' +
        esc(section.tool) + ' findings' +
        (section.chunks ? ' <span style="color:var(--text2);font-weight:400;font-size:0.8rem">(' + section.chunks.length + ' chunks)</span>' : '');

      const body = document.createElement('div');
      body.className = 'detail-body' + (idx === 0 ? ' open' : '');

      // Content preview
      if (section.content) {
        const pre = document.createElement('div');
        pre.style.marginBottom = '0.75rem';
        pre.textContent = section.content.length > 1500
          ? section.content.slice(0, 1500) + '…'
          : section.content;
        body.appendChild(pre);
      }

      // Chunks
      if (section.chunks && section.chunks.length > 0) {
        section.chunks.forEach(chunk => {
          const cdiv = document.createElement('div');
          cdiv.className = 'chunk';
          cdiv.textContent = chunk.text;
          if (chunk.sourceUrl) {
            const link = document.createElement('div');
            link.className = 'chunk-url';
            link.innerHTML = '<a href="' + esc(chunk.sourceUrl) + '" target="_blank" rel="noopener">' +
              esc(chunk.sourceTitle || chunk.sourceUrl) + '</a>';
            cdiv.appendChild(link);
          }
          body.appendChild(cdiv);
        });
      }

      header.addEventListener('click', () => body.classList.toggle('open'));
      div.appendChild(header);
      div.appendChild(body);
      detailContainer.appendChild(div);
    });
  } else {
    document.getElementById('detailSections').classList.add('hidden');
  }

  // References
  const refList = document.getElementById('refList');
  refList.innerHTML = '';
  const refs = result.references || [];
  if (refs.length > 0) {
    document.getElementById('refSection').classList.remove('hidden');
    refs.forEach(ref => {
      const li = document.createElement('li');
      li.className = 'ref-item';
      li.innerHTML =
        '<span class="ref-idx">' + ref.index + '</span>' +
        '<div class="ref-content">' +
          '<div class="ref-title">' + esc(ref.title || 'Untitled') + '</div>' +
          '<div class="ref-url"><a href="' + esc(ref.url) + '" target="_blank" rel="noopener">' + esc(ref.url) + '</a></div>' +
          (ref.snippet ? '<div class="ref-snippet">' + esc(ref.snippet.slice(0, 200)) + '</div>' : '') +
          '<div class="ref-tool">via ' + esc(ref.sourceTool) + '</div>' +
        '</div>';
      refList.appendChild(li);
    });
  } else {
    document.getElementById('refSection').classList.add('hidden');
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
</script>
</body>
</html>`;
