<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';

  let map;
  let posts = [];
  let markers = [];
  let visiblePosts = [];

  // Session state tracking
  let hasOpenedAddPostModal = false;
  let hasOpenedReportModal = false;

  let errorMessage = '';
  let showReportModal = false;
  let reportingPostId = '';
  let reportReason = '';

  let showCreateModal = false;
  let createText = '';
  let createAuthor = '';
  let createLatitude = '';
  let createLongitude = '';

  let showLegalModal = false;

  function isPointInBounds(point, bounds) {
    const [minLng, minLat, maxLng, maxLat] = bounds;
    return point.longitude >= minLng && point.longitude <= maxLng &&
           point.latitude >= minLat && point.latitude <= maxLat;
  }

  function updateVisiblePosts() {
    if (!map || !posts || posts.length === 0) {
      console.log('updateVisiblePosts: map or posts not ready', { mapExists: !!map, postsLength: posts?.length });
      visiblePosts = [];
      return;
    }
    try {
      const bounds = map.getBounds();
      const boundsArray = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      console.log('Current bounds:', boundsArray);

      const filtered = posts.filter(post => {
        const hasCoords = post.longitude != null && post.latitude != null;
        const inBounds = hasCoords && isPointInBounds(post, boundsArray);
        console.log(`Post ${post.id}: coords=${hasCoords}, inBounds=${inBounds}, lat=${post.latitude}, lng=${post.longitude}`);
        return inBounds;
      });

      console.log(`Filtered visible posts: ${filtered.length} of ${posts.length}`);
      // Force Svelte to detect the change
      visiblePosts = [...filtered];
    } catch (e) {
      console.error('Error updating visible posts:', e);
      visiblePosts = [];
    }
  }

  // Reactive: update visible posts when posts change
  $: if (map && posts && posts.length > 0) {
    console.log('Reactive statement fired - updating visible posts');
    updateVisiblePosts();
  }

  function zoomToPost(post) {
    if (post && post.longitude != null && post.latitude != null && map) {
      map.flyTo({
        center: [post.longitude, post.latitude],
        zoom: 12,
        duration: 1500
      });
    }
  }

  function openReportModal(postId) {
    if (hasOpenedReportModal) {
      alert('You can only submit one report per browser session');
      return;
    }
    reportingPostId = postId;
    reportReason = '';
    showReportModal = true;
    hasOpenedReportModal = true;
  }

  function closeReportModal() {
    showReportModal = false;
    reportingPostId = '';
    reportReason = '';
  }

  function openCreateModal(lat, lng) {
    if (hasOpenedAddPostModal) {
      alert('You can only add one post per browser session');
      return;
    }
    createText = '';
    createAuthor = '';
    createLatitude = lat.toFixed(4);
    createLongitude = lng.toFixed(4);
    showCreateModal = true;
    hasOpenedAddPostModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
    createText = '';
    createAuthor = '';
    createLatitude = '';
    createLongitude = '';
  }

  async function submitReport() {
    if (!reportReason.trim()) {
      alert('Please enter a reason for the report');
      return;
    }

    try {
      const res = await fetch('/api/reportPost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: reportingPostId, reason: reportReason })
      });

      if (res.ok) {
        alert('Report submitted successfully. Thank you!');
        closeReportModal();
      } else {
        alert('Error submitting report');
      }
    } catch (err) {
      alert('Error submitting report: ' + err.message);
    }
  }

  async function submitCreatePost(e) {
    e.preventDefault();
    errorMessage = '';

    const payload = { text: createText, author: createAuthor, latitude: createLatitude ? parseFloat(createLatitude) : null, longitude: createLongitude ? parseFloat(createLongitude) : null };
    const res = await fetch('/api/addPost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.status === 429) {
      errorMessage = 'Rate limit: You can only post once per day';
    } else if (res.ok) {
      const result = await res.json();
      if (result.flagged) {
        errorMessage = 'Your post was flagged for spam review and will not appear publicly.';
      } else {
        errorMessage = '';
      }
      closeCreateModal();
      await fetchPosts();
    } else {
      const body = await res.text();
      errorMessage = 'Error: ' + body;
    }
  }

  async function fetchPosts() {
    const res = await fetch('/api/getPosts');
    try {
      let fetchedPosts = await res.json();
      console.log('Fetched posts:', fetchedPosts);

      // Ensure each post has a unique ID
      fetchedPosts = fetchedPosts.map((post, idx) => ({
        ...post,
        id: post.id || `post-${idx}-${Date.now()}`  // Generate ID if missing
      }));

      console.log('Posts with IDs:', fetchedPosts);
      posts = fetchedPosts;
      errorMessage = '';
    } catch (e) {
      console.error('Error fetching posts:', e);
      posts = [];
      errorMessage = 'Failed to load posts';
    }

    // clear markers
    for (const m of markers) m.remove();
    markers = [];

    for (const p of posts) {
      if (p.longitude != null && p.latitude != null) {
        const el = document.createElement('div');
        el.className = 'marker';
        const popupText = `${p.text}${p.author ? ' — ' + p.author : ''}`;
        const marker = new maplibregl.Marker(el)
          .setLngLat([p.longitude, p.latitude])
          .setPopup(new maplibregl.Popup().setText(popupText))
          .addTo(map);
        markers.push(marker);
      }
    }

    // Don't zoom to first post - user wants to stay in center
    // Just update the visible posts list
    console.log('Calling updateVisiblePosts from fetchPosts');
    setTimeout(updateVisiblePosts, 50);
  }

  onMount(async () => {
    // New Zealand bounding box: [west, south, east, north]
    const nzBounds = [[166.4, -47.3], [178.6, -34.0]];

    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
      center: [172.5, -40.9],  // Center of New Zealand
      zoom: 2,
      maxBounds: nzBounds,
      minZoom: 1,
      maxZoom: 9
    });

    // Wait for map to load before attaching listeners
    map.on('load', () => {
      console.log('Map loaded, attaching event listeners');

      const canvas = map.getCanvas();
      let touchLongPressTimer;
      let touchStartX, touchStartY;

      // Desktop right-click to create post
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        console.log(`Right-click at client coords: ${e.clientX}, ${e.clientY}, canvas relative: ${x}, ${y}`);
        const lngLat = map.unproject([x, y]);
        console.log(`Unproject result: lat=${lngLat.lat}, lng=${lngLat.lng}`);
        openCreateModal(lngLat.lat, lngLat.lng);
      });

      // Touch long-press to create post
      canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        touchLongPressTimer = setTimeout(() => {
          const rect = canvas.getBoundingClientRect();
          const x = touch.clientX - rect.left;
          const y = touch.clientY - rect.top;
          console.log(`Touch long-press at client coords: ${touch.clientX}, ${touch.clientY}, canvas relative: ${x}, ${y}`);
          const lngLat = map.unproject([x, y]);
          console.log(`Unproject result: lat=${lngLat.lat}, lng=${lngLat.lng}`);
          openCreateModal(lngLat.lat, lngLat.lng);
        }, 500);
      });

      canvas.addEventListener('touchend', () => {
        clearTimeout(touchLongPressTimer);
      });

      canvas.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        if (deltaX > 10 || deltaY > 10) {
          clearTimeout(touchLongPressTimer);
        }
      });

      canvas.addEventListener('touchcancel', () => {
        clearTimeout(touchLongPressTimer);
      });

      // Update visible posts when map moves or zooms
      map.on('moveend', () => {
        console.log('Map moveend - updating visible posts');
        updateVisiblePosts();
      });

      map.on('zoomend', () => {
        console.log('Map zoomend - updating visible posts');
        updateVisiblePosts();
      });

      // Call immediately after load
      console.log('Calling initial updateVisiblePosts');
      updateVisiblePosts();
    });

    await fetchPosts();
  });
