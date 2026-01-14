let fileArray = [];

const input = document.getElementById('images');
const dropArea = document.querySelector('.file-drop-area');
const fileList = document.getElementById('file-list');

const progressEl = document.getElementById("progress");
const statusEl = document.getElementById("status");

// Quality slider
const qualitySlider = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");

/* ---------------- Helpers ---------------- */

function bytesToNice(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
    }
    // show 1 decimal for MB+, no decimals for KB
    const digits = (i >= 2) ? 1 : 0;
    return `${val.toFixed(digits)} ${units[i]}`;
}

/**
 * Estimate output WebP size from input bytes + slider quality.
 * This is a heuristic (approx). Exact size depends on image content.
 */
function estimateWebpBytes(inputBytes, quality) {
    // Base ratio by quality: higher quality => larger ratio
    // Tuned for product/photos typical. Works as "reasonable estimate".
    // q=50 ~ 0.18x, q=95 ~ 0.55x, q=100 ~ 0.65x (approx)
    const q = Math.max(50, Math.min(100, Number(quality) || 95));
    const t = (q - 50) / 50; // 0..1
    const ratio = 0.18 + (0.55 - 0.18) * t; // linear ramp 0.18..0.55
    const extra = (q >= 95) ? (q - 95) * 0.02 : 0; // small bump near 95-100
    const finalRatio = Math.min(0.75, ratio + extra);

    // Also clamp so we don't show bigger than original by default
    const estimate = Math.round(inputBytes * finalRatio);
    return Math.max(8 * 1024, Math.min(estimate, inputBytes)); // min 8KB, max original
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

/* ---------------- Render file list ---------------- */

function updateFileList() {
    fileList.innerHTML = '';

    const q = qualitySlider ? Number(qualitySlider.value) : 95;

    fileArray.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);

        // LEFT SIDE (name + original size)
        const left = document.createElement('div');
        left.style.display = "flex";
        left.style.flexDirection = "column";
        left.style.flex = "1";
        left.style.minWidth = "0"; // allow ellipsis properly

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

        // RIGHT SIDE (estimated output size)
        const right = document.createElement('div');
        right.style.display = "flex";
        right.style.flexDirection = "column";
        right.style.alignItems = "flex-end";
        right.style.marginRight = "8px";
        right.style.flexShrink = "0";

        const estBytes = estimateWebpBytes(file.size, q);
        const estText = document.createElement('small');
        estText.className = "est-size";
        estText.dataset.index = String(index);
        estText.innerText = `Estimated: ${bytesToNice(estBytes)} (Q${q})`;
        estText.style.color = "#00acc1";
        estText.style.fontWeight = "600";
        estText.style.marginTop = "2px";

        right.appendChild(estText);

        // Remove button
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

function refreshEstimatesOnly() {
    const q = qualitySlider ? Number(qualitySlider.value) : 95;
    const nodes = document.querySelectorAll(".est-size");
    nodes.forEach((node) => {
        const idx = Number(node.dataset.index);
        const file = fileArray[idx];
        if (!file) return;
        const estBytes = estimateWebpBytes(file.size, q);
        node.innerText = `Estimated: ${bytesToNice(estBytes)} (Q${q})`;
    });
}

/* ---------------- Setup slider ---------------- */

if (qualitySlider && qualityValue) {
    qualityValue.innerText = qualitySlider.value;
    paintQualityTrack();

    qualitySlider.addEventListener('input', () => {
        qualityValue.innerText = qualitySlider.value;
        paintQualityTrack();
        refreshEstimatesOnly(); // dynamic update
    });
}

/* ---------------- File input & DnD ---------------- */

input.addEventListener('change', () => {
    fileArray.push(...input.files);
    updateFileList();
});

dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.style.background = '#e0f7fa';
});

dropArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropArea.style.background = 'transparent';
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.background = 'transparent';
    const dtFiles = Array.from(e.dataTransfer.files);
    fileArray.push(...dtFiles);
    updateFileList();
});

/* ---------------- Upload ---------------- */

function upload() {
    if (!fileArray.length) return alert("Select images first");

    const formData = new FormData();
    fileArray.forEach(f => formData.append('images', f));

    const quality = qualitySlider ? qualitySlider.value : 95;
    formData.append('quality', quality);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/process', true);
    xhr.responseType = 'blob';

    progressEl.value = 0;
    statusEl.innerText = `Uploading... (Q${quality})`;

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            progressEl.value = percent;
            statusEl.innerText = `Uploading: ${Math.round(percent)}% | Quality Q${quality}`;
        }
    };

    xhr.onload = () => {
        if (xhr.status !== 200) {
            const reader = new FileReader();
            reader.onload = () => alert(reader.result || "Server error");
            reader.readAsText(xhr.response);
            statusEl.innerText = "Error ❌";
            return;
        }

        const blob = xhr.response;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'optimized_images.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        progressEl.value = 100;
        statusEl.innerText = "Done ✔";

        fileArray = [];
        updateFileList();
    };

    xhr.onerror = () => {
        statusEl.innerText = "Network error ❌";
        alert("Network error. Please try again.");
    };

    xhr.send(formData);
}
