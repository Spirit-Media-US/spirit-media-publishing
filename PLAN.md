# Spirit Media — Dev Environment: Audit + Operational Foundation

## Context

Spirit Media Publishing is setting up a centralized remote dev server (Hetzner CCX33: 8 vCPU, 32GB RAM, 240GB NVMe, Ubuntu 22.04, Ashburn VA) for 3-4 developers to build and maintain websites. Team model: hybrid — assigned builds + specialty roles (UX/UI, SEO) + shared maintenance pool.

This plan has three parts:
1. **Immediate fixes** for the current 5 sites (from the audit)
2. **Operational foundation** — secrets management, system-wide tooling, VPS setup
3. **Future: Scaling architecture** — deferred to a later phase (crawl before running)

> **Nathan's note (2026-03-10):** Hold on the 1000-site scaling — extract the operational foundation work first and shift scaling to a later phase. We need to crawl before running.

---

## Part 1: Immediate Fixes (Current 5 Sites)

### Status: Completed 2026-03-10

| # | Issue | Fix | Status |
|---|-------|-----|--------|
| 1 | CLAUDE.md not in .gitignore (all repos) | Added `CLAUDE.md` to each repo's `.gitignore` | **Done** |
| 2 | 4 repos on `main` instead of `dev` | Stashed changes, switched to `dev` | **Done** |
| 3 | Tailscale logged out | Kevin runs `tailscale login` (requires browser auth) | **Kevin action** |
| 4 | No `~/.ssh/config` for dev server | Created `Host dev` → `deploy@100.114.220.65` | **Done** |
| 5 | artsbyjustin on Astro 4 (all others on 5) | Upgrade to Astro 5 + migrate to `@tailwindcss/vite` | Pending |
| 6 | `allowedHosts` hardcoded to wrong domain | Changed to `allowedHosts: true` (VPS is Tailscale-secured) | **Done** |
| 7 | Inconsistent tooling (biome/lefthook) | Install + configure system-wide on VPS (see Part 2) | Pending |
| 8 | Build scripts inconsistent | Standardize to `astro check && astro build` | Pending |
| 9 | .gitignore incomplete in artsbyjustin + portal-bw | Align with SMP version | Pending |
| 10 | Missing .env.example in artsbyjustin + portal-bw | Add from template | Pending |
| 11 | WOY lefthook on v1, others on v2 | Update to v2 | Pending |

---

## Part 2: Operational Foundation

### A. Secrets Management Strategy

> **Nathan's note:** Sensitive content should NEVER be stored in CLAUDE.md. Need a strategy for managing sensitive info like .env files or managing secrets on the VPS in a better way. Design a robust system that is secure and works with multiple developers using Tailscale.

**Principle:** Secrets live on the VPS as environment variables or in `.env` files — never in CLAUDE.md, never in git repos, never in Claude Code memory files.

**What goes WHERE:**

| Content | Where it lives | Why |
|---------|---------------|-----|
| Sanity project IDs | `.env` files on VPS per site | Not truly secret but should follow same pattern |
| API tokens (Sanity, Netlify, Cloudflare) | `/home/deploy/.secrets` (chmod 640, group `deploy`) | Shared org secrets, sourced in each dev's `.bashrc` |
| GHL location IDs, DKIM selectors | `.env` files on VPS per site | Site-specific, not global |
| SSH keys | `~/.ssh/` on each dev's machine + VPS | Standard SSH key management |
| Bitwarden credentials | Bitwarden Vault only — never on disk | Emergency access / rotation |

**Implementation on VPS:**

1. **Org-level secrets** (shared across all sites and developers):
   ```bash
   # /home/deploy/.secrets (chmod 600, owned by deploy)
   export SANITY_API_TOKEN="..."
   export NETLIFY_PERSONAL_ACCESS_TOKEN="..."
   export CLOUDFLARE_API_TOKEN="..."
   ```
   Loaded via `source ~/.secrets` in `~/.bashrc`

   **Per-developer secrets** (e.g. `ANTHROPIC_API_KEY`) are NOT stored in `~/.secrets`.
   Each developer gets their own Linux user account with their own secrets file:
   - **Phase 1 (SSH approach):** Each dev has `~/.secrets.{name}` (e.g. `~/.secrets.nathan`, chmod 600) sourced in their shell profile before running `claude`
   - **Phase 2 (if containers adopted later):** Pass via `--env-file` or docker-compose `environment:` at container launch
   - **Claude Max:** Key is managed by the service — no local key needed

   This keeps org secrets shared and developer keys isolated. See Part 2G for the full architecture decision.