</script>

<style global>
  body {
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }


  :global(.marker) {   background: #8b2f3c;
 width: 12px; height: 12px; border-radius: 50%; cursor: pointer; }
  #map { width: 100%; height: 60vh; }
  main {
    background: #f7f4f2;
    padding: 1rem;
  }

button {
  padding: 0.45rem 0.9rem;
  background: #f7f7f7;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.15s ease, border-color 0.15s ease;
}

button:hover {
  background: #ececec;
  border-color: #bbb;
}

button.report {
  background: none;
  border: none;
  padding: 0;
  margin-left: 6px;
  font-size: 0.8rem;
  color: #b33a3a;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s ease, color 0.15s ease;
}

button.report:hover {
  opacity: 1;
  color: #a12727;
  text-decoration: underline;
}

.legal-link {
  text-align: center;
  margin: 2rem 0 1rem;
}

.legal-link button {
  background: none;
  border: none;
  color: #555;
  font-size: 0.9rem;
  text-decoration: underline;
  cursor: pointer;
}

.legal-content {
  font-size: 0.9rem;
  line-height: 1.45;
  color: #444;
  max-height: 70vh;
  overflow-y: auto;
}


.posts-list-container li {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}


.posts-list-container ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.posts-list-container li {
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #eee;
  transition: background 0.15s ease;
  gap: 0.35rem; /* nice breathing room */
}




