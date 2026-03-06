<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';

  let map;
  let posts = [];
  let activePopup;

  // Session state tracking
  let hasOpenedAddPostModal = false;
  let hasOpenedReportModal = false;

  let errorMessage = '';
  let successMessage = '';
  let showReportModal = false;
  let reportingPostId = '';
  let reportReason = '';

  let showCreateModal = false;
  let createText = '';
  let createAuthor = '';
  let createLatitude = '';
  let createLongitude = '';

  
  let showAboutModal = false;
  let showLegalModal = false;
  let showHamburgerMenu = false;
  let resizeHandler;
  let successMessageTimer;

  const POST_VIEW_ZOOM = 10.5;
  const POST_CREATE_ZOOM = 8.5;
  const MAP_MAX_ZOOM = 10.5;
  const POSTS_SOURCE_ID = 'posts-source';
  const CLUSTER_LAYER_ID = 'posts-clusters';
  const CLUSTER_COUNT_LAYER_ID = 'posts-cluster-count';
  const UNCLUSTERED_LAYER_ID = 'posts-unclustered';

  function zoomToPost(post) {
    if (post && post.longitude != null && post.latitude != null && map) {
      map.flyTo({
        center: [post.longitude, post.latitude],
        zoom: POST_VIEW_ZOOM,
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

    if (map) {
      map.flyTo({
        center: [lng, lat],
        zoom: POST_CREATE_ZOOM,
        duration: 900
      });
    }

    createText = '';
    createAuthor = '';
    createLatitude = lat.toFixed(4);
    createLongitude = lng.toFixed(4);
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
    createText = '';
    createAuthor = '';
    createLatitude = '';
    createLongitude = '';
  }

  function openAboutModalFromMenu() {
    showHamburgerMenu = false;
    showAboutModal = true;
  }

  function openLegalModalFromMenu() {
    showHamburgerMenu = false;
    showLegalModal = true;
  }

  function showSuccessMessage(message) {
    successMessage = message;

    if (successMessageTimer) {
      clearTimeout(successMessageTimer);
    }

    successMessageTimer = setTimeout(() => {
      successMessage = '';
    }, 4500);
  }

  function buildPostsGeoJson() {
    return {
      type: 'FeatureCollection',
      features: posts
        .filter((post) => post.longitude != null && post.latitude != null)
        .map((post) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [post.longitude, post.latitude]
          },
          properties: {
            id: String(post.id),
            text: post.text ?? '',
            author: post.author ?? ''
          }
        }))
    };
  }

  function addPostLayers() {
    if (!map || map.getSource(POSTS_SOURCE_ID)) return;

    map.addSource(POSTS_SOURCE_ID, {
      type: 'geojson',
      data: buildPostsGeoJson(),
      cluster: true,
      clusterMaxZoom: 7,
      clusterRadius: 44
    });

    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: POSTS_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#8b2f3c',
        'circle-stroke-color': '#f7f4f2',
        'circle-stroke-width': 2,
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          14,
          10,
          18,
          30,
          22
        ]
      }
    });

    map.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: POSTS_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-size': 12
      },
      paint: {
        'text-color': '#ffffff'
      }
    });

    map.addLayer({
      id: UNCLUSTERED_LAYER_ID,
      type: 'circle',
      source: POSTS_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#8b2f3c',
        'circle-radius': 7,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    map.on('click', CLUSTER_LAYER_ID, (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER_ID] });
      const clusterFeature = features?.[0];
      if (!clusterFeature) return;

      const source = map.getSource(POSTS_SOURCE_ID);
      const clusterId = clusterFeature.properties?.cluster_id;
      if (!source || clusterId == null) return;

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: clusterFeature.geometry.coordinates,
          zoom: Math.min(zoom, MAP_MAX_ZOOM),
          duration: 700
        });
      });
    });

    map.on('click', UNCLUSTERED_LAYER_ID, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const [lng, lat] = feature.geometry.coordinates;
      const text = feature.properties?.text || '';
      const author = feature.properties?.author;
      const popupText = `${text}${author ? ` — ${author}` : ''}`;

      zoomToPost({ longitude: lng, latitude: lat });

      if (activePopup) {
        activePopup.remove();
      }

      activePopup = new maplibregl.Popup({ offset: 12 })
        .setLngLat([lng, lat])
        .setText(popupText)
        .addTo(map);

      activePopup.setMaxWidth('960px');
    });

    map.on('mouseenter', CLUSTER_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CLUSTER_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('mouseenter', UNCLUSTERED_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', UNCLUSTERED_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });
  }

  function refreshPostsOnMap() {
    if (!map) return;
    const source = map.getSource(POSTS_SOURCE_ID);
    if (!source) return;
    source.setData(buildPostsGeoJson());
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
    successMessage = '';

    const payload = { text: createText, author: createAuthor, latitude: createLatitude ? parseFloat(createLatitude) : null, longitude: createLongitude ? parseFloat(createLongitude) : null };
    const res = await fetch('/api/addPost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.status === 429) {
      errorMessage = 'Rate limit: You can only post once per day';
    } else if (res.ok) {
      hasOpenedAddPostModal = true;
      const result = await res.json();
      if (result.flagged) {
        showSuccessMessage('Thank you — your post will appear on the map soon.');
      } else {
        showSuccessMessage('Thank you — your post was submitted successfully.');
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

    refreshPostsOnMap();
  }

  onMount(async () => {
    // New Zealand bounding box: [west, south, east, north]
    const nzBounds = [[160.5, -49.5], [184.5, -31.0]];

    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
      center: [172.5, -40.9],  // Center of New Zealand
      zoom: 1.6,
      maxBounds: nzBounds,
      minZoom: 1,
      maxZoom: MAP_MAX_ZOOM,
      refreshExpiredTiles: true
    });

    // Wait for map to load before attaching listeners
    map.on('load', () => {
      console.log('Map loaded, attaching event listeners');
      map.resize();
      map.triggerRepaint();
      addPostLayers();
      refreshPostsOnMap();

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

      map.on('zoomend', () => {
        map.resize();
        map.triggerRepaint();
      });

    });

    resizeHandler = () => {
      if (!map) return;
      map.resize();
      map.triggerRepaint();
    };

    const keydownHandler = (e) => {
      if (e.key !== 'Escape') return;

      if (showCreateModal) {
        closeCreateModal();
        return;
      }

      if (showReportModal) {
        closeReportModal();
        return;
      }

      if (showLegalModal) {
        showLegalModal = false;
      }
    };

    window.addEventListener('resize', resizeHandler);
    window.addEventListener('keydown', keydownHandler);

    await fetchPosts();

    return () => {
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
      window.removeEventListener('keydown', keydownHandler);
      if (map) {
        map.remove();
      }
    };
  });
</script>

<style global>
  body {
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }


  #map { width: 100%; height: 78vh; min-height: 520px; }
  main {
    background: #f7f4f2;
    padding: 1rem;
  }

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  position: relative;
}

