---
description: Local backend ke smoke tests chalao (health + auth flow)
argument-hint: (optional) endpoint ya area, e.g. "auth"
allowed-tools: Bash(curl:*), Bash(npm:*), Read, PowerShell
---

Tum JobHunt PK ke backend ko locally test kar rahe ho.

## Steps

1. **Services check** — confirm karo Postgres aur Redis chal rahe hain:
   - `Get-Service postgresql-x64-17, Memurai` → dono `Running` hone chahiyein. Agar `Stopped` ho to `Start-Service` karo.

2. **Backend up hai?** — `http://localhost:5000/health` hit karo.
   - Agar connection refuse ho, matlab backend nahi chal raha → user ko batao ke `cd backend && npm run dev` chalayein (backend ko khud background mein mat start karo jab tak user na kahe).

3. **Smoke tests chalao** (PowerShell `Invoke-RestMethod` se), aur har ek ka natija ✅/❌ table mein do:
   - `GET /health` → `{"status":"ok"}` expected
   - `POST /api/auth/register` (random unique email) → 201 + user object (bina `passwordHash` ke)
   - `GET /api/auth/me` (usi session cookie se) → wahi user
   - `POST /api/auth/login` (sahi password) → 200 + user
   - `POST /api/auth/login` (galat password) → 401 `Invalid credentials`
   - Agar `$ARGUMENTS` diya hai to us area pe focus karo.

4. **Report** — ek saaf table do (test | expected | result). Koi fail ho to exact error aur wajah batao, guess mat karo.

## Rules
- Test data unique rakho (email mein timestamp/random suffix) taake "already exists" na aaye.
- Koi test fail ho to usko chupao mat — poora error dikhao.
- Kabhi real/production DB pe test mat chalao — sirf localhost.
