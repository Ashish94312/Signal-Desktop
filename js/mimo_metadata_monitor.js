(function () {
  const params = new URLSearchParams(window.location.search);
  const port = params.get('port') || '8765';
  const endpoint = `http://127.0.0.1:${port}/mimo-metadata`;

  const statusEl = document.getElementById('status');
  const cardsEl = document.getElementById('cards');
  const rawEl = document.getElementById('raw');
  const refreshButton = document.getElementById('refresh');

  function formatTimestamp(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return 'n/a';
    }

    return new Date(value).toLocaleString();
  }

  function renderClients(clients) {
    if (!Array.isArray(clients) || clients.length === 0) {
      cardsEl.innerHTML =
        '<div class="empty">No MiMo metadata has been ingested yet.</div>';
      return;
    }

    cardsEl.innerHTML = clients
      .map(
        client => `
          <section class="card">
            <h2>${escapeHtml(client.clientSessionId || 'unknown')}</h2>
            <dl class="kv">
              <dt>gameId</dt>
              <dd>${escapeHtml(client.gameId ?? 'null')}</dd>
              <dt>heartbeat</dt>
              <dd>${escapeHtml(formatTimestamp(client.heartbeatUnixMs))}</dd>
              <dt>last ingest</dt>
              <dd>${escapeHtml(formatTimestamp(client.lastIngestedUnixMs))}</dd>
            </dl>
          </section>
        `
      )
      .join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  async function refresh() {
    statusEl.textContent = `Refreshing ${endpoint}`;

    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      const total = typeof json.totalClients === 'number' ? json.totalClients : 0;
      statusEl.textContent = `Connected to ${endpoint} | ${total} client(s)`;
      renderClients(json.clients);
      rawEl.textContent = JSON.stringify(json, null, 2);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      statusEl.textContent = `Failed to fetch metadata: ${message}`;
      cardsEl.innerHTML =
        '<div class="empty">The local MiMo ingest server did not return metadata.</div>';
      rawEl.textContent = '';
    }
  }

  refreshButton.addEventListener('click', refresh);
  refresh();
  window.setInterval(refresh, 2000);
})();
