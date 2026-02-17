# How to Redeploy Dream Lodge Backend

## Quick Redeploy Methods

### Method 1: Push Empty Commit (Triggers Auto-Deploy)
```bash
git commit --allow-empty -m "Redeploy"
git push origin main
```

### Method 2: Make a Small Change
```bash
# Make a small change (like updating a comment)
git add .
git commit -m "Redeploy trigger"
git push origin main
```

## Fix Authentication First

Before redeploying, you need to fix the GitHub authentication issue:

### For Railway:
1. Go to Railway Dashboard
2. Select your project
3. Go to **Settings** → **Source**
4. Click **Disconnect** then **Connect** GitHub repository
5. Re-authorize Railway's access to your GitHub account

### For Render:
1. Go to Render Dashboard
2. Go to **Account Settings** → **Connections** → **GitHub**
3. Click **Reconnect** or **Authorize**
4. Ensure your repository is accessible

### Alternative: Make Repository Public
If the repository doesn't contain sensitive data:
1. Go to GitHub → Your Repository
2. **Settings** → **General** → Scroll to **Danger Zone**
3. Click **Change visibility** → **Make public**

## Manual Redeploy Steps

### Railway:
- Dashboard → Project → **Deployments** tab
- Click **Redeploy** on the latest deployment

### Render:
- Dashboard → Your Service → **Manual Deploy** button
- Select **Deploy latest commit**

### Vercel:
- Dashboard → Project → **Deployments** tab
- Click **Redeploy** on any deployment

## Troubleshooting

If redeploy fails with authentication errors:
1. Check GitHub repository visibility (private repos need authentication)
2. Verify deployment platform has access to your GitHub account
3. Use a GitHub Personal Access Token if needed
4. Consider making the repository public if appropriate
