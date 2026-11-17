# Git workflow

All changes to `main` must go through a GitHub pull request. Never push directly to `main`.

1. Commit the changes on a separate branch and push that branch to the remote.
2. Open or update a pull request with that branch as the head and `main` as the base.
3. When the user asks to land the changes on `main`, merge the pull request after GitHub's required checks and approvals pass.

# Infrastructure workflow

Make infrastructure changes through Terraform. Update the Terraform configuration, review the plan against the existing remote state, and apply the reviewed plan. Use cloud consoles and CLI commands for inspection and verification.
