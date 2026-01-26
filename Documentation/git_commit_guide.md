## Git: How to Commit Your Changes (Beginner Cheat Sheet)

This guide explains, step by step, how to save your work in Git.

---

### 1. Check what has changed

Run this in your terminal:

```bash
git status
```

**What it does:**  
- Shows which files are **modified**, **deleted**, or **new** (untracked).  
- Helps you see what will be included in your next commit.

---

### 2. Stage your changes

Staging means: “I want these changes to be included in my next snapshot (commit).”

#### Option A – Stage everything

```bash
git add .
```

**What it does:**  
- Adds **all** modified, deleted, and new files in this folder to the “staging area”.

#### Option B – Stage specific files only

```bash
git add backend/app.py backend/schema.sql
```

**What it does:**  
- Only stages the files you list.  
- Useful if you don’t want to commit everything at once.

You can run `git status` again to check what is staged (they will appear under “Changes to be committed”).

---

### 3. Create a commit with a message

Once you’ve staged what you want to save:

```bash
git commit -m "Describe what you changed"
```

**Tips for the message:**
- **Bad:** `"changes"`  
- **Better:** `"Update auction schema and move documentation into Documentation folder"`

The commit is like a labeled snapshot of your work at this moment.

---

### 4. Send your commit to the remote (GitHub/GitLab)

```bash
git push
```

**What it does:**  
- Uploads your local commits to the remote repository (e.g. GitHub).  
- Lets you access your work from elsewhere and backs it up.

---

### 5. Handy one-liner (do everything at once)

If you are okay committing **all** current changes:

```bash
git add . && git commit -m "Describe your changes" && git push
```

This:
1. Stages all changes  
2. Commits them with a message  
3. Pushes them to the remote

---

### 6. Quick reference table

| Command                     | Meaning (in simple words)                           |
|----------------------------|-----------------------------------------------------|
| `git status`               | Show what has changed and what is staged           |
| `git add .`                | Stage **all** changes in the folder                |
| `git add <file>`           | Stage a specific file                              |
| `git commit -m "message"`  | Save a snapshot with a label                       |
| `git push`                 | Send your commits to GitHub/GitLab (the remote)    |

---

### 7. Common beginner mistakes

- **Forgetting to add before committing**  
  - Symptom: “`nothing to commit, working tree clean`” even though you changed files.  
  - Fix: Run `git add .` (or `git add <file>`) before `git commit`.

- **Using a very vague commit message**  
  - Try to say what you did, for example:  
    - `"Fix auction end time bug"`  
    - `"Add documentation for database schema"`

- **Forgetting to push**  
  - Your commit is only on your computer until you run `git push`.

---

### 8. How this applies to your current project

Based on your current `git status`, you can do:

```bash
git add .
git commit -m "Update auction database and documentation structure"
git push
```

This will:
- Include deleted docs, modified database and Python files, and new `Documentation/` files.  
- Save them as one commit with a clear description.  
- Upload the commit to your remote repository.


