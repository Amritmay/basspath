# BassPath 🎸

A gamified, mobile-first companion web app for working through the free
[StudyBass.com](https://www.studybass.com/) bass guitar curriculum, a little every day.

- **Learning path**: all 3 StudyBass Fundamentals courses (27 units, 166 lessons) as a winding path. Each lesson deep-links to StudyBass for the actual material.
- **Daily goal + finish-line estimate**: pick minutes per day and see the date you'll finish everything, both from your goal and from your real pace.
- **Streaks, XP, levels, picks (currency)**, streak freezes, unlockable color themes.
- **Daily quests and a chest**, plus 18 badges.
- **Original quizzes**: a quick check per lesson, a checkpoint per unit, and "test out" to skip a unit you already know.
- **Practice tools**: session timer, metronome with tap tempo, open-string tuning reference.
- **Generated drills**: fretboard notes, bass clef reading, intervals, keys and the circle of fifths, ear training.
- Works offline, installable on iOS and Android (PWA), light and dark mode. No account: progress is stored on the device (with backup/restore).

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. To try it on your phone, use your computer's LAN IP on the same Wi-Fi.

## Deploy to GitHub Pages

1. Create a new public repo (e.g. `basspath`) on GitHub.
2. Push this folder to it:
   ```bash
   git init && git add . && git commit -m "BassPath"
   git branch -M main
   git remote add origin https://github.com/<you>/basspath.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages**, set **Source: Deploy from a branch**, pick `main` / `(root)`, and save.
4. The app goes live at `https://<you>.github.io/basspath/` within a minute or two.

When you change app files later, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Install on a phone

- **iPhone (Safari)**: open the link, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome)**: open the link, tap **Install app** (or ⋮ → **Add to Home screen**).

## Content and credit

BassPath is an unofficial, fan-made study companion. It does **not** copy StudyBass lesson content:
it lists lesson titles and links to each lesson on StudyBass.com, where all lessons, exercises and
songs are © Leading Tone Media, LLC. The quiz questions and drills in this app are original.
Not affiliated with or endorsed by StudyBass. If StudyBass helps you, please
[support it](https://www.studybass.com/support/).
