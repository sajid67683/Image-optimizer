# Image Optimizer Web App

A browser-based image optimizer built with Flask.  
Uploads multiple images, converts them to **4:3 (1600×1200)**, exports **high-quality WebP**, sets **150 PPI**, and downloads everything as a ZIP.

Designed for **WordPress, e-commerce, and general web use**.

---

## Features

- ✅ Exact **4:3 output (1600 × 1200 px)**
- ✅ **No cropping** — content always preserved and centered
- ✅ **High-quality WebP** export (quality 95)
- ✅ **150 PPI** metadata set
- ✅ Batch upload (100+ images)
- ✅ Fast processing using parallel threads
- ✅ ZIP download of all processed images
- ✅ Clean UI with file list and remove option
- ✅ Frontend separated into HTML, CSS, and JS

---

## Project Structure

# Image Optimizer Web App

A browser-based image optimizer built with Flask.  
Uploads multiple images, converts them to **4:3 (1600×1200)**, exports **high-quality WebP**, sets **150 PPI**, and downloads everything as a ZIP.

Designed for **WordPress, e-commerce, and general web use**.

---

## Features

- ✅ Exact **4:3 output (1600 × 1200 px)**
- ✅ **No cropping** — content always preserved and centered
- ✅ **High-quality WebP** export (quality 95)
- ✅ **150 PPI** metadata set
- ✅ Batch upload (100+ images)
- ✅ Fast processing using parallel threads
- ✅ ZIP download of all processed images
- ✅ Clean UI with file list and remove option
- ✅ Frontend separated into HTML, CSS, and JS

---

## Project Structure

imageoptimizer/
├── app.py
├── requirements.txt
├── templates/
│ └── index.html
├── static/
│ ├── style.css
│ └── script.js
└── README.md


---

## Requirements

- Python **3.10+**
- Pip

Python dependencies are listed in `requirements.txt`.

---

## Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Image-optimizer.git
cd Image-optimizer

### 2. Clone the repository
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

### 3. Clone the repository
pip install -r requirements.txt

### 4. Clone the repository
python app.py

### 5. Clone the repository
http://127.0.0.1:5000
