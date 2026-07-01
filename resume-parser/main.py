"""JobHunt PK resume parser — FastAPI service.

Two endpoints only: POST /parse and GET /health. No public URL; the backend
reaches it over railway.internal and authenticates with X-Internal-Key.
Skill extraction is word-boundary regex against a static list — no ML.
"""
import os
import re
import tempfile

import fitz  # pymupdf
from docx import Document
from fastapi import FastAPI, File, Header, HTTPException, UploadFile

app = FastAPI(title="JobHunt PK Resume Parser")

INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")

PDF_MAGIC = b"%PDF-"
DOCX_MAGIC = b"PK\x03\x04"
MAX_BYTES = 10 * 1024 * 1024  # 10 MB

# Master skill list — programming languages, frameworks, databases, cloud,
# AI/ML, mobile, design, and tools. Lowercased; matched with word boundaries.
SKILLS = [
    # Languages
    "javascript", "typescript", "python", "java", "c++", "c#", "go", "golang",
    "rust", "ruby", "php", "swift", "kotlin", "scala", "r", "dart", "elixir",
    "bash", "sql", "html", "css", "sass",
    # Frontend
    "react", "next.js", "vue", "nuxt", "angular", "svelte", "redux", "tailwind",
    "tailwind css", "bootstrap", "vite", "webpack", "jquery",
    # Backend
    "node.js", "express", "nestjs", "django", "flask", "fastapi", "spring",
    "spring boot", "laravel", "rails", "ruby on rails", "graphql", "rest",
    "rest apis", "grpc", "prisma", "sequelize",
    # Databases
    "postgresql", "postgres", "mysql", "sqlite", "mongodb", "redis",
    "elasticsearch", "cassandra", "dynamodb", "firebase", "supabase",
    # Cloud / DevOps
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform",
    "ansible", "jenkins", "github actions", "gitlab ci", "ci/cd", "nginx",
    "linux", "bullmq", "rabbitmq", "kafka",
    # AI / ML
    "machine learning", "deep learning", "tensorflow", "pytorch", "keras",
    "scikit-learn", "pandas", "numpy", "nlp", "opencv", "llm",
    # Mobile
    "react native", "flutter", "android", "ios", "xamarin",
    # Design
    "figma", "sketch", "adobe xd", "photoshop", "illustrator", "ui/ux",
    # Tools
    "git", "jira", "jest", "cypress", "playwright", "postman", "agile", "scrum",
]

EXPERIENCE_PATTERNS = [
    r"(\d+)\+?\s*years?\s+of\s+(?:professional\s+)?experience",
    r"(\d+)\+?\s*years?\s+experience",
    r"experience[:\s]+(\d+)\+?\s*years?",
]

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


def validate_file_type(content: bytes) -> str:
    """Trust the bytes, never the filename or client MIME type."""
    if content[:5] == PDF_MAGIC:
        return "pdf"
    if content[:4] == DOCX_MAGIC:
        return "docx"
    raise HTTPException(400, "Invalid file. Only real PDF or DOCX accepted.")


def extract_pdf(path: str):
    doc = fitz.open(path)
    text = "".join(p.get_text() for p in doc)
    is_image = len(text.strip()) < 100 and len(doc) > 0
    return text.lower(), is_image


def extract_docx(path: str):
    doc = Document(path)
    text = "\n".join(p.text for p in doc.paragraphs)
    return text.lower(), False


def extract_skills(text: str):
    return sorted({s for s in SKILLS if re.search(r"\b" + re.escape(s) + r"\b", text)})


def extract_experience(text: str) -> int:
    found = [
        int(m.group(1))
        for p in EXPERIENCE_PATTERNS
        for m in re.finditer(p, text)
        if int(m.group(1)) <= 40
    ]
    return max(found) if found else 0


def seniority(years: int, skill_count: int) -> str:
    if years >= 7 or skill_count >= 18:
        return "senior"
    if years >= 3 or skill_count >= 9:
        return "mid"
    return "junior"


@app.get("/health")
def health():
    return {"status": "ok", "service": "resume-parser"}


@app.post("/parse")
async def parse(file: UploadFile = File(...), x_internal_key: str = Header(None)):
    if x_internal_key != INTERNAL_SECRET:
        raise HTTPException(401, "Unauthorized")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(400, "File too large. Max 10 MB.")

    file_type = validate_file_type(content)

    tmp_path = None  # assign before try so finally can always clean up
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_type}") as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        if file_type == "pdf":
            text, is_image = extract_pdf(tmp_path)
        else:
            text, is_image = extract_docx(tmp_path)

        if is_image:
            return {
                "success": False,
                "isImageBased": True,
                "warning": "PDF appears image-based. Please enter skills manually.",
                "skills": [],
                "experienceYears": 0,
                "seniorityLevel": "junior",
            }

        skills = extract_skills(text)
        years = extract_experience(text)
        email_match = EMAIL_RE.search(text)

        return {
            "success": True,
            "isImageBased": False,
            "skills": skills,
            "experienceYears": years,
            "seniorityLevel": seniority(years, len(skills)),
            "email": email_match.group(0) if email_match else None,
            "skillCount": len(skills),
        }
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)  # always clean up, even on exception
