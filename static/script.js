let fileArray = [];

const input = document.getElementById('images');
const dropArea = document.querySelector('.file-drop-area');
const fileList = document.getElementById('file-list');

const progressEl = document.getElementById("progress");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const qualitySlider = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");

const optimizeBtn = document.querySelector('button[onclick="upload()"]');

/* ---------- Helpers ---------- */

function bytesToNice(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  const digits = (i >= 2) ? 1 : 0;
  return `${val.toFixed(digits)} ${units[i]}`;
}

function savingsPercent(originalBytes, newBytes) {
  if (!originalBytes || originalBytes <= 0) return 0;
  const saved = 1 - (newBytes / originalBytes);
  return Math.max(0, Math.min(100, Math.round(saved * 100)));
}

// Heuristic estimate (dynamic). Exact WebP size depends on image content.
function estimateWebpBytes(inputBytes, quality) {
  const q = Math.max(50, Math.min(100, Number(quality) || 95));
  const t = (q - 50) / 50; // 0..1
  const ratio = 0.18 + (0.55 - 0.18) * t; // 0.18..0.55
  const extra = (q >= 95) ? (q - 95) * 0.02 : 0;
  const finalRatio = Math.min(0.75, ratio + extra);

  const estimate = Math.round(inputBytes * finalRatio);
  return Math.max(8 * 1024, Math.min(estimate, inputBytes));
}

function paintQualityTrack() {
  if (!qualitySlider) return;
  const v = Number(qualitySlider.value);
  const pct = ((v - 50) / 50) * 100;
  qualitySlider.style.background =
    `linear-gradient(90deg,
      #00bcd4 0%,
      #00bcd4 ${pct}%,
      #e6eef3 ${pct}%,
      #e6eef3 100%)`;
}

/* ---------- Slider setup ---------- */

if (qualitySlider && qualityValue) {
  const saved = localStorage.getItem("webp_quality");
  if (saved && !isNaN(saved)) qualitySlider.value = saved;

  qualityValue.innerText = qualitySlider.value;
  paintQualityTrack();

  qualitySlider.addEventListener('input', () => {
    qualityValue.innerText = qualitySlider.value;
    localStorage.setItem("webp_quality", qualitySlider.value);
    paintQualityTrack();
    refreshRightSideEstimates();
  });
}

/* ---------- UX helpers ---------- */

function setBusy(isBusy) {
  if (!optimizeBtn) return;
  optimizeBtn.disabled = isBusy;
  optimizeBtn.style.opacity = isBusy ? "0.7" : "1";
  optimizeBtn.style.cursor = isBusy ? "not-allowed" : "pointer";
}

function clearResults() {
  if (resultsEl) resultsEl.innerHTML = "";
}

function addResultLine(text, kind = "ok") {
  if (!resultsEl) return;
  const p = document.createElement("div");
  p.style.padding = "6px 0";
  p.style.fontSize = "13px";
  p.style.borderBottom = "1px solid #eee";
  p.style.color = (kind === "err") ? "#b71c1c" : "#006b78";
  p.innerText = text;
  resultsEl.prepend(p);
}

/* ---------- File list rendering ---------- */

function updateFileList() {
  fileList.innerHTML = '';

  const q = qualitySlider ? Number(qualitySlider.value) : 95;

  fileArray.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);

    // LEFT: name + original size
    const left = document.createElement('div');
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.flex = "1";
    left.style.minWidth = "0";

    const nameRow = document.createElement('span');
    nameRow.innerText = file.name;
    nameRow.style.overflow = "hidden";
    nameRow.style.textOverflow = "ellipsis";
    nameRow.style.whiteSpace = "nowrap";

    const originalSize = document.createElement('small');
    originalSize.innerText = `Original: ${bytesToNice(file.size)}`;
    originalSize.style.color = "#777";
    originalSize.style.marginTop = "2px";

    left.appendChild(nameRow);
    left.appendChild(originalSize);

    // RIGHT: New + Saved (estimate)
    const right = document.createElement('div');
    right.style.display = "flex";
    right.style.flexDirection = "column";
    right.style.alignItems = "flex-end";
    right.style.marginRight = "8px";
    right.style.flexShrink = "0";

    const estBytes = estimateWebpBytes(file.size, q);
    const estSaved = savingsPercent(file.size, estBytes);

    const newSize = document.createElement('small');
    newSize.className = "new-size";
    newSize.dataset.index = String(index);
    newSize.innerText = `New (est): ${bytesToNice(estBytes)}`;
    newSize.style.color = "#00acc1";
    newSize.style.fontWeight = "800";
    newSize.style.marginTop = "2px";

    const savedSize = document.createElement('small');
    savedSize.className = "saved-size";
    savedSize.dataset.index = String(index);
    savedSize.innerText = `Saved (est): ${estSaved}%`;
    savedSize.style.color = "#00838f";
    savedSize.style.fontWeight = "600";
    savedSize.style.marginTop = "2px";

    right.appendChild(newSize);
    right.appendChild(savedSize);

    // remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove';
    removeBtn.onclick = () => {
      fileArray.splice(index, 1);
      updateFileList();
    };

    item.appendChild(img);
    item.appendChild(left);
    item.appendChild(right);
    item.appendChild(removeBtn);

    fileList.appendChild(item);
  });
}

