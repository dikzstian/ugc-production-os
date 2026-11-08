const API_BASE = 'http://127.0.0.1:3010';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, sub);
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'FLOW_STUDIO_API') {
    const url = `${API_BASE}${msg.path}`;
    const options = {
      method: msg.method || 'GET',
      headers: msg.body ? { 'Content-Type': 'application/json' } : undefined,
      body: msg.body ? JSON.stringify(msg.body) : undefined,
    };

    fetch(url, options)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok && data.ok !== false, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          error:
            'Server Flow Studio belum aktif di port 3010. Jalankan BUKA-FLOW-STUDIO.bat terlebih dahulu. (' +
            (err?.message || String(err)) +
            ')',
        });
      });

    return true;
  }

  if (msg?.type === 'FLOW_STUDIO_FETCH_VIDEO_DATAURL') {
    fetch(msg.videoUrl, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 15 * 1024) {
          throw new Error('Video belum utuh');
        }
        const b64 = arrayBufferToBase64(buf);
        sendResponse({ ok: true, dataUrl: `data:video/mp4;base64,${b64}` });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) });
      });

    return true;
  }
});
