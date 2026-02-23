<script>
  import { onMount } from 'svelte';

  let adminPassword = '';
  let isAuthenticated = false;
  let flaggedPosts = [];
  let reports = [];
  let allPosts = [];
  let loading = false;
  let activeTab = 'flagged';
  let error = '';
  let success = '';

  async function login() {
    if (!adminPassword) {
      error = 'Please enter admin password';
      return;
    }

    try {
      loading = true;
      error = '';
      const res = await fetch(`/api/getFlaggedPosts?adminPassword=${encodeURIComponent(adminPassword)}`);

      if (res.status === 401) {
        error = 'Invalid password';
        return;
      }

      if (res.ok) {
        isAuthenticated = true;
        await loadData();
      } else {
        error = 'Authentication failed';
      }
    } catch (err) {
      error = 'Error: ' + err.message;
    } finally {
      loading = false;
    }
  }

  async function loadData() {
    try {
      const [flaggedRes, reportsRes, allPostsRes] = await Promise.all([
        fetch(`/api/getFlaggedPosts?adminPassword=${encodeURIComponent(adminPassword)}`),
        fetch('/api/getUserReports'),
        fetch('/api/getAllPosts')
      ]);

      if (flaggedRes.ok) {
        flaggedPosts = await flaggedRes.json();
      }
      if (reportsRes.ok) {
        reports = await reportsRes.json();
      }
      if (allPostsRes.ok) {
        allPosts = await allPostsRes.json();
      }
    } catch (err) {
      error = 'Failed to load data: ' + err.message;
    }
  }

  async function deleteFlaggedPost(postId) {
    if (!confirm('Delete this post permanently?')) return;

    try {
      const res = await fetch(`/api/deleteFlaggedPost/${postId}?adminPassword=${encodeURIComponent(adminPassword)}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        success = 'Post deleted';
        await loadData();
        setTimeout(() => success = '', 3000);
      } else {
        error = 'Failed to delete post';
      }
    } catch (err) {
      error = 'Error: ' + err.message;
    }
  }

  async function restoreFlaggedPost(postId) {
    try {
      const res = await fetch(`/api/restoreFlaggedPost/${postId}?adminPassword=${encodeURIComponent(adminPassword)}`, {
        method: 'PUT'
      });

      if (res.ok) {
        success = 'Post restored and made visible';
        await loadData();
        setTimeout(() => success = '', 3000);
      } else {
        error = 'Failed to restore post';
      }
    } catch (err) {
      error = 'Error: ' + err.message;
    }
  }

  async function deleteReport(reportId) {
    try {
      const res = await fetch(`/api/deleteReport/${reportId}?adminPassword=${encodeURIComponent(adminPassword)}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        success = 'Report deleted';
        await loadData();
        setTimeout(() => success = '', 3000);
      } else {
        error = 'Failed to delete report';
      }
    } catch (err) {
      error = 'Error: ' + err.message;
    }
  }

  function logout() {
    isAuthenticated = false;
    adminPassword = '';
    flaggedPosts = [];
    reports = [];
    allPosts = [];
  }

  onMount(() => {
    // Check if already authenticated (from localStorage)
    const savedPassword = localStorage.getItem('adminPassword');
    if (savedPassword) {
      adminPassword = savedPassword;
      login();
    }
  });
</script>

<style global>
  .admin-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .login-form {
    max-width: 400px;
    margin: 2rem auto;
    padding: 2rem;
    background: #f5f5f5;
    border-radius: 6px;
  }

  .login-form h1 {
    margin-top: 0;
  }

  .login-form input {
    width: 100%;
    padding: 0.75rem;
    margin-bottom: 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }

  .login-form button {
    width: 100%;
    padding: 0.75rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }

  .login-form button:hover {
    background: #0056b3;
  }

  .error {
    color: #d32f2f;
    padding: 0.75rem;
    background: #ffebee;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .success {
    color: #388e3c;
    padding: 0.75rem;
    background: #e8f5e9;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 2px solid #ddd;
  }

  .tab {
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
  }

  .tab.active {
    border-bottom-color: #007bff;
    color: #007bff;
    font-weight: bold;
  }

  .logout-btn {
    padding: 0.5rem 1rem;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .logout-btn:hover {
    background: #c82333;
  }

  .post-card {
    border: 1px solid #ddd;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 4px;
    background: #f9f9f9;
  }

  /* NEW: cleaner post text */
  .post-body {
    font-size: 0.95rem;
    font-weight: normal;
    color: #333;
    line-height: 1.4;
    margin-bottom: 0.5rem;
  }

  .post-meta {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 0.5rem;
  }

  .post-reason {
    background: #fff3cd;
    padding: 0.5rem;
    border-radius: 3px;
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }

  .post-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .post-actions button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .delete-btn {
    background: #dc3545;
    color: white;
  }

  .delete-btn:hover {
    background: #c82333;
  }

  .restore-btn {
    background: #28a745;
    color: white;
  }

  .restore-btn:hover {
    background: #218838;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    text-align: center;
  }

  .stat-card .number {
    font-size: 2rem;
    font-weight: bold;
    color: #007bff;
  }

  .stat-card .label {
    color: #666;
    font-size: 0.9rem;
  }

  .empty {
    padding: 2rem;
    text-align: center;
    color: #999;
  }

  @media (max-width: 768px) {
    .stats {
      grid-template-columns: 1fr;
    }

    .admin-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }
  }
