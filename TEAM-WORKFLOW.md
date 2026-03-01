# Spirit Media Team Workflow Guide
### How we collaborate on websites without losing each other's work

---

## The Golden Rule
**Always pull before you start. Always push when you're done.**

This keeps everyone's files in sync and prevents conflicts.

---

## Option A — Simple Workflow (Recommended to Start)

This is the easiest approach and works well for a small team where one person
works on a site at a time.

### How it works
- One person works on a site at a time
- Before starting, pull the latest files
- When done, push your changes live
- Tell the team you're done so the next person knows they can start

### Step by step

**Before you start working:**
```
cd ~/sites/spirit-media-publishing
git pull
```

**Tell the team:** "I'm working on spiritmediapublishing.com"

**Work with Claude conversationally** — describe what you want changed.

**When you're done:**
```
git add -A && git commit -m "describe what you changed" && git push
```

**Tell the team:** "Done, you can work on it now"

### Commit message examples
```
git add -A && git commit -m "updated hero headline" && git push
git add -A && git commit -m "added Jim testimonial" && git push
git add -A && git commit -m "fixed mobile menu" && git push
```

### What happens if two people edit at the same time?
Git will warn you when you try to push. Run this to sync first:
```
git pull
git push
```
If there's a conflict, contact Kevin or Nathan to resolve it.

---

## Option B — Branch Workflow (For Multiple People Working Simultaneously)

Use this when multiple team members need to work on the same site at the same time.

### The concept
- `main` = the live published site. Never edit this directly.
- Each person works on their own branch
- When ready, the branch gets merged into main and goes live

### How it works

**Start a new branch before working:**
```
cd ~/sites/spirit-media-publishing
git pull
git checkout -b your-name-edits
```

Example:
```
git checkout -b kevin-edits
git checkout -b nathan-edits
git checkout -b sheila-edits
```

**Work with Claude conversationally** — describe what you want changed.

**When you're done, push your branch:**
```
git add -A && git commit -m "describe what you changed" && git push origin your-name-edits
```

**Then tell Kevin** — he reviews and merges it into main, which triggers Netlify to deploy.

### Kevin merging a branch (one-time setup with Nathan's help)
```
git checkout main
git pull
git merge your-name-edits
git push
```
Netlify deploys automatically in ~12 seconds.

### After your branch is merged, clean up
```
git checkout main
git pull
git branch -d your-name-edits
```

---

## Starting a New Site

When a new site is created, follow these steps:

**1. Nathan or Kevin creates the GitHub repo**
- Go to github.com/Spirit-Media-US
- Click New Repository
- Name it (example: `fathers-heart-bible`)
- Set to Private or Public as needed

**2. Connect to Netlify (Kevin)**
- Go to app.netlify.com
- Click Add New Site → Import from Git
- Select the new repo
- Netlify auto-deploys from that point forward

**3. Each team member clones it**
```
cd ~/sites
git clone git@github.com:Spirit-Media-US/REPO-NAME.git
```

**4. Set remote to SSH (first time only)**
```
cd ~/sites/REPO-NAME
git remote set-url origin git@github.com:Spirit-Media-US/REPO-NAME.git
```

**5. Start working with Claude**
Tell Claude: "I want to work on [site name]" and the path to your local folder.

---

## Our Sites

| Site | Repo | Local Path (Mac) | Local Path (Windows) |
|------|------|-----------------|---------------------|
| spiritmediapublishing.com | spirit-media-publishing | ~/sites/spirit-media-publishing | C:\Users\[name]\sites\spirit-media-publishing |
| fathersheartbible.org | fathers-heart-bible | ~/sites/fathers-heart-bible | C:\Users\[name]\sites\fathers-heart-bible |

---

## Quick Reference Card

| What | Command |
|------|---------|
| Get latest files | `git pull` |
| See what changed | `git status` |
| Push changes live | `git add -A && git commit -m "message" && git push` |
| Start a new branch | `git checkout -b your-name-edits` |
| Switch to main | `git checkout main` |
| Merge a branch | `git merge branch-name` |

---

## Who Does What

| Person | Role |
|--------|------|
| Kevin | Final approval, merges branches, works with Claude on content |
| Nathan | Technical setup, new repos, resolves conflicts |
| Shelly | Content updates via Claude |
| Jim, Sheila, Adam | Content submissions — send requests to Kevin |

---

## Need Help?
- Technical problem → Nathan
- Content change → Work with Claude conversationally
- Conflict you can't resolve → Nathan
