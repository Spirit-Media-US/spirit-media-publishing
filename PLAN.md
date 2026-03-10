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
| API tokens (Sanity, Netlify, Cloudflare) | `/home/deploy/.secrets` (chmod 600, sourced in `.bashrc`) | Scoped to `deploy` user, supports `export` syntax |
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
   Instead, each developer's Claude instance gets its own key injected at the container/session level:
   - **Container-based (claude-box / devcontainer):** Pass via `--env-file` or docker-compose `environment:` at launch
   - **Direct SSH sessions:** Developer sources their own key file (e.g. `~/.secrets.nathan`, chmod 600) in their shell before running `claude`
   - **Claude Max:** Key is managed by the service — no local key needed

   This keeps org secrets shared and developer keys isolated, regardless of whether everyone uses the `deploy` user or separate accounts.

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
| 2 | SSH config | Each dev adds `Host dev` to `~/.ssh/config` |
| 3 | Node.js | Install Node 22 LTS via nvm on VPS |
| 4 | Global tooling | `npm i -g @biomejs/biome lefthook @anthropic-ai/claude-code` |
| 5 | Per-repo lefthook + biome configs | Ensure each repo has `lefthook.yml` and `biome.json` (use standard template) |
| 6 | Secrets file | Create `/home/deploy/.secrets` (chmod 600), source in `.bashrc` |
| 7 | System CLAUDE.md | Create `/home/deploy/CLAUDE.md` with global dev rules |
| 8 | Claude Code MCP servers | Configure in `/home/deploy/.claude/settings.json` |
| 9 | Per-site .env files | Create `.env` for each of the 5 existing sites |
| 10 | Clean up CLAUDE.md files | Remove sensitive content, keep project-specific only |
| 11 | Developer onboarding doc | Document all of the above for new devs |

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
2. SSH into the VPS: `ssh deploy@100.114.220.65`
3. Set personal `ANTHROPIC_API_KEY` via container env, personal secrets file, or use Claude Max (see Part 2A)
4. Run `claude` from any site directory — system config + MCP servers are already there
5. Alternatively, use Code Server at dev.spiritmediapublishing.com

**Team structure:**
- Kevin: final approval, content decisions, merges to main
- Nathan: executes builds on VPS, monitors deploys, resolves conflicts, architecture decisions
- Future devs: assigned sites, run Claude Code on VPS with shared context

### F. Port Allocation

Each developer gets a port range for local dev servers:
- Kevin: 4321-4340
- Nathan: 4341-4360
- Dev 3: 4361-4380
- Dev 4: 4381-4400

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
| **Phase 1** | VPS operational foundation (Part 2A-F) — secrets, tooling, onboarding | Week 1 | Pending |
| **Phase 2** | Complete remaining Part 1 fixes (issues 5-11) on VPS | Week 2 | Pending |
| **Phase 3** | Stabilize all 5 sites on new foundation | Weeks 3-4 | Pending |
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