2. **Per-site secrets** (site-specific):
   ```bash
   # /home/deploy/sites/grace-chapel/.env
   PUBLIC_SITE_URL=https://gracechapel.org
   PUBLIC_SANITY_PROJECT_ID=pmowd8uo
   PUBLIC_SANITY_DATASET=grace-chapel
   ```

3. **`.env.example`** in every repo (committed to git) — documents required vars without values:
   ```bash
   # .env.example — copy to .env and fill in values
   PUBLIC_SITE_URL=
   PUBLIC_SANITY_PROJECT_ID=
   PUBLIC_SANITY_DATASET=
   ```

4. **Access control via Tailscale:**
   - VPS only reachable via Tailscale VPN — no public SSH
   - Each developer gets their own Tailscale identity
   - Kevin controls who can join the Tailscale network
   - Secrets never leave the VPS (builds happen on VPS, not locally)

**What to remove from CLAUDE.md files:**
- Sanity project IDs (move to `.env`)
- Any API tokens or credentials (should never have been there)
- GHL location IDs, account IDs
- Portal PIN codes

**What stays in CLAUDE.md files (project-specific only):**
- Site name, domain, repo URL
- Dev commands (`npm run dev`, `npm run build`)
- Git workflow rules (dev branch, merge policy)
- Architecture notes (what components exist, how they connect)

### B. System-Wide vs Project-Level Config

> **Nathan's note:** Make sure dev stack & pre-commit hook strategy is defined at the proper level on VPS server so all Claude Code instances / projects have the same constraints. This should be system wide not per project. The CLAUDE.md files in each project should document project specific config NOT global config. Make sure this is clearly documented at the system level and for the dev team.

**System-wide (VPS-level) — configured ONCE for all developers and projects:**

| What | Where | Manages |
|------|-------|---------|
| Node.js version | `nvm` or system install on VPS | Consistent runtime for all sites |
| Biome (linter/formatter) | Global install: `npm i -g @biomejs/biome` | Puts `biome` on `$PATH` — per-repo `biome.json` is the source of truth for rules |
| Lefthook (git hooks) | Global install: `npm i -g lefthook` v2 | Puts `lefthook` on `$PATH` — per-repo `lefthook.yml` is the source of truth for hooks |
| Claude Code | Global install: `npm i -g @anthropic-ai/claude-code` | Available in every directory |
| Claude Code settings | `/home/deploy/.claude/settings.json` | MCP servers, global preferences |
| Claude Code system CLAUDE.md | `/home/deploy/CLAUDE.md` | Global dev rules, workflow, team info |
| Secrets | `/home/deploy/.secrets` | API tokens, loaded via .bashrc |
| Git config | `/home/deploy/.gitconfig` | Commit defaults, aliases |

**Project-level (per-repo) — documents what's unique about THIS site:**

| What | Where | Contains |
|------|-------|----------|
| CLAUDE.md | `<repo>/CLAUDE.md` (gitignored) | Site name, domain, dev commands, architecture notes |
| .env | `<repo>/.env` (gitignored) | Site-specific env vars (Sanity dataset, site URL) |
| .env.example | `<repo>/.env.example` (committed) | Template of required env vars |
| biome.json | `<repo>/biome.json` (committed) | **Source of truth** for lint/format rules in this repo |
| lefthook.yml | `<repo>/lefthook.yml` (committed) | **Source of truth** for git hooks in this repo |

**Key rules:**
- **Tooling binaries** (biome, lefthook, claude) are installed globally so they're on `$PATH` everywhere. No global config files — the global install is a convenience, not a config source.
- **Tooling config** (`biome.json`, `lefthook.yml`) lives in each repo and is committed to git. This is the single source of truth. Use a consistent template across repos for uniformity, but each repo owns its config.
- **CLAUDE.md files** should ONLY contain project-specific information. Global dev rules go in the system-level `/home/deploy/CLAUDE.md`.

### C. VPS Setup Checklist

