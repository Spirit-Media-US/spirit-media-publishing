# Spirit Media Publishing — Team Workflow Guide

## The Golden Rule
**Never push to GitHub without previewing locally first.**
Every push triggers a Netlify build that costs real credits.
Preview is free. Pushing costs money.

---

## Daily Workflow

### 1. Start Your Session
Open Terminal and run:
```bash
cd ~/sites/spirit-media-publishing
npm run dev
```
Your local site is now live at **http://localhost:4321**

Keep this Terminal window open the entire session.
Every file you save auto-refreshes in the browser instantly — no cost.

### 2. Make Your Changes
Edit files normally. Save. Check http://localhost:4321.
Repeat until everything looks right.

### 3. Preview & Approve
Before pushing, review every page you touched at localhost:4321.
Get Kevin's approval if the changes are significant.

### 4. Push Once at End of Session
Double-click **push.command** on your Desktop.

The script will:
- Show you exactly what files changed
- Ask you to confirm before doing anything
- Ask for a short description of your changes
- Push everything in one build

**Never push multiple times in one session.**
Make all your changes first, then push once.

---

## Setting Up Your Machine (One Time)

### Step 1 — Clone the repo
```bash
cd ~/sites
git clone git@github.com:Spirit-Media-US/spirit-media-publishing.git
cd spirit-media-publishing
npm install
```

### Step 2 — Copy the push script to your Desktop
```bash
cp ~/sites/spirit-media-publishing/push.command ~/Desktop/push.command
chmod +x ~/Desktop/push.command
```

### Step 3 — Test local dev
```bash
npm run dev
```
Open http://localhost:4321 — you should see the site.

---

## Rules

| ✅ Do | ❌ Don't |
|---|---|
| Preview at localhost:4321 before pushing | Push after every small change |
| Push once at end of session | Push to "test" something |
| Describe your changes when prompted | Push without reviewing locally |
| Pull latest before starting work (`git pull`) | Start work without pulling first |
| Ask Kevin before pushing to production | Push major changes without approval |

---

## Starting Work Each Day
Always pull the latest changes before you start:
```bash
cd ~/sites/spirit-media-publishing
git pull
npm run dev
```
This ensures you're working on the most current version and won't create conflicts.

---

## If Something Goes Wrong
- **Site looks broken after your push** — tell Kevin immediately with a description of what you changed
- **Merge conflict** — don't force push. Stop and message Kevin or the team
- **Netlify build failed** — check the Netlify dashboard and share the error with Kevin

---

## Credit Budget
- Plan: Netlify Personal — 1,000 build minutes/month
- Each build: ~2-3 minutes
- Safe limit: ~300 pushes/month across all team members
- **Target: max 1-2 pushes per person per day**

---

## Questions?
Contact Kevin White — kevin@spiritmedia.us
