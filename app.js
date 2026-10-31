/* CodeSnap – OCR im Browser; die App lädt keine Bilder auf einen eigenen Server hoch. */
'use strict';

const $ = (id) => document.getElementById(id);
const ui = {
  pasteBtn: $('pasteBtn'), pasteTarget: $('pasteTarget'), pasteAssist: $('pasteAssist'),
  progressBox: $('progressBox'), progressText: $('progressText'), progressPercent: $('progressPercent'), progressBar: $('progressBar'),
  statusText: $('statusText'), emptyResult: $('emptyResult'), resultBox: $('resultBox'),
  codeField: $('codeField'), copyBtn: $('copyBtn'), copyLabel: $('copyLabel'),
  reviewHint: $('reviewHint'), resetBtn: $('resetBtn'), toast: $('toast')
};
let workerPromise = null;
let busy = false;
let serial = 0;
let toastTimer = null;
let resetTimer = null;

function status(message, kind = '') {
  ui.statusText.textContent = message;
  ui.statusText.className = `status ${kind}`.trim();
}
function toast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2000);
}
function progress(label, amount = 0) {
  const value = Math.round(Math.max(0, Math.min(100, amount)));
  ui.progressBox.hidden = false;
  ui.progressText.textContent = label;
  ui.progressPercent.textContent = `${value} %`;
  ui.progressBar.style.width = `${value}%`;
}
function resetApp(message = 'Bereit für das nächste Foto.') {
  serial += 1;
  clearTimeout(resetTimer);
  busy = false;
  ui.pasteTarget.replaceChildren();
  ui.pasteAssist.hidden = true;
  ui.resultBox.hidden = true;
  ui.emptyResult.hidden = false;
  ui.codeField.value = '';
  ui.copyBtn.classList.remove('copied');
  ui.copyLabel.textContent = 'Kopieren';
  ui.reviewHint.hidden = true;
  ui.progressBox.hidden = true;
  status(message);
}

/* Erkennt 4–8-stellige Zifferncodes, bevorzugt Nummern neben 'code',
   'Bestätigung', 'verification' etc., und ignoriert Datum, Uhrzeit, PLZ. */
function extractCode(rawText) {
  const cleaned = String(rawText || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '');
  const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const results = new Map();
  const marker = /\b(?:code|codes|otp|pin|passcode|security|verification|confirmation|confirm|verify|authenticat(?:ion|e)|login|sign.in|two.factor|best[aä]tigungs?code|best[aä]tigung|sicherheitscode|einmalcode|anmeldecode|freischaltcode|verifizierung)\b/i;
  const tokenRx = /(?<![A-Za-z0-9])(?:\d[\u00A0 \-]?){3,7}\d(?![A-Za-z0-9])/g;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const match of line.matchAll(tokenRx)) {
      const code = match[0].replace(/\D/g, '');
      if (code.length < 4 || code.length > 8) continue;
      const previous = lines[index - 1] || '';
      const previousTwo = lines[index - 2] || '';
      const next = lines[index + 1] || '';
      const nextTwo = lines[index + 2] || '';
      const region = `${previousTwo} ${previous} ${line} ${next} ${nextTwo}`;
      let score = {4:3,5:4,6:9,7:4,8:4}[code.length] || 0;
      if (marker.test(line)) score += 22;
      if (marker.test(previous)) score += 20;
      if (marker.test(next)) score += 19;
      if (marker.test(previousTwo) || marker.test(nextTwo)) score += 5;
      if (/\b(?:instagram|google|facebook|meta|microsoft|apple|email|account|app|konto)\b/i.test(region)) score += 2;
      if (/\b(?:is your|your|enter|use|type|dein|ihr|lautet|eingeben|gib ein)\b/i.test(line)) score += 5;
      if (/\b(?:subject|betreff)\b/i.test(previous)) score += 3;
      if (/\b(?:code|pin|otp|best[aä]tigung|verification|confirmation)\b/i.test(previous) && /[:：]\s*$/.test(previous)) score += 7;
      if (/\b(?:code|pin|otp)\b/i.test(next)) score += 4;
      // Postal codes, addresses, mail footers, dates and times are not verification codes.
      if (/(?:\d{1,2}[./-]){2}\d{2,4}/.test(line)) score -= 35;
      if (/\b(?:received|erhalten|sent|uhrzeit|date|datum)\b/i.test(line)) score -= 18;
      if (/\b(?:road|street|avenue|park|ca|inc\.|zip|postleitzahl)\b/i.test(line)) score -= 24;
      if (/\b(?:road|street|avenue|menlo park|postal|plz)\b/i.test(previous)) score -= 10;
      if (line.includes('@')) score -= 18;
      if (/(?:\d{1,2}:){1,2}\d{2}/.test(line)) score -= 30;
      const old = results.get(code);
      if (!old) results.set(code, { code, score, repeats: 1, firstAt: index });
      else { old.score = Math.max(old.score, score); old.repeats += 1; }
    }
  }
  const ranked = [...results.values()].map(v => ({...v, total: v.score + 8 * (v.repeats - 1)}));
  ranked.sort((a,b) => b.total - a.total || a.firstAt - b.firstAt);
  return ranked.length && ranked[0].total >= 4 ? ranked[0].code : null;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Fallback */ }
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:fixed;top:0;left:-10000px;font-size:16px;';
  document.body.appendChild(el);
  el.focus(); el.select(); el.setSelectionRange(0,text.length);
  const copied = document.execCommand('copy');
  el.remove();
  if (!copied) throw new Error('Clipboard nicht verfügbar');
}

function imageFromTransfer(items) {
  for (const item of Array.from(items || [])) {
    if ((item.type || '').startsWith('image/')) {
      return typeof item.getAsFile === 'function' ? item.getAsFile() : item;
    }
  }
  return null;
}

