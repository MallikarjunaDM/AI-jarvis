// Full-viewport screenshot capture (supports both live DisplayMedia stream and local WebGL + DOM composite)

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function drawPercentageGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.font = '11px monospace';
  for (let pct = 10; pct < 100; pct += 10) {
    const x = Math.round((width * pct) / 100);
    const y = Math.round((height * pct) / 100);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText(`${pct}%`, x + 4, 14);
    ctx.fillText(`${pct}%`, 6, y + 12);
  }
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function paintDomHud(ctx: CanvasRenderingContext2D): void {
  const panels = document.querySelectorAll<HTMLElement>('[data-screen-panel]');
  panels.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const style = window.getComputedStyle(panel);
    ctx.save();
    roundRectPath(ctx, rect.left, rect.top, rect.width, rect.height, 12);
    ctx.fillStyle = style.backgroundColor || 'rgba(10, 15, 29, 0.94)';
    ctx.fill();
    ctx.strokeStyle = style.borderColor || 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Paint interactive controls & readable text inside this panel
    const controls = panel.querySelectorAll<HTMLElement>(
      'button, input, textarea, h1, h2, p, span',
    );
    controls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;

      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'input' || tag === 'textarea') {
        roundRectPath(ctx, r.left, r.top, r.width, r.height, 8);
        ctx.fillStyle = cs.backgroundColor || 'rgba(17, 25, 46, 0.9)';
        ctx.fill();
        if (cs.borderWidth && parseFloat(cs.borderWidth) > 0) {
          ctx.strokeStyle = cs.borderColor || 'rgba(255, 255, 255, 0.14)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      let label = '';
      if (tag === 'input' || tag === 'textarea') {
        const inp = el as HTMLInputElement | HTMLTextAreaElement;
        label = inp.value || inp.placeholder || '';
      } else if (el.children.length === 0) {
        label = el.textContent?.trim() ?? '';
      }

      if (label) {
        ctx.fillStyle = cs.color || '#f1f5f9';
        const fontSize = parseFloat(cs.fontSize) || 12;
        ctx.font = `${cs.fontWeight || '500'} ${fontSize}px sans-serif`;
        ctx.textBaseline = 'middle';
        const textX = r.left + Math.max(6, parseFloat(cs.paddingLeft) || 6);
        const textY = r.top + r.height / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.left, r.top, r.width, r.height);
        ctx.clip();
        ctx.fillText(label.slice(0, 80), textX, textY);
        ctx.restore();
      }
    });

    ctx.restore();
  });
}

export async function captureScreenPng(options: {
  getWebGLDataUrl: () => string | null;
  sharedVideo?: HTMLVideoElement | null;
  withGrid?: boolean;
}): Promise<string> {
  const { getWebGLDataUrl, sharedVideo, withGrid = true } = options;

  // 1. If user shared an external tab/window/desktop via Screen Share, grab live video frame
  if (sharedVideo && sharedVideo.readyState >= 2 && sharedVideo.videoWidth > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = sharedVideo.videoWidth;
    canvas.height = sharedVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(sharedVideo, 0, 0, canvas.width, canvas.height);
      if (withGrid) drawPercentageGrid(ctx, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    }
  }

  // 2. Otherwise capture the full JARVIS app viewport (WebGL 3D canvas + HUD panels)
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize screenshot canvas.');
  }

  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, width, height);

  const webglUrl = getWebGLDataUrl();
  if (webglUrl) {
    try {
      const img = await loadImage(webglUrl);
      ctx.drawImage(img, 0, 0, width, height);
    } catch {
      // Proceed with dark canvas fallback
    }
  }

  paintDomHud(ctx);
  if (withGrid) {
    drawPercentageGrid(ctx, width, height);
  }

  return canvas.toDataURL('image/png');
}
