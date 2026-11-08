export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

async function dataUrlToPngBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context tidak tersedia'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Gagal mengonversi gambar ke PNG'));
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = dataUrl;
  });
}

/**
 * Copies any local media image (/media/...) as image/png into the Windows Clipboard
 * so the user can directly press Ctrl+V inside Google Flow!
 */
export async function copyMediaImageToClipboard(mediaUrl: string): Promise<void> {
  const res = await fetch(`/api/media-base64?mediaUrl=${encodeURIComponent(mediaUrl)}`);
  const data = await res.json();
  if (!res.ok || !data.ok || !data.dataUrl) {
    throw new Error(data.error || 'Gagal mengambil file gambar dari server.');
  }
  const pngBlob = await dataUrlToPngBlob(data.dataUrl);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
}

export async function uploadSingleFile(file: File): Promise<{ url: string; filePath: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Gagal mengupload file');
  }
  return { url: data.url, filePath: data.filePath };
}

export async function revealInExplorer(targetPath: string): Promise<void> {
  const res = await fetch('/api/system/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetPath }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Gagal membuka Explorer');
  }
}
