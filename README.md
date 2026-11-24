# Secret Santa 🎅

Share one link; everyone joins with a name, wish list, notes and a meet-up date (Dec 4, 11 or 13). The organizer draws names and each person reveals their match with a personal code.

```
ADMIN_PIN=1234 npm start   # http://localhost:3000
```

- Edit the budget/notes in the **Organizer** section (PIN = `ADMIN_PIN`).
- Meet-up dates live in `DATES` in `server.js`.
- Data is stored in `data.json`, so host it somewhere with a persistent disk (Render, Fly, Railway, a VPS).