</style>

<div class="admin-container">
  {#if !isAuthenticated}
    <div class="login-form">
      <h1>Admin Portal</h1>
      {#if error}
        <div class="error">{error}</div>
      {/if}
      <input
        type="password"
        placeholder="Admin Password"
        bind:value={adminPassword}
        on:keydown={(e) => e.key === 'Enter' && login()}
      />
      <button on:click={login} disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </div>
  {:else}
    <div class="admin-header">
      <h1>Admin Dashboard</h1>
      <button class="logout-btn" on:click={logout}>Logout</button>
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    {#if success}
      <div class="success">{success}</div>
    {/if}

    <div class="stats">
      <div class="stat-card">
        <div class="number">{flaggedPosts.length}</div>
        <div class="label">Flagged Posts</div>
      </div>
      <div class="stat-card">
        <div class="number">{reports.length}</div>
        <div class="label">User Reports</div>
      </div>
    </div>

    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'flagged'}
        on:click={() => activeTab = 'flagged'}
      >
        Flagged Posts ({flaggedPosts.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'reports'}
        on:click={() => activeTab = 'reports'}
      >
        Reports ({reports.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'allPosts'}
        on:click={() => activeTab = 'allPosts'}
      >
        All Posts ({allPosts.length})
      </button>
    </div>

    {#if activeTab === 'flagged'}
      <div>
        {#if flaggedPosts.length === 0}
          <div class="empty">No flagged posts</div>
        {:else}
          {#each flaggedPosts as post (post.postId)}
            <div class="post-card">
              <h3>{post.post?.text || 'Unknown post'}</h3>
              <div class="post-meta">
                {#if post.post}
                  <strong>Author:</strong> {post.post.author}<br />
                  <strong>Location:</strong> ({post.post.latitude}, {post.post.longitude})<br />
                {/if}
                <strong>Flagged:</strong> {new Date(post.flaggedAt).toLocaleString()}
              </div>
              <div class="post-reason">
                <strong>Reason:</strong> {post.reason}
              </div>
              <div class="post-actions">
                <button class="restore-btn" on:click={() => restoreFlaggedPost(post.postId)}>
                  Restore & Make Visible
                </button>
                <button class="delete-btn" on:click={() => deleteFlaggedPost(post.postId)}>
                  Delete Permanently
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    {#if activeTab === 'reports'}
      <div>
        {#if reports.length === 0}
          <div class="empty">No user reports</div>
        {:else}
          {#each reports as report (report.id)}
            <div class="post-card">
              <h3>{report.post?.text || 'Unknown post'}</h3>
              <div class="post-meta">
                {#if report.post}
                  <strong>Author:</strong> {report.post.author}<br />
                  <strong>Location:</strong> ({report.post.latitude}, {report.post.longitude})<br />
                {/if}
                <strong>Reported:</strong> {new Date(report.reportedAt).toLocaleString()}
              </div>
              <div class="post-reason">
                <strong>Report Reason:</strong> {report.reason}
              </div>
              <div class="post-actions">
                <button class="delete-btn" on:click={() => deleteReport(report.id)}>
                  Delete Report
                </button>
                <button class="delete-btn" on:click={() => deleteFlaggedPost(report.postId)}>
                  Delete Post
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    {#if activeTab === 'allPosts'}
      <div>
        {#if allPosts.length === 0}
          <div class="empty">No posts</div>
        {:else}
          {#each allPosts as post (post.id)}
            <div class="post-card">
            <div class="post-body">{post.text || 'Unknown post'}</div>
              <div class="post-meta">
                <strong>Author:</strong> {post.author}<br />
                <strong>Location:</strong> ({post.latitude}, {post.longitude})<br />
              </div>
              <div class="post-actions">
                <button class="delete-btn" on:click={() => deleteFlaggedPost(post.id)}>
                  Delete Post
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}
</div>