function loadWorker() {
  if (!workerPromise) {
    if (!window.Tesseract) throw new Error('OCR-Bibliothek konnte nicht geladen werden.');
    workerPromise = Tesseract.createWorker('eng', 1, {
      logger: (message) => {
        if (!busy) return;
        const pct = typeof message.progress === 'number' ? 10 + message.progress * 86 : 10;
        progress('Code wird gelesen …', pct);
      }
    }).then(async worker => {
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      return worker;
    }).catch(error => { workerPromise = null; throw error; });
  }
  return workerPromise;
}

async function prepareImage(blob, enhance = false) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=reject; image.src=url; });
    const scale = Math.min(1, 2300 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: enhance });
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    if (enhance) {
      const im = ctx.getImageData(0,0,canvas.width,canvas.height), p = im.data;
      for(let i=0;i<p.length;i+=4) {
        const grey = .299*p[i] + .587*p[i+1] + .114*p[i+2];
        const value = Math.max(0,Math.min(255,(grey-128)*1.25+128));
        p[i]=p[i+1]=p[i+2]=value;
      }
      ctx.putImageData(im,0,0);
    }
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

async function recognizePhoto(blob) {
  if (busy || !blob) return;
  const myTurn = ++serial;
  clearTimeout(resetTimer);
  busy = true;
  ui.pasteTarget.replaceChildren();
  ui.emptyResult.hidden = false;
  ui.resultBox.hidden = true;
  ui.reviewHint.hidden = true;
  ui.pasteAssist.hidden = true;
  progress('Foto wird vorbereitet …', 4);
  status('Bestätigungscode wird gesucht …');
  try {
    const worker = await loadWorker();
    const canvas = await prepareImage(blob);
    let data = await worker.recognize(canvas);
    let code = extractCode(data?.data?.text);
    if (!code) {
      // Zweite Erkennung mit höherem Kontrast bei schlecht lesbaren Aufnahmen.
      progress('Zweiter Erkennungsversuch …', 20);
      await worker.setParameters({tessedit_pageseg_mode:'3'});
      const enhanced = await prepareImage(blob, true);
      data = await worker.recognize(enhanced);
      code = extractCode(data?.data?.text);
      await worker.setParameters({tessedit_pageseg_mode:'6'});
    }
    if (myTurn !== serial) return;
    ui.progressBox.hidden = true;
    if (!code) {
      status('Keinen Bestätigungscode erkannt. Bitte Foto erneut kopieren und einsetzen.','error');
      toast('Kein Code gefunden');
    } else {
      ui.codeField.value = code;
      ui.emptyResult.hidden = true;
      ui.resultBox.hidden = false;
      ui.reviewHint.hidden = false;
      status('Code erkannt – oben kopieren.','success');
    }
  } catch (error) {
    console.error('OCR-Fehler:',error);
    if (myTurn === serial) {
      ui.progressBox.hidden = true;
      status('Foto konnte nicht gelesen werden. Internetverbindung prüfen und erneut einsetzen.','error');
      toast('Erkennung fehlgeschlagen');
    }
    workerPromise = null;
  } finally {
    if (myTurn === serial) busy = false;
    ui.pasteTarget.replaceChildren();
  }
}

async function tryReadImageFromClipboard() {
  if (!navigator.clipboard?.read) return false;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageMime = item.types.find(type => type.startsWith('image/'));
      if (imageMime) {
        const blob = await item.getType(imageMime);
        await recognizePhoto(blob);
        return true;
      }
    }
  } catch { /* Manche Browser erlauben ein Bild nur über die native Einsetzen-Funktion. */ }
  return false;
}

ui.pasteBtn.addEventListener('click', async () => {
  if (busy) return;
  // Der Aufruf ist direkt an den Klick gebunden – wichtig für Zwischenablage-Rechte.
  const ok = await tryReadImageFromClipboard();
  if (ok) return;
  ui.pasteAssist.hidden = false;
  ui.pasteTarget.focus({preventScroll:true});
  status('Jetzt das kopierte Foto in das Feld einsetzen.');
});

ui.resetBtn.addEventListener('click', () => resetApp());

ui.copyBtn.addEventListener('click', async () => {
  const code = ui.codeField.value.trim().replace(/[\s-]/g,'');
  if (!code) return;
  try {
    await copyText(code);
    ui.copyBtn.classList.add('copied');
    ui.copyLabel.textContent = 'Kopiert!';
    toast('Code kopiert ✓');
    status('Code kopiert. Bereit für das nächste Foto.','success');
    resetTimer = setTimeout(() => resetApp(), 550);
  } catch {
    status('Kopieren fehlgeschlagen. Bitte noch einmal versuchen.','error');
  }
});

document.addEventListener('paste', (event) => {
  const image = imageFromTransfer(event.clipboardData?.items);
  if (image) {
    event.preventDefault();
    void recognizePhoto(image);
  }
});

ui.pasteTarget.addEventListener('input', async () => {
  const embeddedImage = ui.pasteTarget.querySelector('img');
  if (embeddedImage?.src?.startsWith('data:image/')) {
    try {
      const blob = await (await fetch(embeddedImage.src)).blob();
      ui.pasteTarget.replaceChildren();
      await recognizePhoto(blob);
    } catch {
      status('Das eingefügte Foto konnte nicht geöffnet werden.','error');
    }
  } else if (ui.pasteTarget.textContent?.trim()) {
    ui.pasteTarget.replaceChildren();
    status('Bitte ein kopiertes Foto statt Text einsetzen.','error');
  }
});

resetApp('Bereit für dein erstes Foto.');