.posts-list-container li:hover {
  background: #f2f2f2;
}
.post-text {
  font-size: 1rem;
  color: #333;
  line-height: 1.6;
}

  .error { color: #d32f2f; padding: 0.5rem; background: #ffebee; border-radius: 4px; margin-bottom: 0.5rem; }
  .success { color: #388e3c; padding: 0.5rem; background: #e8f5e9; border-radius: 4px; margin-bottom: 0.5rem; }
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .modal { background: #faf7f5; padding: 1.5rem; border-radius: 6px; max-width: 500px; width: 90%; }
  .modal h2 { margin-top: 0; }
  .modal textarea { width: 100%; min-height: 100px; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem; box-sizing: border-box; }
  .modal input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem; box-sizing: border-box; }
  .modal-buttons { display: flex; gap: 0.5rem; }
  .modal-buttons button { flex: 1; }
.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #444;
  line-height: 1.4;
}

  .toggle {
    margin-left: 6px;
    font-size: 0.8rem;
    background: none;
    border: none;
    color: #0077ff;
    cursor: pointer;
  }

</style>

<main>


  <h1>Geo Posts</h1>

  {#if errorMessage}
    <div class="error">{errorMessage}</div>
  {/if}

  <div id="map"></div>

  <div class="posts-list-container">
    <div class="posts-list-header">Posts in View ({visiblePosts.length})</div>
<ul>
  {#each visiblePosts as post (post.id)}
    <li on:click={() => zoomToPost(post)}>

      <span 
        class="post-text"
        class:clamped={!post.expanded}
      >
        {post.text}{post.author ? ` — ${post.author}` : ''}
      </span>

      {#if post.text.length > 180}
        <button 
          class="toggle"
          on:click|stopPropagation={() => post.expanded = !post.expanded}
        >
          {post.expanded ? "Show less" : "Show more"}
        </button>
      {/if}

      <button 
        class="report"
        on:click|stopPropagation={() => openReportModal(post.id)}
      >
        Report
      </button>

    </li>
  {/each}
</ul>
  </div>
    <div class="legal-link">
  <button on:click={() => showLegalModal = true}>
    Terms of Use & Privacy Policy
  </button>
  </div>
</main>

{#if showReportModal}
  <div class="modal-overlay" on:click={closeReportModal}>
    <div class="modal" on:click|stopPropagation>
      <h2>Report Post</h2>
      <p>Please explain why you're reporting this post:</p>
      <textarea bind:value={reportReason} placeholder="Enter reason for report..."></textarea>
      <div class="modal-buttons">
        <button on:click={submitReport} style="background: #ff6b6b;">Submit Report</button>
        <button on:click={closeReportModal} style="background: #666;">Cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if showCreateModal}
  <div class="modal-overlay" on:click={closeCreateModal}>
    <div class="modal" on:click|stopPropagation>
      <h2>Create Post</h2>
      <form on:submit={submitCreatePost}>
        <input placeholder="Post text" bind:value={createText} required />
        <input placeholder="Author (optional)" bind:value={createAuthor} />
        <input type="hidden" bind:value={createLatitude} />
        <input type="hidden" bind:value={createLongitude} />

<div class="terms">
  <strong>Terms of Use</strong><br>
  By submitting a post, you agree to the following:
  <ul>
    <li>Your post must be your own experience or perspective.</li>
    <li>Do not include names or identifying details about others.</li>
    <li>Not post harmful, threatening, or abusive content.</li>
    <li>Posts may be removed if reported or inappropriate.</li>
    <li>This platform is not a reporting service and cannot provide emergency support.</li>
  </ul>
</div>

        <div class="modal-buttons">
          <button type="submit">Create Post</button>
          <button type="button" on:click={closeCreateModal} style="background: #666;">Cancel</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showLegalModal}
  <div class="modal-overlay" on:click={() => showLegalModal = false}>
    <div class="modal" on:click|stopPropagation>
      <h2>Terms of Use & Privacy Policy</h2>

<div class="legal-content">
  <h2>Terms of Use & Privacy Policy</h2>
  <p><em>Last updated: February 2026 — Aotearoa New Zealand</em></p>

  <h3>1. Purpose of This Platform</h3>
  <p>
    This site provides a space for people to share personal experiences connected to places.
    It is not a reporting service, counselling service, or emergency support channel.
    If you or someone else is in immediate danger, please contact local emergency services
    or support organisations.
  </p>

  <h3>2. Your Responsibilities When Posting</h3>
  <p>By submitting content, you agree to:</p>
  <ul>
    <li>Share only your own experiences or perspectives.</li>
    <li>Avoid naming or identifying other people without their clear consent.</li>
    <li>Not post harmful, threatening, abusive, or harassing content.</li>
    <li>Not make accusations or defamatory statements about identifiable individuals.</li>
    <li>Not upload illegal content of any kind.</li>
    <li>Understand that posts may be moderated or removed if they breach these terms or are reported.</li>
  </ul>
  <p>
    This platform operates under the principles of the
    <strong>Harmful Digital Communications Act 2015 (HDCA)</strong>.
    Content that causes serious emotional distress or targets individuals may be removed.
  </p>

  <h3>3. Moderation & Reporting</h3>
  <p>
    Users can report posts they believe breach these terms. Reported posts may be reviewed
    and removed at the discretion of the site operator. This site is not monitored in real time
    and immediate action cannot be guaranteed.
  </p>

  <h3>4. Privacy & Data Collection</h3>
  <p>We collect only the information needed to operate the platform:</p>
  <p><strong>Information you provide:</strong></p>
  <ul>
    <li>The text of your post</li>
    <li>Optional author name</li>
    <li>Approximate location (rounded to reduce precision)</li>
  </ul>

  <p><strong>Information automatically stored:</strong></p>
  <ul>
    <li>Timestamp of your post</li>
    <li>Basic technical logs required for security and performance</li>
  </ul>

  <p>We do <strong>not</strong> collect or store:</p>
  <ul>
    <li>Exact GPS coordinates</li>
    <li>IP addresses for profiling</li>
    <li>Personal identifiers unless you include them in your post</li>
  </ul>

  <h3>5. How Location Data Is Handled</h3>
  <p>
    To protect privacy, location data is rounded to reduce precision before being stored.
    Posts are associated with an approximate area, not an exact address.
  </p>

  <h3>6. How Your Data Is Used</h3>
  <p>Your data is used only to:</p>
  <ul>
    <li>Display posts on the map</li>
    <li>Support moderation and safety processes</li>
    <li>Improve the platform’s functionality</li>
  </ul>
  <p>We do not sell, trade, or share your data with third parties.</p>

  <h3>7. Your Rights</h3>
  <p>You may request:</p>
  <ul>
    <li>Removal of your posts</li>
    <li>Permanent deletion of your data</li>
  </ul>

  <h3>8. Disclaimer</h3>
  <p>
    This platform is provided “as is.” We do not guarantee uninterrupted service or availability.
    We are not responsible for harm caused by content posted by users.
  </p>

  <h3>9. Changes to These Terms</h3>
  <p>
    These terms may be updated from time to time. Continued use of the platform means you accept
    the updated terms.
  </p>
</div>

      <div class="modal-actions">
        <button class="cancel-btn" on:click={() => showLegalModal = false}>
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