function refreshRightSideEstimates() {
  const q = qualitySlider ? Number(qualitySlider.value) : 95;

  document.querySelectorAll(".new-size").forEach(node => {
    const idx = Number(node.dataset.index);
    const file = fileArray[idx];
    if (!file) return;

    const estBytes = estimateWebpBytes(file.size, q);
    node.innerText = `New (est): ${bytesToNice(estBytes)}`;
  });

  document.querySelectorAll(".saved-size").forEach(node => {
    const idx = Number(node.dataset.index);
    const file = fileArray[idx];
    if (!file) return;

    const estBytes = estimateWebpBytes(file.size, q);
    const estSaved = savingsPercent(file.size, estBytes);
    node.innerText = `Saved (est): ${estSaved}%`;
  });
}

/* ---------- File input & Drag drop ---------- */

input.addEventListener('change', () => {
  fileArray.push(...input.files);
  updateFileList();
});

dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.background = '#e0f7fa'; });
dropArea.addEventListener('dragleave', e => { e.preventDefault(); dropArea.style.background = 'transparent'; });
dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.style.background = 'transparent';
  const dtFiles = Array.from(e.dataTransfer.files);
  fileArray.push(...dtFiles);
  updateFileList();
});

/* ---------- Upload + SSE progress ---------- */

async function upload() {
  if (!fileArray.length) return alert("Select images first");

  clearResults();
  progressEl.value = 0;
  statusEl.innerText = "Uploading...";
  setBusy(true);

  const formData = new FormData();
  fileArray.forEach(f => formData.append('images', f));

  const quality = qualitySlider ? qualitySlider.value : 95;
  formData.append('quality', quality);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/process', true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = (e.loaded / e.total) * 100;
      progressEl.value = Math.min(99, percent);
      statusEl.innerText = `Uploading: ${Math.round(percent)}% (Q${quality})`;
    }
  };

  xhr.onload = () => {
    if (xhr.status !== 200) {
      statusEl.innerText = "Upload failed ❌";
      setBusy(false);
      alert("Upload failed. Please try again.");
      return;
    }

    let data = null;
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (!data || !data.job_id) {
      statusEl.innerText = "Server error ❌";
      setBusy(false);
      alert("Server error: no job id returned.");
      return;
    }

    trackProgress(data.job_id);
  };

  xhr.onerror = () => {
    statusEl.innerText = "Network error ❌";
    setBusy(false);
    alert("Network error. Please try again.");
  };

  xhr.send(formData);
}

function setRealSizeForFile(outName, outSizeBytes) {
  const baseOut = outName.replace(/\.webp$/i, "");

  const rows = fileList.querySelectorAll(".file-item");
  rows.forEach(row => {
    const nameSpan = row.querySelector("span");
    const newSizeNode = row.querySelector(".new-size");
    const savedNode = row.querySelector(".saved-size");
    if (!nameSpan || !newSizeNode || !savedNode) return;

    const baseOrig = nameSpan.innerText.replace(/\.[^/.]+$/i, "");
    if (baseOut !== baseOrig) return;

    // Find original file size from fileArray by name (best-effort)
    const origFile = fileArray.find(f => f.name.replace(/\.[^/.]+$/i, "") === baseOrig);
    const origBytes = origFile ? origFile.size : null;

    newSizeNode.innerText = `New: ${bytesToNice(outSizeBytes)}`;

    if (origBytes) {
      const savedPct = savingsPercent(origBytes, outSizeBytes);
      savedNode.innerText = `Saved: ${savedPct}%`;
    } else {
      savedNode.innerText = `Saved: —`;
    }
  });
}

function trackProgress(jobId) {
  statusEl.innerText = "Processing...";
  progressEl.value = 0;

  const es = new EventSource(`/progress/${jobId}`);
  let total = 0;

  es.onmessage = (evt) => {
    let msg = null;
    try { msg = JSON.parse(evt.data); } catch { return; }

    if (msg.type === "state") {
      if (msg.state === "processing") {
        total = msg.total || 0;
        statusEl.innerText = `Processing 0 / ${total}`;
        progressEl.value = 0;
      } else if (msg.state === "zipping") {
        statusEl.innerText = "Zipping...";
        progressEl.value = 99;
      }
    }

    if (msg.type === "file_done") {
      const processed = msg.processed || 0;
      const t = msg.total || total || 1;
      const pct = Math.min(99, Math.round((processed / t) * 100));

      progressEl.value = pct;
      statusEl.innerText = `Processing ${processed} / ${t}`;

      addResultLine(`✅ ${msg.out_name} — ${bytesToNice(msg.out_size || 0)}`, "ok");
      setRealSizeForFile(msg.out_name, msg.out_size || 0);
    }

    if (msg.type === "file_error") {
      const processed = msg.processed || 0;
      const t = msg.total || total || 1;
      const pct = Math.min(99, Math.round((processed / t) * 100));

      progressEl.value = pct;
      statusEl.innerText = `Processing ${processed} / ${t}`;
      addResultLine(`❌ ${msg.file} — ${msg.error}`, "err");
    }

    if (msg.type === "fatal") {
      es.close();
      statusEl.innerText = "Error ❌";
      setBusy(false);
      alert(msg.error || "Fatal server error");
    }

    if (msg.type === "done") {
      es.close();
      statusEl.innerText = "Done ✔";
      progressEl.value = 100;
      setBusy(false);

      if (msg.download) {
        const link = document.createElement("a");
        link.href = msg.download;
        link.download = "optimized_images.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // reset selection
      fileArray = [];
      updateFileList();
    }
  };

  es.onerror = () => {
    statusEl.innerText = "Progress connection lost…";
  };
}

/* ---------- Dark mode toggle ---------- */
const themeToggle = document.getElementById("themeToggle");

function applyTheme(mode) {
  if (mode === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
}

const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme || "light");

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
}
