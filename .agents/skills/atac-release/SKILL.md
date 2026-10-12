---
name: atac-release
description: Prepare and publish an ATaC release with bilingual changelog entries, matching package versions and Git tags, and the GitHub Release workflow. Use when asked to release ATaC or update its release process.
---

# ATaC release

Run commands from the repository root. This project releases through GitHub tags and GitHub Releases; npm package validation does not imply npm publication.

## Release conventions

- Use the requested version. If none is specified, use the version agreed in the conversation; otherwise increment the latest stable patch version.
- Keep `package.json`, both root versions in `package-lock.json`, the leading `CHANGELOG.md` entry, and tag `vX.Y.Z` consistent. Use `npm version X.Y.Z --no-git-tag-version` to update package versions.
- Follow the existing changelog structure: `## [X.Y.Z] - YYYY-MM-DD`, then `### 中文` and `### English`, with matching feature/change/fix bullets. Use only relevant subsections and preserve historical entries.
- Describe user-visible changes since the previous release. Do not include development steps, abandoned designs, draft labels, test execution reports, or fixes to bugs that were never released. Do not generate release notes from commit messages.
- For this repository, commit as `mob999 <1790758006@qq.com>`. Check the effective author and committer before committing; use repository-local configuration if needed. Never change global Git identity.

## Prepare and publish

1. Inspect the worktree, latest release/tag, remote `main`, and changes since the last release. Include the user's authorized changes, including earlier unpushed commits. Do not discard unrelated edits. Follow any explicit branch or PR request; otherwise release from `main`.
2. Update versions and the bilingual changelog. Generate and review the exact release text:
   ```sh
   node scripts/release-notes.mjs vX.Y.Z > /tmp/atac-release-notes.md
   ```
   The script validates version agreement and the leading bilingual changelog entry, then appends the pinned pi installation command.
3. Run `npm run check`, `npm test`, `npm run test:package`, and `git diff --check`. Relevant checks that already passed for the same code need not be repeated; package validation must cover the release version. Run the release-note tests after changing the release script.
4. Commit the authorized changes and version/changelog updates. Push `main`, then create an annotated `vX.Y.Z` tag on that commit and push the tag. Confirm the release commit is on remote `main` before pushing the tag. Existing published tags are immutable: never force-push or retarget one as a recovery step.
5. The tag triggers `.github/workflows/release.yml`. It validates release metadata and main-branch ancestry, reuses the Node.js 22/24 CI matrix, then creates `Release vX.Y.Z` using the changelog text. It uses `GITHUB_TOKEN`; no PAT or npm token is needed. Let this workflow create the Release instead of racing it with a manual `gh release create`.
6. Wait for the release workflow, then verify the tag commit, published Release URL, version, bilingual body, and worktree state. Report the release URL and any remaining changes. Do not report success while checks or publication are pending.

A request to release authorizes the commit, push, tag, and GitHub Release steps. A request only to prepare or document a release does not authorize publication.

## Failure recovery

Inspect the failed job before retrying. Rerun a failed workflow only after the cause is understood; do not loop unchanged retries. If checks expose a code defect after the tag is pushed, keep that tag intact and report the failure before preparing a replacement version. If a Release already exists for the tag, the workflow verifies it is published with the expected title and body and leaves it unchanged; mismatches require investigation instead of overwriting release notes.
