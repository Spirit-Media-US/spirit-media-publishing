# Spirit Media Team Setup Guide
### How to work on our websites with Claude

---

## What this gives you
- Edit any Spirit Media website conversationally through Claude
- No copying and pasting code
- Changes go live automatically in under 60 seconds after pushing

---

## One-Time Setup (do this once per computer)

### Step 1 — Install Git

**Mac:**
1. Open Terminal (Cmd+Space, type "Terminal")
2. Type `git --version` and press Enter
3. If Git is not installed, follow the prompt to install it

**Windows:**
1. Download Git from https://git-scm.com/download/win
2. Run the installer with all default settings
3. Open "Git Bash" from your Start menu — use this as your terminal

---

### Step 2 — Install Desktop Commander

1. Go to https://claude.ai
2. Open any Claude conversation
3. Click the tools/integrations menu and install **Desktop Commander**
4. Follow the installation prompts

---

### Step 3 — Create your sites folder

**Mac (Terminal):**
```
mkdir ~/sites
```

**Windows (Git Bash):**
```
mkdir ~/sites
```

---

### Step 4 — Clone the repos you'll work on

**Spirit Media Publishing:**
```
cd ~/sites
git clone https://github.com/Spirit-Media-US/spirit-media-publishing.git
```

**Father's Heart Bible (when ready):**
```
cd ~/sites
git clone https://github.com/Spirit-Media-US/fathers-heart-bible.git
```

---

### Step 5 — Tell Kevin your file path

After cloning, run this command:

**Mac:**
```
echo ~/sites
```

**Windows:**
```
echo %USERPROFILE%/sites
```

Send Kevin the path it shows (example: `/Users/nathansmith/sites`). He'll make sure Claude can access your files.

---

## Every Work Session

### Before you start — get the latest files
Always run this before working to make sure you have the most current version:

**Spirit Media Publishing:**
```
cd ~/sites/spirit-media-publishing
git pull
```

---

### Working with Claude
1. Open Claude at https://claude.ai
2. Open your Spirit Media project
3. Tell Claude which site you're working on
4. Work conversationally — just describe what you want changed

Example:
> "Change the hero headline to say Born to Publish"
> "Add a new testimonial from John Smith"
> "Make the background of the offerings section stone colored"

Claude makes the changes directly to your files.

---

### When you're done — push live
Run this one command and your changes are live in 45 seconds:

**Spirit Media Publishing:**
```
cd ~/sites/spirit-media-publishing
git add -A && git commit -m "updates" && git push
```

That's it. Netlify automatically deploys the moment you push.

---

## Quick Reference

| Task | Command |
|------|---------|
| Get latest files | `git pull` |
| Push changes live | `git add -A && git commit -m "updates" && git push` |
| Check what changed | `git status` |

---

## Sites & Hosting

| Site | Repo | Host |
|------|------|------|
| spiritmediapublishing.com | spirit-media-publishing | Netlify |
| fathersheartbible.org | fathers-heart-bible | Netlify (coming soon) |

---

## Need Help?

Contact Kevin or start a Claude conversation and describe what you're trying to do.
