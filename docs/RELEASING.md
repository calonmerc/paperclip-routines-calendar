# Releasing to npm

This guide covers publishing `paperclip-routines-calendar` to npm for the
first time and then automating releases from GitHub. It assumes you've never
done this before.

> **Short version:** you won't need an `NPM_TOKEN` secret. npm now recommends
> **trusted publishing**: GitHub Actions proves its identity to npm directly,
> so no long-lived token is stored anywhere. You publish once by hand, link the
> package to this GitHub repo on npmjs.com, and every GitHub release after
> that publishes automatically.

## Why not an `NPM_TOKEN`?

As of late 2026, npm's token rules are:

- Classic npm tokens were **permanently revoked in December 2025**.
- Granular tokens with publish rights **expire after at most 90 days**, so you
  would have to rotate the secret four times a year.
- Publishing directly with a "bypass 2FA" token, which is what CI needs, is
  being **removed in January 2027**.

Trusted publishing (OIDC) avoids all three problems. The token route is still
documented at the end in case you need it short-term.

---

## One-time setup

### 1. Create an npm account and turn on 2FA

1. Sign up at <https://www.npmjs.com/signup>. Your npm username doesn't have
   to match GitHub.
2. Go to **Account Settings → Two-Factor Authentication** and enable it. Use an
   authenticator app or a security key. npm requires 2FA to publish.

### 2. Log in from your terminal

```bash
cd ~/repos-priv/paperclip-routines-calendar
nvm use            # Node 24 (bundles npm 11.x)
npm login          # opens a browser to sign in
npm whoami         # should print your npm username
```

### 3. Make sure the package name is still free

```bash
npm view paperclip-routines-calendar
```

`404 Not Found` means it's free. If someone else has taken it, stop and
choose a new name. The name lives in `package.json` `name`; the plugin
`id` in `src/manifest.ts` normally matches it.

### 4. Publish the first version by hand

A trusted publisher can only be attached to a package that **already exists**
on npm, so the first release has to come from your machine.

```bash
git status                 # clean working tree
git pull                   # up to date with GitHub
pnpm install --frozen-lockfile
npm publish --dry-run      # runs typecheck/test/build via prepublishOnly,
                           # then lists the files that would be uploaded
```

Check the dry-run file list. It should contain `dist/…`, `package.json`,
`README.md` and `LICENSE`, and **nothing else** (no `src/`, no `.env`). Then:

```bash
npm publish --access public    # prompts for your 2FA code
```

Confirm it's live at <https://www.npmjs.com/package/paperclip-routines-calendar>.

Then tag that commit so the history lines up:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

### 5. Link the package to GitHub (trusted publisher)

1. On npmjs.com, open the package page, then **Settings**.
2. Find the **Trusted Publisher** section and, under **Select your
   publisher**, click **GitHub Actions**.
3. Fill in:

   | Field | Value |
   | --- | --- |
   | Organization or user | `calonmerc` |
   | Repository | `paperclip-routines-calendar` |
   | Workflow filename | `release.yml` (filename only, not the path) |
   | Environment name | leave empty |

4. Under **Allowed actions**, enable **`npm publish`**. Publishers created
   after May 2026 must opt in to each action explicitly; `npm stage publish`
   is always allowed. You don't need dist-tag management.
5. Save.

### 6. Lock down token publishing (recommended)

Still in the package **Settings**, under **Publishing access**, select
**Require two-factor authentication and disallow tokens**. Trusted publishing
keeps working, but a leaked token can no longer publish your package.

### 7. Nothing to add in GitHub

No repository secret is needed. `.github/workflows/release.yml` already has
`permissions: id-token: write`, which lets the job request an identity token
that npm trusts. `package.json` `repository.url` must match the GitHub repo
exactly, and it already does.

---

## Every release after that

1. Bump the version in **both** places, which must match:
   - `package.json`: `"version"`
   - `src/manifest.ts`: `version`

   Use semver: patch for fixes, minor for features, major for breaking
   changes.
2. Commit the bump: `git commit -am "chore: release v0.2.0"` and push to
   `main`. Wait for CI to go green.
3. On GitHub, go to **Releases → Draft a new release**. Create a new tag
   `v0.2.0` on `main`, write notes (or click **Generate release notes**), and
   click **Publish release**.
4. Watch **Actions → Release**. The workflow checks that the tag matches both
   version fields, runs typecheck, tests and build, and then publishes with a
   provenance attestation.
5. Check npmjs.com. The version page shows a "Provenance" badge linking back
   to the exact workflow run.

If the version check fails, fix the versions, delete the release and tag on
GitHub, and create it again.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `404 Not Found - PUT …` or `ENEEDAUTH` in the Release job | Trusted publisher not configured, a typo in owner/repo/workflow filename, or `npm publish` not in **Allowed actions**. |
| `E422 … repository.url does not match` | `package.json` `repository.url` differs from the GitHub repo, for example after renaming or transferring the repo. |
| `npm ERR! code EOTP` locally | Run `npm publish` again and enter a fresh 2FA code. |
| Release published but job skipped the publish | The tag/version check failed. Read the job log. |

---

## Fallback: using an `NPM_TOKEN` secret instead

Only use this if trusted publishing isn't an option. It stops working for
direct publishes in January 2027.

1. npmjs.com → your avatar → **Access Tokens** → **Generate New Token** →
   **Granular Access Token**.
2. Name it `paperclip-routines-calendar GitHub release`. Set the expiration
   (at most 90 days for write tokens). Under **Packages and scopes**, choose
   **Read and write**, limited to `paperclip-routines-calendar` only. Tick
   **Bypass two-factor authentication**, since CI can't type a 2FA code.
3. Copy the token. It's shown only once.
4. GitHub repo → **Settings → Secrets and variables → Actions → New
   repository secret**. Name it `NPM_TOKEN` and paste the token as the value.
5. Put a calendar reminder to rotate it before it expires.

`release.yml` already passes `secrets.NPM_TOKEN` as `NODE_AUTH_TOKEN`. npm
tries trusted publishing first and only falls back to the token, so having
both configured is harmless. Once trusted publishing works, delete the secret
and the token.
