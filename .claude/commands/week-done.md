---
description: Ek week/milestone khatam — verify, security-check, phir commit
argument-hint: week number, e.g. "3"
allowed-tools: Bash(git:*), Bash(npm:*), PowerShell, Read, Grep
---

Tum JobHunt PK ka Week `$ARGUMENTS` milestone finalize kar rahe ho. Spec (`JobHuntPK_Spec` / `CLAUDE.md`) ka roadmap follow karo.

## Steps

1. **Milestone yaad karo** — spec ke roadmap se Week `$ARGUMENTS` ka exact milestone text nikaalo.

2. **Verify** — us week ka kaam sach much chal raha hai yeh end-to-end test karo (sirf tests nahi — actual flow chala ke). `/test` jaisa smoke test bhi chalao.

3. **Security audit** — `/security-check` ki tarah changes ko rules ke against dekho. Koi 🔴 finding ho to commit **mat** karo, pehle user ko batao.

4. **Cleanup** — debug logs, commented code, temp files hata do.

5. **Commit** (sirf jab sab pass ho aur user confirm kare):
   - Agar `master`/`main` branch pe ho to pehle feature branch banao.
   - Clear commit message.
   - Message ke end mein: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

6. **Report** — CLAUDE.md ke rule ke mutabiq yeh line do:
   **"Week N complete. Milestone: [exact milestone text]. Ready for next task."**

## Rules
- Push ya PR sirf jab user explicitly kahe.
- Koi step skip ho ya fail ho to saaf batao — jhoota "done" mat kaho.
