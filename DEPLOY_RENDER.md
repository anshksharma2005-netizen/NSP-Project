# Render deployment

## Required repository structure

The Git repository root must contain:

```text
app.py
requirements.txt
templates/index.html
static/app.css
static/app.js
render.yaml
```

If Render reports `templates/index.html` missing, the usual cause is that the `templates` folder was not committed/pushed to GitHub, or Render is pointed at the wrong repository/root directory.

In Render, set **Root Directory** to the directory that contains `app.py`, `templates/`, and `static/`. If those are at the repository root, leave Root Directory blank.

The build command checks for all three web assets and will fail during deployment instead of starting a broken service.

Set these environment variables in Render (never commit the real secret):
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI=https://YOUR-RENDER-DOMAIN/api/google/callback

For persistent SQLite data, configure a persistent disk and set `DB_PATH` to its mounted path, or migrate to a managed database for production.