.topbar h1 {
  margin: 0;
}

.menu-wrap {
  position: relative;
}

.menu-btn {
  min-width: 2.25rem;
  min-height: 2.25rem;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.35rem 0.55rem;
}

.menu-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  background: #fff;
  border: 1px solid #d7d7d7;
  border-radius: 8px;
  min-width: 210px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  padding: 0.35rem;
  z-index: 20;
}

.menu-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 0.55rem 0.6rem;
}

.menu-item:hover {
  background: #f2f2f2;
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


  .error { color: #d32f2f; padding: 0.5rem; background: #ffebee; border-radius: 4px; margin-bottom: 0.5rem; }
  .success { color: #388e3c; padding: 0.5rem; background: #e8f5e9; border-radius: 4px; margin-bottom: 0.5rem; }
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .modal { background: #faf7f5; padding: 1.5rem; border-radius: 6px; width: min(95vw, 1020px); max-width: none; }
  .modal h2 { margin-top: 0; }
  .modal textarea { width: 100%; min-height: 100px; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem; box-sizing: border-box; }
  .modal input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem; box-sizing: border-box; }
  .modal-buttons { display: flex; gap: 0.5rem; }
  .modal-buttons button { flex: 1; }
  :global(.maplibregl-popup) { max-width: min(95vw, 1020px); }
  :global(.maplibregl-popup-content) { width: min(92vw, 980px); max-width: min(92vw, 980px); line-height: 1.45; white-space: normal; word-break: break-word; }
</style>

<main>

  <div class="topbar">
    <h1>Seen Here</h1>

    <div class="menu-wrap">
      <button
        class="menu-btn"
        on:click={() => showHamburgerMenu = !showHamburgerMenu}
        aria-label="Open menu"
        aria-expanded={showHamburgerMenu}
      >
        ☰
      </button>

  {#if showHamburgerMenu}
    <div class="menu-panel">

      <!-- New About button -->
      <button class="menu-item" on:click={openAboutModalFromMenu}>
        About SeenHere
      </button>

      <!-- Existing Terms button -->
      <button class="menu-item" on:click={openLegalModalFromMenu}>
        Terms of Use & Privacy Policy
      </button>

    </div>
  {/if}

    </div>
  </div>


  {#if errorMessage}
    <div class="error">{errorMessage}</div>
  {/if}

  {#if successMessage}
    <div class="success">{successMessage}</div>
  {/if}

  <div id="map"></div>
</main>

{#if showReportModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    aria-label="Close report dialog"
    on:click|self={closeReportModal}
    on:keydown|self={(e) => (e.key === 'Enter' || e.key === ' ') && closeReportModal()}
  >
    <div class="modal">
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
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    aria-label="Close create post dialog"
    on:click|self={closeCreateModal}
    on:keydown|self={(e) => (e.key === 'Enter' || e.key === ' ') && closeCreateModal()}
  >
    <div class="modal">
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

{#if showAboutModal}
  <div class="modal-backdrop" on:click={() => showAboutModal = false}></div>

  <div class="modal">
    <button class="close-btn" on:click={() => showAboutModal = false}>×</button>

    <h2>About Seen Here</h2>

    <p>
      <strong>Seen Here</strong> is an interactive map created by a survivor of gendered
      violence, designed to give other survivors a place to feel seen and heard. It invites
      survivors to anonymously pin a location on the map of Aotearoa New Zealand that
      represents their voice.
    </p>

    <p>
      Gendered violence in New Zealand remains among the highest in the developed world.
      While statistics have prompted a twenty‑five‑year government plan to address the
      issue, numbers alone cannot capture the lived experience of survivors — who are too
      often dehumanised, silenced, or retraumatised by the systems meant to support them.
    </p>

    <p>
      Abuse isolates. The simple act of placing an anonymous pin on a map is a small
      gesture with deep significance. It breaks isolation, restores humanity to the
      statistics, and reminds survivors that they are more than numbers.
    </p>

    <p><strong>Survivors are more than statistics. SeenHere.org.nz</strong></p>
  </div>
{/if}

{#if showLegalModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    aria-label="Close terms and privacy dialog"
    on:click|self={() => showLegalModal = false}
    on:keydown|self={(e) => (e.key === 'Enter' || e.key === ' ') && (showLegalModal = false)}
  >
    <div class="modal">
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
