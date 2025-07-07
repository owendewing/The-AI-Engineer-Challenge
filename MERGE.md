# How to Merge Your Changes Back to `main`

This guide explains how to merge your feature branch or local changes back into the `main` branch using two methods:
- **GitHub Pull Request (PR) Route**
- **GitHub CLI Route**

---

## 1. GitHub Pull Request (PR) Route

1. **Push your branch to GitHub (if not already pushed):**
   ```sh
   git push origin <your-branch-name>
   ```

2. **Open a Pull Request:**
   - Go to your repository on GitHub.
   - Click the "Compare & pull request" button for your branch.
   - Review the changes, add a descriptive title and comments if needed.
   - Click "Create pull request".

3. **Review and Merge:**
   - Wait for any required checks or reviews to complete.
   - Click "Merge pull request".
   - Optionally, delete your feature branch after merging.

---

## 2. GitHub CLI Route

1. **Push your branch to GitHub (if not already pushed):**
   ```sh
   git push origin <your-branch-name>
   ```

2. **Create a Pull Request from the CLI:**
   ```sh
   gh pr create --base main --head <your-branch-name> --fill
   ```
   - This will open a PR with the default title and description. You can edit them interactively if you wish.

3. **Merge the Pull Request from the CLI:**
   ```sh
   gh pr merge <your-branch-name> --merge
   ```
   - You can also use `--squash` or `--rebase` instead of `--merge` if you prefer.

4. **(Optional) Delete your branch:**
   ```sh
   git branch -d <your-branch-name>
   git push origin --delete <your-branch-name>
   ```

---

## Notes
- Replace `<your-branch-name>` with the name of your feature or working branch.
- Make sure your local branch is up to date with remote before merging.
- If you encounter conflicts, resolve them locally and push the resolved branch before merging.

---

For more details, see the [GitHub documentation](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) or the [GitHub CLI documentation](https://cli.github.com/manual/gh_pr_create). 