| # | Task | Details |
|---|------|---------|
| 1 | Tailscale login | Kevin runs `tailscale login` |
| 2 | **Create Linux user accounts** | One account per developer (kevin, nathan, etc.) with sudo access. Shared `deploy` group for org secrets. |
| 3 | SSH config | Each dev adds `Host dev` to `~/.ssh/config` pointing to their user |
| 4 | Node.js | Install Node 22 LTS via nvm on VPS (system-wide or per-user) |
| 5 | Global tooling | `npm i -g @biomejs/biome lefthook @anthropic-ai/claude-code` |
| 6 | Per-repo lefthook + biome configs | Ensure each repo has `lefthook.yml` and `biome.json` (use standard template) |
| 7 | Org secrets file | Create `/home/deploy/.secrets` (chmod 640, group `deploy`), source in each user's `.bashrc` |
| 8 | Per-developer secrets | Create `~/.secrets.{name}` per user (chmod 600) for `ANTHROPIC_API_KEY` etc. |
| 9 | System CLAUDE.md | Create `/home/deploy/CLAUDE.md` with global dev rules |
| 10 | Claude Code MCP servers | Configure in `/home/deploy/.claude/settings.json` |
| 11 | Per-site .env files | Create `.env` for each of the 5 existing sites |
| 12 | Clean up CLAUDE.md files | Remove sensitive content, keep project-specific only |
| 13 | Developer onboarding doc | Document all of the above for new devs |

### D. MCP Servers on the VPS

Install official MCP servers so Claude Code can directly manage content, deployments, and DNS:

| Service | Package | What It Enables |
|---------|---------|-----------------|
| **Sanity** | Remote: `https://mcp.sanity.io` | Create/update/publish content, GROQ queries, dataset management |
| **Netlify** | `@netlify/mcp` (Node 22+) | Create sites, trigger deploys, manage env vars |
| **Cloudflare** | `@cloudflare/mcp-server-cloudflare` | Manage DNS records, Pages, Workers, analytics |

**Config** (`/home/deploy/.claude/settings.json`):
```json
{
  "mcpServers": {
    "sanity": {
      "type": "remote",
      "url": "https://mcp.sanity.io",
      "headers": { "Authorization": "Bearer $SANITY_API_TOKEN" }
    },
    "netlify": {
      "command": "npx",
      "args": ["-y", "@netlify/mcp"],
      "env": { "NETLIFY_PERSONAL_ACCESS_TOKEN": "$NETLIFY_PAT" }
    },
    "cloudflare": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server-cloudflare"],
      "env": { "CLOUDFLARE_API_TOKEN": "$CF_API_TOKEN" }
    }
  }
}
```

All API tokens come from env vars (sourced from `~/.secrets`) — never hardcoded.

### E. Developer Onboarding

**For Nathan or new devs:**
1. Get Tailscale VPN access (Kevin approves in Tailscale admin)
2. Kevin creates a Linux user account on the VPS (see Part 2C, step 2)
3. SSH into the VPS: `ssh {username}@100.114.220.65` (or via `Host dev` shortcut)
4. Set personal `ANTHROPIC_API_KEY` in `~/.secrets.{name}` (chmod 600), or use Claude Max (see Part 2A)
5. Run `claude` from any site directory — system config + MCP servers are already there

**Team structure:**
- Kevin: final approval, content decisions, merges to main
- Nathan: executes builds on VPS, monitors deploys, resolves conflicts, architecture decisions
- Future devs: assigned sites, run Claude Code on VPS with shared context

### F. Claude Code Memory Files (How Claude "Remembers")

Claude Code reads `CLAUDE.md` files automatically at startup. There are three levels, and each developer needs to understand which file to put things in:

| File | Where it lives | Scope | Example content |
|------|---------------|-------|-----------------|
| `~/.claude/CLAUDE.md` | Developer's local machine | Every Claude Code session, every project | VPS connection info ("bethel"), personal preferences |
| `/home/deploy/CLAUDE.md` | On the VPS | All projects on the VPS | Global dev rules, workflow, team info |
| `<repo>/CLAUDE.md` | Inside each repo (gitignored) | That specific project only | Site name, domain, dev commands, architecture notes |

**Setting up the local memory file (each developer does this once):**

