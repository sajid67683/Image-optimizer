from flask import Flask, render_template, request, send_file
from PIL import Image, ImageOps
import io, zipfile
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)

# Output settings
TARGET_W = 1600
TARGET_H = 1200
PPI = 150

def clamp_quality(q: int) -> int:
    return max(50, min(100, q))

def process_image(img_bytes: bytes, filename: str, quality: int):
    """
    - Fit image into 1600x1200 (4:3) WITHOUT cropping content
    - Pad with white to exact 1600x1200
    - Save as WebP with user-selected quality (50–100)
    - Set 150 PPI metadata
    """
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        # Resize proportionally to fit inside 1600x1200 (no cropping)
        img = ImageOps.contain(img, (TARGET_W, TARGET_H), Image.LANCZOS)

        # Pad to exact 1600x1200 (white, centered)
        img = ImageOps.pad(
            img,
            (TARGET_W, TARGET_H),
            method=Image.LANCZOS,
            color=(255, 255, 255),
            centering=(0.5, 0.5)
        )

        # Save to WebP (quality from slider)
        buf = io.BytesIO()
        img.save(
            buf,
            format="WEBP",
            quality=quality,     # <-- slider controls this (50–100)
            method=6,
            optimize=True,
            dpi=(PPI, PPI)
        )
        buf.seek(0)

        out_name = filename.rsplit(".", 1)[0] + ".webp"
        return out_name, buf.read()

    except Exception as e:
        print(f"Error processing {filename}: {e}")
        return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():
    files = request.files.getlist("images")

    # Read quality from form (sent by JS)
    quality_raw = request.form.get("quality", "95")
    try:
        quality = clamp_quality(int(quality_raw))
    except Exception:
        quality = 95

    zip_buffer = io.BytesIO()
    results = []

    # Read files into memory (faster for threaded processing)
    tasks = [(file.read(), file.filename) for file in files]

    # Process images in parallel
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(process_image, b, name, quality) for b, name in tasks]
        for f in futures:
            res = f.result()
            if res:
                results.append(res)

    # Write all processed images to ZIP
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zipf:
        for fname, content in results:
            zipf.writestr(fname, content)

    zip_buffer.seek(0)

    if len(results) == 0:
        return "No images were successfully processed.", 400

    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="optimized_images.zip"
    )


if __name__ == "__main__":
    app.run(debug=True, threaded=True)
