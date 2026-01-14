from flask import Flask, render_template, request, send_file
from PIL import Image, ImageOps
import io, zipfile
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)

# Target 4:3 size
TARGET_W = 1200
TARGET_H = 900
PPI = 150

def process_image(img_bytes, filename):
    """
    Resize image to fit 4:3 (without cropping),
    pad with white to exact 4:3, set PPI, return (filename, bytes)
    """
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        # Resize proportionally to fit inside 4:3
        img = ImageOps.contain(img, (TARGET_W, TARGET_H), Image.LANCZOS)

        # Pad to exact 4:3
        img = ImageOps.pad(img, (TARGET_W, TARGET_H), method=Image.LANCZOS, color=(255,255,255), centering=(0.5,0.5))

        # Set PPI
        img.info['dpi'] = (PPI, PPI)

        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=85, method=6, optimize=True, dpi=(PPI, PPI))
        buf.seek(0)
        return filename.rsplit(".", 1)[0] + ".webp", buf.read()
    except Exception as e:
        print(f"Error processing {filename}: {e}")
        return None

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/process", methods=["POST"])
def process():
    files = request.files.getlist("images")
    zip_buffer = io.BytesIO()
    results = []

    # Prepare (bytes, filename) list for threads
    tasks = [(file.read(), file.filename) for file in files]

    # Use ThreadPoolExecutor for parallel processing
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(process_image, b, name) for b, name in tasks]
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
