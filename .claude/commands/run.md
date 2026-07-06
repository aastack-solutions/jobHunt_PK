---
description: Poora local stack chalao (services check + backend, optionally frontend/parser)
argument-hint: (optional) "all" | "frontend" | "parser"
allowed-tools: Bash(npm:*), PowerShell, Read
---

Tum JobHunt PK ka local stack chala rahe ho.

## Steps

1. **Services** — `Get-Service postgresql-x64-17, Memurai` check karo. `Stopped` ho to `Start-Service` karo. Dono `Running` confirm karo.

2. **Backend** — `cd backend && npm run dev` background mein start karo. `Backend listening on port 5000` + `Redis connected` ka intezaar karo. Phir `http://localhost:5000/health` se confirm karo.

3. **Agar `$ARGUMENTS` mein "all" ya "frontend"** — alag terminal/background mein `cd frontend && npm run dev` chalao (port 5173).

4. **Agar `$ARGUMENTS` mein "all" ya "parser"** — `cd resume-parser && uvicorn main:app --port 8000` chalao.

5. **Report** — har service ka status + URL do (backend :5000, frontend :5173, parser :8000).

## Rules
- Port already-in-use aaye to user ko batao, dobara blindly start mat karo.
- `.env` ke localhost values use karo (Railway internal URLs local pe kaam nahi karte).
- Background process start karne ke baad uska output check karke confirm karo ke sach much ready hai.
