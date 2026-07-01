# resume-parser/CLAUDE.md

Rules for everything inside `resume-parser/`. Read before touching any file here.

## Pinned Package Versions

```
fastapi==0.138.0
uvicorn==0.49.0
pymupdf==1.27.2.3
python-docx==1.2.0
python-multipart==0.0.32
```

No other packages. Do not add spaCy, NLTK, or any ML library — regex + keyword list only.

## Runtime

Python 3.13. Dockerfile: `FROM python:3.13-slim`

## This Service Has No Public URL

Railway setting: **Public networking = DISABLED**.
Reachable only from the backend service via `http://resume-parser.railway.internal:8000`.

## Two Endpoints Only

```python
POST /parse   ← accepts multipart file upload, returns parsed resume data
GET  /health  ← returns {"status": "ok", "service": "resume-parser"}
```

Never add other endpoints.

## Authentication on /parse

Every request to `/parse` must include `X-Internal-Key` header matching `INTERNAL_SECRET` env var.
Return 401 immediately if header is missing or wrong.

```python
if x_internal_key != INTERNAL_SECRET:
    raise HTTPException(401, "Unauthorized")
```

## File Validation — Magic Bytes, Not Filename

```python
PDF_MAGIC  = b'%PDF-'
DOCX_MAGIC = b'PK\x03\x04'

def validate_file_type(content: bytes) -> str:
    if content[:5] == PDF_MAGIC:  return 'pdf'
    if content[:4] == DOCX_MAGIC: return 'docx'
    raise HTTPException(400, "Invalid file. Only real PDF or DOCX accepted.")
```

Never trust the filename extension or the MIME type header from the client.
Check the actual file bytes.

## File Size Limit

```python
if len(content) > 10 * 1024 * 1024:
    raise HTTPException(400, "File too large. Max 10 MB.")
```

## Temp File Cleanup — Safe Pattern

```python
tmp_path = None   # assign before try
try:
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_type}") as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    # ... process file
finally:
    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)  # always clean up, even on exception
```

Never let temp files accumulate. The `finally` block must always run.

## Image-Based PDF Detection

```python
def extract_pdf(path):
    doc  = fitz.open(path)
    text = "".join(p.get_text() for p in doc)
    is_image = len(text.strip()) < 100 and len(doc) > 0
    return text.lower(), is_image
```

If `is_image = True`, return immediately without attempting skill extraction:
```python
return {
    "success": False, "isImageBased": True,
    "warning": "PDF appears image-based. Please enter skills manually.",
    "skills": [], "experienceYears": 0, "seniorityLevel": "junior"
}
```

Never fail silently on image-based PDFs. The user must be told.

## Skill Extraction — Regex Only, No ML

Use word-boundary regex against a static skill list. Do not use spaCy, NLTK, or any ML model.

```python
def extract_skills(text):
    return list({s for s in SKILLS if re.search(r'\b' + re.escape(s) + r'\b', text)})
```

The `\b` word boundary prevents "r" from matching "react" and similar false positives.

## Skills List

The master skill list is defined in `main.py`. It covers: programming languages, frontend frameworks, backend frameworks, databases, cloud/devops, AI/ML, mobile, design, and tools. Do not remove skills from this list. You may add new skills relevant to the team's domain.

## Experience Years Extraction

Use multiple regex patterns. Take the maximum found (capped at 40):
```python
patterns = [
    r'(\d+)\+?\s*years?\s+of\s+(?:professional\s+)?experience',
    r'(\d+)\+?\s*years?\s+experience',
    r'experience[:\s]+(\d+)\+?\s*years?',
]
found = [int(m.group(1)) for p in patterns for m in re.finditer(p, text) if int(m.group(1)) <= 40]
return max(found) if found else 0
```

## Seniority Inference

```python
def seniority(years, skill_count):
    if years >= 7 or skill_count >= 18: return "senior"
    if years >= 3 or skill_count >= 9:  return "mid"
    return "junior"
```

## Response Shape

```python
# On success:
{ "success": True, "isImageBased": False, "skills": [...], "experienceYears": 3,
  "seniorityLevel": "mid", "email": "user@example.com", "skillCount": 12 }

# On image-based PDF:
{ "success": False, "isImageBased": True, "warning": "...", "skills": [], "experienceYears": 0, "seniorityLevel": "junior" }
```

## Dockerfile

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```