# Development Workflow (Trunk + Short Branch)

This repository follows a `main`-centered trunk workflow with short-lived branches.

## Branch Model

- Trunk branch: `main`
- Working branches: `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `test/*`, `chore/*`
- Pull request target: always `main`

## Upstream Sync Policy

Before creating or updating a pull request:

- Sync local `main` with `upstream/main`
- Rebase the working branch onto the updated `main`
- Resolve conflicts on the working branch, not on `main`

## Pull Request Policy

- Keep pull requests small and focused
- Require passing CI before merge
- Use Rebase merge
- Delete the merged branch

## Main Branch Protection (Repository Settings)

Configure branch protection for `main`:

- Disallow direct pushes
- Require at least one approval
- Require all status checks to pass
- Require branch to be up to date before merge