1. Create the file: `~/.claude/CLAUDE.md` (on your Mac/PC, not on the VPS)
2. Add VPS connection info so Claude always knows how to reach the server:

   ```markdown
   # Dev Server (Bethel)

   - SSH: `ssh {username}@100.114.220.65`
   - SSH shortcut: `ssh bethel` (if configured in ~/.ssh/config)
   - Platform: Hetzner CCX33, Ubuntu 22.04, Ashburn VA
   - Access: Tailscale VPN only — must be connected to Tailscale first

   ## What's on Bethel

   - All Spirit Media sites live in /home/deploy/sites/
   - Global tools: biome, lefthook, claude (all on $PATH)
   - MCP servers: Sanity, Netlify, Cloudflare
   - My secrets: ~/.secrets.{name} (ANTHROPIC_API_KEY etc.)
   ```

3. Close and reopen Claude Code Desktop. Ask "How do I connect to bethel?" — if it knows, it worked.

**Key rule:** Never put secrets (API keys, tokens, passwords) in any CLAUDE.md file. Those go in `.secrets` files on the VPS (see Part 2A).

### G. Dev Environment Architecture Decision

> **Decision (2026-03-10):** Start with SSH user accounts. Migrate to containers when a concrete pain point forces it.

#### What We Evaluated

| Approach | How It Works | Verdict |
|----------|-------------|---------|
| **Claude Code Desktop + SSH** | Desktop app SSHes into VPS, Claude Code runs there. Each dev gets a Linux user account. | **Phase 1 — do this now** |
| **claudebox (containerized)** | Each dev gets an isolated Docker container on VPS with their own Claude Code instance, filesystem, ports, env. Desktop SSHes into the container. | **Phase 2 — adopt when it hurts** |
| **VS Code / Code Server** | Browser-based IDE on VPS | **Ruled out** — Kevin already has Claude Code Desktop (Max plan). Code Server adds complexity without benefit. |
| **Local dev (no VPS)** | Each dev runs everything on their own machine | **Ruled out** — inconsistent environments, can't share secrets safely, no centralized MCP servers |

#### Why SSH First

For a 2-3 person team, containers add complexity that isn't justified yet:

- **Zero setup complexity** — just add Linux users, standard tooling
- **No Docker overhead** — full use of VPS resources (8 vCPU, 32GB)
- **Nothing extra to maintain** — it's just Linux
- **Easier to debug** — Kevin is still learning, fewer moving parts
- **Kevin already understands this model** — SSH is familiar

**Mitigations for SSH risks:**
- Each dev works on their own branch (enforced by workflow)
- Separate Linux users with their own home directories
- Per-user secrets files (`~/.secrets.kevin`, `~/.secrets.nathan`, chmod 600)
- Org-wide secrets in `/home/deploy/.secrets` (shared read access via group)

#### Concurrent Developer Model

This setup supports multiple developers working on the VPS at the same time. Here's how:

**What works concurrently (no coordination needed):**
- Multiple developers SSH in with separate Linux user accounts simultaneously
- Each runs their own Claude Code instance from their own shell session
- Each works on their own branch — git handles merge conflicts when branches converge
- Astro auto-increments dev server ports if the default (4321) is busy — no manual port management needed
- Each has their own secrets file — no leakage

**What requires sequencing:**
- **VPS setup (Part 2C checklist)** — one person does this first (Kevin or Nathan). Creating user accounts, installing global tooling, configuring secrets. This is a one-time foundation step.
- **Same file on same branch** — two Claude instances editing the same file on the same branch will conflict. The branch-per-developer workflow prevents this.
- **Heavy builds** — two simultaneous `astro build` runs on 32GB RAM is fine. Three or four concurrent builds may cause resource pressure — worth monitoring but not blocking.

**Bottom line:** After the one-time VPS setup, developers can work independently and concurrently without stepping on each other.

#### What Could Go Wrong (SSH Approach)

| Risk | Likelihood (2-3 devs) | Mitigation |
|------|----------------------|------------|
| File conflicts (two Claudes edit same file) | Low — separate branches | Git handles this; lefthook pre-commit catches issues |
| Port collisions | Low | Astro auto-increments ports; not a real risk |
| Runaway process eats all RAM | Medium | `ulimit` per user, monitoring |
| Destructive command (`rm -rf`, `git reset --hard`) | Low | Separate user accounts, git reflog as safety net |
| Secrets leakage between devs | Low | Per-user secrets files, org secrets read-only |

