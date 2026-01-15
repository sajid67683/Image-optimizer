from flask import Flask, render_template, request, send_file, Response, stream_with_context, jsonify
from PIL import Image, ImageOps
import io
import zipfile
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from queue import Queue, Empty
from threading import Thread, Lock

app = Flask(__name__)

# Output settings
TARGET_W = 1600
TARGET_H = 1200
PPI = 150

# In-memory job store (simple & fast)
JOBS = {}
JOBS_LOCK = Lock()

# Worker pool for per-image processing
POOL = ThreadPoolExecutor(max_workers=8)


def clamp_quality(q: int) -> int:
    return max(50, min(100, q))


def process_one_image(img_bytes: bytes, filename: str, quality: int):
    """
    Returns:
    (out_name, out_bytes, out_size_bytes)
    """
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    # Fit inside 1600x1200 without cropping
    img = ImageOps.contain(img, (TARGET_W, TARGET_H), Image.LANCZOS)

    # Pad to exact 1600x1200 (white background, centered)
    img = ImageOps.pad(
        img,
        (TARGET_W, TARGET_H),
        method=Image.LANCZOS,
        color=(255, 255, 255),
        centering=(0.5, 0.5),
    )

    buf = io.BytesIO()
    img.save(
        buf,
        format="WEBP",
        quality=quality,
        method=6,
        optimize=True,
        dpi=(PPI, PPI),
    )
    buf.seek(0)

    out_name = filename.rsplit(".", 1)[0] + ".webp"
    out_bytes = buf.read()
    return out_name, out_bytes, len(out_bytes)


def start_job(files, quality: int):
    job_id = str(uuid.uuid4())
    q = Queue()

    with JOBS_LOCK:
        JOBS[job_id] = {
            "queue": q,
            "status": "running",
            "created": time.time(),
            "done": False,
            "zip_bytes": None,
            "results": [],   # list of {name, out_bytes, out_size}
            "errors": [],
            "total": len(files),
            "processed": 0,
        }

    # Read all uploads into memory once
    tasks = [(f.read(), f.filename) for f in files]

    def worker():
        try:
            total = len(tasks)
            q.put({"type": "state", "state": "processing", "total": total})

            # submit all tasks to thread pool
            futures = []
            for img_bytes, name in tasks:
                futures.append(POOL.submit(
                    process_one_image, img_bytes, name, quality))

            # collect as they finish (in submission order; simple & stable)
            results = []
            processed = 0

            for fut, (_, orig_name) in zip(futures, tasks):
                try:
                    out_name, out_bytes, out_size = fut.result()
                    processed += 1

                    results.append((out_name, out_bytes, out_size))

                    q.put({
                        "type": "file_done",
                        "processed": processed,
                        "total": total,
                        "file": orig_name,
                        "out_name": out_name,
                        "out_size": out_size
                    })
                except Exception as e:
                    processed += 1
                    err_msg = f"{orig_name}: {str(e)}"
                    q.put({
                        "type": "file_error",
                        "processed": processed,
                        "total": total,
                        "file": orig_name,
                        "error": err_msg
                    })
                    with JOBS_LOCK:
                        JOBS[job_id]["errors"].append(err_msg)

            q.put({"type": "state", "state": "zipping"})

            # build zip
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zipf:
                for out_name, out_bytes, out_size in results:
                    zipf.writestr(out_name, out_bytes)

            zip_buffer.seek(0)

            with JOBS_LOCK:
                JOBS[job_id]["zip_bytes"] = zip_buffer.getvalue()
                JOBS[job_id]["done"] = True
                JOBS[job_id]["status"] = "done"
                JOBS[job_id]["processed"] = total

            q.put({"type": "done", "download": f"/download/{job_id}"})
        except Exception as e:
            with JOBS_LOCK:
                JOBS[job_id]["status"] = "error"
                JOBS[job_id]["done"] = True
                JOBS[job_id]["errors"].append(str(e))
            q.put({"type": "fatal", "error": str(e)})

    Thread(target=worker, daemon=True).start()
    return job_id


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():
    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    quality_raw = request.form.get("quality", "95")
    try:
        quality = clamp_quality(int(quality_raw))
    except Exception:
        quality = 95

    job_id = start_job(files, quality)
    return jsonify({"job_id": job_id})


@app.route("/progress/<job_id>")
def progress(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return "Job not found", 404

    q: Queue = job["queue"]

    def event_stream():
        # send initial ping
        yield "event: ping\ndata: {}\n\n"

        while True:
            try:
                msg = q.get(timeout=30)
                yield f"data: {json_dumps(msg)}\n\n"

                if msg.get("type") in ("done", "fatal"):
                    break
            except Empty:
                # keep connection alive
                yield "event: ping\ndata: {}\n\n"

    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")


@app.route("/download/<job_id>")
def download(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)

    if not job:
        return "Job not found", 404
    if not job.get("done") or not job.get("zip_bytes"):
        return "Not ready yet", 425  # Too Early

    return send_file(
        io.BytesIO(job["zip_bytes"]),
        mimetype="application/zip",
        as_attachment=True,
        download_name="optimized_images.zip",
    )

# tiny JSON serializer (no extra dependency)


def json_dumps(obj):
    import json
    return json.dumps(obj, ensure_ascii=False)


if __name__ == "__main__":
    app.run(debug=True, threaded=True)