#### When to Migrate to Containers (claudebox)

Move to containers when ANY of these become true:
- **4+ concurrent developers** on the VPS
- **Onboarding takes more than 30 minutes** per new dev
- **A dev needs a different Node version** or incompatible toolchain
- **Want to run `claude --dangerously-skip-permissions`** safely (containers make this viable)
- **Want Claude Code to operate fully autonomously** without blast-radius concerns
- **An actual incident** — one dev's work affects another's

#### What claudebox Gives Us (When We Need It)

[claudebox](https://github.com/RchGrav/claudebox) is a third-party Docker tool (not an Anthropic product) that provides:
- Per-developer isolated containers with pre-configured dev profiles
- Multi-instance support on a single host
- Network isolation with project-specific firewall allowlists
- Persistent configuration across container restarts
- Cross-platform support

**Claude Code can manage containers.** If running on the VPS host, Kevin can ask Claude to check container status, restart containers, view resource usage, or spin up containers for new devs. Docker CLI is well within Claude Code's capabilities.

**Resource estimate for containers (Hetzner CCX33: 8 vCPU, 32GB RAM):**
- ~500MB-1GB baseline per container
- 3-4 concurrent containers = 2-4GB overhead
- Leaves 28-30GB for actual dev work — viable but tighter

#### What Was Ruled Out and Why

| Option | Why Ruled Out |
|--------|--------------|
| **VS Code / Code Server on VPS** | Kevin has Claude Code Desktop (Max plan). Adding a browser IDE is redundant complexity. |
| **Local development** | No centralized secrets, inconsistent environments, can't share MCP server configs. VPS is the right call. |
| **Containers from day one** | Adds Docker maintenance, networking complexity, and debugging difficulty before the team needs it. Premature optimization. |
| **Shared `deploy` user for everyone** | Secrets leakage, no audit trail of who did what, can't set per-user resource limits. Separate Linux users are trivial to set up. |
| **Anthropic official devcontainer** | Designed around VS Code, not Claude Code Desktop SSH workflow. Better fit if team adopts VS Code later. |

---

## Part 2H: Dev Pipeline

> **Focus:** CI/CD, build validation, and deploy automation — the pipeline between `git push` and production.

### Current State

- Biome + Lefthook run **locally only** — nothing enforces quality on push
- No CI — a broken build can land on `main` and go straight to production
- No branch protection — PRs can be merged without any checks passing
- No staging — `dev` branch has a Netlify preview URL but it doesn't mirror production config
- No per-PR deploy previews — reviewers must check out the branch to see changes
- Sanity → Netlify webhook not wired (content publishes don't trigger rebuilds)
- `.env.example` still references old SFTP stack — blocks new dev onboarding
- **Build environment split:** CI runs on GitHub Actions runners, dev servers run on VPS, deploys happen via Netlify from the repo. The VPS is for development only, not the build/deploy path.

### Pipeline Items (Priority Order)

Ordered by dependency and impact — each item builds on the previous.

| # | Item | What | Why This Order | Effort |
|---|------|------|----------------|--------|
| 1 | **Add GitHub Actions CI** | Workflow on PR: `npm ci` → `biome check` → `astro check` → `astro build` | Foundation — without CI, nothing else gates what lands on `main` | ~30 min |
| 2 | **Enable branch protection on `main`** | Require CI to pass before merge. No direct pushes to `main` | CI is useless if PRs can bypass it | 5 min, GitHub settings |
| 3 | **Add `astro check` to lefthook pre-push** | Catches TypeScript errors before they even hit CI | Shift-left — faster feedback loop, pairs with CI | 10 min |
| 4 | **Update `.env.example` files** | Remove old SFTP vars, document actual required vars (Sanity, site URL) | Unblocks onboarding — a new dev can't set up without this | 10 min |
| 5 | **Enable Netlify deploy previews per PR** | Every PR gets a live preview URL for reviewers | Depends on CI being in place to be useful | 15 min, Netlify config |
| 6 | **Staging environment** | `dev` branch deploys to a staging URL with production-equivalent config (same env vars, same build flags, same Sanity dataset) | Without this, the first time code runs in production config is production itself | 20 min |
| 7 | **Wire Sanity → Netlify webhook** | Add build hook URL in Sanity so content publishes trigger a Netlify rebuild | Important but it's a dashboard toggle, not a pipeline risk | 5 min, dashboard config |
| 8 | **Monitor build minutes** | Netlify free tier = 1000 min/month. Add alert at 80% usage | Only matters after the above are generating builds | 10 min |

### Staging Environment Details

The `dev` branch already gets a Netlify preview URL, but it's not true staging because:
- It may use different env vars than production
- Build flags may differ
- No one is systematically testing on it before merging to `main`

**What staging means here:**
- `dev` branch deploys to `staging.{domain}` (or Netlify's auto-generated URL)
- Uses the **same** Sanity dataset, env vars, and build config as production
- Every PR merges to `dev` first → verified on staging → then `dev` merges to `main`
- Kevin or Nathan signs off on staging before promoting to production

This is not a separate infrastructure — it's enforcing a workflow on the Netlify preview that already exists.

### Not Doing Now

- **Automated Lighthouse / performance checks** — nice to have, not blocking anything today.
- **Monorepo CI matrix** — only relevant if repos consolidate later (Part 3 territory).

### Where This Fits in the Rollout

| Phase | Pipeline Items | Rationale |
|-------|---------------|-----------|
| **Phase 1** (VPS foundation) | #4 `.env.example`, #7 Sanity webhook | Quick wins during setup |
| **Phase 2** (repo standardization) | #1 CI, #2 Branch protection, #3 Lefthook pre-push | Core pipeline — do first in Phase 2 |
| **Phase 2** (after CI is live) | #5 Deploy previews, #6 Staging, #8 Build minutes | Layer on once CI is gating merges |

---

## Part 3: Scaling to 1000+ Sites (DEFERRED)

> **Nathan's note:** Crawl before running. This section is the long-term vision — do NOT implement until the operational foundation (Part 2) is solid and the current 5 sites are stable.

**When to revisit:** After all 5 existing sites are running on the VPS with the new operational foundation, and the team has successfully onboarded 2+ developers.

**Key concepts (for future reference):**
- Template-driven site factory (3-5 Astro templates)
- Site registry (JSON/SQLite on VPS)
- Shared Sanity project with per-site datasets
- Provisioning CLI (`smp new --template ministry --domain gracechapel.org`)
- Shared `node_modules` via symlinks (avoid 250GB+ storage)
- Cloudflare Pages for hosting at scale (unlimited free sites)

Full architecture details are in the Google Doc version of this plan.

---

## Phased Rollout (Revised)

| Phase | What | Timeline | Status |
|-------|------|----------|--------|
| **Phase 0** | Fix the 11 audit issues (Part 1) | Session 1 | **4 of 11 done** |
| **Phase 1** | VPS operational foundation (Part 2A-G) — secrets, tooling, SSH user accounts, onboarding | Week 1 | Pending |
| **Phase 1.5** | Dev pipeline (Part 2H) — CI, branch protection, deploy previews | Week 1-2 | Pending |
| **Phase 2** | Complete remaining Part 1 fixes (issues 5-11) on VPS | Week 2 | Pending |
| **Phase 3** | Stabilize all 5 sites on new foundation | Weeks 3-4 | Pending |
| **Phase 3+** | _Containers (claudebox) — adopt when trigger conditions met (see Part 2G)_ | _When needed_ | _Deferred_ |
| **Phase 4** | _Scaling architecture (Part 3) — revisit after Phase 3_ | _TBD_ | _Deferred_ |

---

## Verification

- `git status` in each repo → correct branch, CLAUDE.md ignored ✅
- `ssh dev` → connects to remote server (after Tailscale login)
- `npm run dev` in each repo → no allowedHosts errors ✅
- `cat /home/deploy/.secrets` → secrets file exists, not world-readable
- `biome --version` on VPS → installed globally (binary on `$PATH`)
- `lefthook version` on VPS → v2 installed globally (binary on `$PATH`)
- Each repo has its own `biome.json` and `lefthook.yml` (committed)
- CLAUDE.md files contain NO sensitive IDs or tokens
