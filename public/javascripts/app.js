(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem('ss-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  root.setAttribute('data-theme', theme);

  window.toggleTheme = function () {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('ss-theme', next);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  };

  // Enable/disable comment submit button
  document.querySelectorAll('.comment-form input').forEach((input) => {
    const form = input.closest('form');
    const btn = form && form.querySelector('button[type="submit"]');
    if (!btn) return;
    const sync = () => { btn.disabled = !input.value.trim(); };
    input.addEventListener('input', sync);
    sync();
  });

  // Client-side image filter selection & FileReader preview
  const composeImageInput = document.getElementById('composeImageInput');
  const postPreviewContainer = document.getElementById('postPreviewContainer');
  const postPreviewImage = document.getElementById('postPreviewImage');
  const postFilterInput = document.getElementById('postFilterInput');

  if (composeImageInput && postPreviewContainer && postPreviewImage) {
    composeImageInput.addEventListener('change', function () {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          postPreviewImage.src = e.target.result;
          postPreviewContainer.style.display = 'block';
          
          // Update the thumbnails preview images
          postPreviewContainer.querySelectorAll('.filter-option img').forEach(img => {
            img.src = e.target.result;
          });
        };
        reader.readAsDataURL(file);
      } else {
        postPreviewContainer.style.display = 'none';
        postPreviewImage.src = '';
      }
    });

    // Handle filter option clicks
    postPreviewContainer.querySelectorAll('.filter-option').forEach(opt => {
      opt.addEventListener('click', function () {
        // Toggle active border
        postPreviewContainer.querySelectorAll('.filter-option div').forEach(div => {
          div.style.borderColor = 'transparent';
        });
        this.querySelector('div').style.borderColor = 'var(--text-link)';
        
        // Update input and main preview style class
        const filter = this.dataset.filter;
        postFilterInput.value = filter;
        
        // Clear old filter classes and add new one
        postPreviewImage.className = '';
        if (filter !== 'filter-normal') {
          postPreviewImage.classList.add(filter);
        }
      });
    });
  }

  // Intercept standard like clicks to run asynchronously via Ajax
  document.querySelectorAll('a[data-like]').forEach((btn) => {
    // Save href value and remove it to prevent page reload
    const originalHref = btn.getAttribute('href');
    btn.removeAttribute('href');
    btn.style.cursor = 'pointer';
    
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      const card = this.closest('article.card');
      const postId = card.id.replace('post-', '');
      
      // Snappy UI update
      const isLiked = this.classList.toggle('liked');
      const icon = this.querySelector('i');
      if (isLiked) {
        icon.className = 'fas fa-heart';
        this.classList.add('heart-pop');
        setTimeout(() => this.classList.remove('heart-pop'), 350);
      } else {
        icon.className = 'far fa-heart';
      }

      try {
        const res = await fetch(`/like/${postId}?ajax=1`, { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          const meta = card.querySelector('.post-meta');
          let likesCountEl = meta.querySelector('.likes-count');
          if (data.likesCount > 0) {
            if (!likesCountEl) {
              likesCountEl = document.createElement('p');
              likesCountEl.className = 'likes-count';
              meta.insertBefore(likesCountEl, meta.firstChild);
            }
            likesCountEl.textContent = `${data.likesCount} like${data.likesCount === 1 ? '' : 's'}`;
          } else if (likesCountEl) {
            likesCountEl.remove();
          }
        }
      } catch (err) {
        console.error('Like error:', err);
      }
    });
  });

  // Handle double-tap to like on post images
  document.querySelectorAll('article.card').forEach(card => {
    const wrap = card.querySelector('.post-image-wrap');
    if (!wrap) return;

    let lastTap = 0;
    wrap.addEventListener('click', function (e) {
      const now = Date.now();
      if (now - lastTap < 300) {
        // Double tap!
        triggerDoubleTapLike(card, e, wrap);
      }
      lastTap = now;
    });
  });

  function triggerDoubleTapLike(card, e, wrap) {
    // 1. Show floating heart popup animation
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const heart = document.createElement('i');
    heart.className = 'fas fa-heart double-tap-heart';
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    wrap.appendChild(heart);

    setTimeout(() => {
      heart.remove();
    }, 800);

    // 2. Trigger click on like button to perform AJAX like
    const likeBtn = card.querySelector('a[data-like]');
    const liked = likeBtn && likeBtn.classList.contains('liked');
    if (likeBtn && !liked) {
      likeBtn.click();
    }
  }

  // Update label for file name
  const fileInputs = document.querySelectorAll('[data-file-label]');
  fileInputs.forEach((input) => {
    const label = document.querySelector(input.getAttribute('data-file-label'));
    if (!label) return;
    input.addEventListener('change', () => {
      const name = input.files[0] ? input.files[0].name : 'Add photo';
      label.textContent = name.length > 24 ? name.slice(0, 21) + '...' : name;
    });
  });

  // --- Stories Fullscreen Player Controller ---
  const storyBridge = document.getElementById('storyDataBridge');
  if (storyBridge) {
    try {
      window.STORY_DATA = JSON.parse(storyBridge.dataset.stories);
      window.LOGGED_IN_USER = storyBridge.dataset.loggedInUser;
    } catch (err) {
      console.error('Error parsing STORY_DATA:', err);
      window.STORY_DATA = [];
      window.LOGGED_IN_USER = '';
    }
  }

  let currentUserIndex = 0;
  let currentSlideIndex = 0;
  let storyTimer = null;
  let storyPercent = 0;
  const storyDuration = 5000;
  const storyStep = 100;
  const storyIncrement = (storyStep / storyDuration) * 100;

  window.openStoryViewer = function(idx) {
    if (!window.STORY_DATA || !window.STORY_DATA[idx]) return;
    currentUserIndex = idx;
    currentSlideIndex = 0;
    
    const modal = document.getElementById('storyViewerModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.style.opacity = '1';
    }, 10);
    
    const input = document.getElementById('storyReplyText');
    if (input) {
      input.value = '';
      input.placeholder = 'Send message...';
    }
    
    renderActiveSlide();
  };

  window.closeStoryViewer = function() {
    clearInterval(storyTimer);
    const modal = document.getElementById('storyViewerModal');
    if (!modal) return;
    modal.style.opacity = '0';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  };

  // Bind Story Bubble Click events
  document.querySelectorAll('[data-story-trigger]').forEach(btn => {
    btn.addEventListener('click', function () {
      const idx = parseInt(this.dataset.storyTrigger, 10);
      window.openStoryViewer(idx);
    });
  });

  function startStoryTimer() {
    clearInterval(storyTimer);
    storyPercent = 0;
    updateProgressBars();
    
    storyTimer = setInterval(() => {
      storyPercent += storyIncrement;
      if (storyPercent >= 100) {
        storyPercent = 100;
        updateProgressBars();
        clearInterval(storyTimer);
        nextSlide();
      } else {
        updateProgressBars();
      }
    }, storyStep);
  }

  function updateProgressBars() {
    const bars = document.querySelectorAll('.story-progress-fill');
    bars.forEach((bar, idx) => {
      if (idx < currentSlideIndex) {
        bar.style.width = '100%';
      } else if (idx > currentSlideIndex) {
        bar.style.width = '0%';
      } else {
        bar.style.width = `${storyPercent}%`;
      }
    });
  }

  function renderActiveSlide() {
    const user = window.STORY_DATA[currentUserIndex];
    if (!user) return closeStoryViewer();
    
    const slide = user.slides[currentSlideIndex];
    if (!slide) return nextUser();
    
    const avatarImg = document.getElementById('storyUserAvatar');
    const usernameEl = document.getElementById('storyUsername');
    const userLink = document.getElementById('storyUserLink');
    const timeEl = document.getElementById('storyTime');
    
    if (avatarImg) avatarImg.src = user.profilepic;
    if (usernameEl) usernameEl.textContent = user.username;
    if (userLink) userLink.href = `/u/${user.username}`;
    if (timeEl) timeEl.textContent = slide.id === 'fallback' ? 'active now' : 'recent post';

    const isSelf = (user.username === window.LOGGED_IN_USER);
    const replyForm = document.getElementById('storyReplyForm');
    if (replyForm) {
      replyForm.style.display = isSelf ? 'none' : 'flex';
    }

    const deleteBtn = document.getElementById('storyDeleteBtn');
    if (deleteBtn) {
      deleteBtn.style.display = (isSelf && slide.id !== 'fallback') ? 'block' : 'none';
    }

    // Progress Indicators
    const progressContainer = document.getElementById('storyProgressIndicators');
    if (progressContainer) {
      progressContainer.innerHTML = '';
      user.slides.forEach(() => {
        const bar = document.createElement('div');
        bar.className = 'story-progress-bar';
        const fill = document.createElement('div');
        fill.className = 'story-progress-fill';
        bar.appendChild(fill);
        progressContainer.appendChild(bar);
      });
    }

    const body = document.getElementById('storySlideContent');
    const fallbackBg = document.getElementById('storyFallbackBg');
    
    if (slide.id === 'fallback') {
      if (fallbackBg) {
        fallbackBg.style.display = 'block';
        fallbackBg.style.backgroundImage = `url('${slide.profilepic}')`;
      }
      if (body) {
        body.innerHTML = `
          <div style="text-align: center; color: #fff; padding: 2rem; z-index: 1003;">
            <img src="${slide.profilepic}" style="width: 130px; height: 130px; border-radius: 50%; border: 4px solid #fff; margin: 0 auto 1.5rem; object-fit: cover; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
            <p style="font-size: 1.2rem; font-weight: 600; line-height: 1.6; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">${slide.content}</p>
          </div>
        `;
      }
    } else if (!slide.image) {
      if (fallbackBg) {
        fallbackBg.style.display = 'none';
      }
      if (body) {
        body.innerHTML = `
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); padding: 2rem; box-sizing: border-box; text-align: center; border-radius: 12px; overflow: hidden;">
            <p style="color: #fff; font-size: 1.65rem; font-weight: 700; line-height: 1.5; text-shadow: 0 2px 10px rgba(0,0,0,0.35); max-width: 85%; word-wrap: break-word; margin: 0; font-family: 'Outfit', 'Inter', sans-serif;">
              ${slide.content}
            </p>
          </div>
        `;
      }
    } else {
      if (fallbackBg) {
        fallbackBg.style.display = 'block';
        fallbackBg.style.backgroundImage = `url('${slide.image}')`;
      }
      if (body) {
        body.innerHTML = `
          <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative;">
            <img src="${slide.image}" style="width: 100%; max-height: 75vh; object-fit: contain; z-index: 1003; box-shadow: 0 4px 20px rgba(0,0,0,0.6);">
            ${slide.content ? `
              <div style="position: absolute; bottom: 85px; left: 20px; right: 20px; background: rgba(0,0,0,0.65); padding: 12px 16px; border-radius: 12px; backdrop-filter: blur(5px); z-index: 1004;">
                <p style="color: #fff; font-size: 0.9rem; margin: 0; line-height: 1.4; text-align: center;">${slide.content}</p>
              </div>
            ` : ''}
          </div>
        `;
      }
    }
    
    startStoryTimer();
  }

  function nextSlide() {
    const user = window.STORY_DATA[currentUserIndex];
    if (!user) return closeStoryViewer();
    if (currentSlideIndex < user.slides.length - 1) {
      currentSlideIndex++;
      renderActiveSlide();
    } else {
      nextUser();
    }
  }

  function prevSlide() {
    if (currentSlideIndex > 0) {
      currentSlideIndex--;
      renderActiveSlide();
    } else {
      prevUser();
    }
  }

  function nextUser() {
    if (currentUserIndex < window.STORY_DATA.length - 1) {
      currentUserIndex++;
      currentSlideIndex = 0;
      renderActiveSlide();
    } else {
      closeStoryViewer();
    }
  }

  function prevUser() {
    if (currentUserIndex > 0) {
      currentUserIndex--;
      const user = window.STORY_DATA[currentUserIndex];
      currentSlideIndex = user.slides.length - 1;
      renderActiveSlide();
    } else {
      currentSlideIndex = 0;
      renderActiveSlide();
    }
  }

  // Setup Tap Handlers
  const tapLeft = document.getElementById('storyTapLeft');
  const tapRight = document.getElementById('storyTapRight');
  const closeBtn = document.getElementById('storyCloseBtn');
  
  if (tapLeft) tapLeft.addEventListener('click', prevSlide);
  if (tapRight) tapRight.addEventListener('click', nextSlide);
  if (closeBtn) closeBtn.addEventListener('click', closeStoryViewer);

  // Story DM Reply Handler
  const replyForm = document.getElementById('storyReplyForm');
  if (replyForm) {
    replyForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const input = document.getElementById('storyReplyText');
      const text = input.value.trim();
      if (!text) return;
      
      const user = window.STORY_DATA[currentUserIndex];
      if (!user) return;
      
      // Pause
      clearInterval(storyTimer);
      input.disabled = true;
      
      const slide = user.slides[currentSlideIndex];
      const payload = {
        toUsername: user.username,
        text: text
      };
      if (slide && slide.id !== 'fallback') {
        payload.postId = slide.id;
      }
      
      try {
        const res = await fetch('/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          input.value = '';
          input.placeholder = 'Reply sent!';
        } else {
          input.placeholder = 'Could not send...';
        }
      } catch (err) {
        console.error('Error sending story reply:', err);
        input.placeholder = 'Error sending...';
      } finally {
        input.disabled = false;
        setTimeout(() => {
          input.placeholder = 'Send message...';
        }, 2000);
        startStoryTimer();
      }
    });
  }

  // --- Quick-Share Sheet Controller ---
  let activeSharePostId = null;

  window.openQuickShare = function(postId) {
    activeSharePostId = postId;
    const overlay = document.getElementById('quickShareOverlay');
    const sheet = document.getElementById('quickShareSheet');
    if (!overlay || !sheet) return;
    
    // Reset Send buttons
    overlay.querySelectorAll('.quick-send-btn').forEach(btn => {
      btn.innerHTML = 'Send';
      btn.disabled = false;
      btn.style.background = '';
    });
    
    // Reset search filter
    const search = document.getElementById('quickShareSearch');
    if (search) search.value = '';
    
    overlay.querySelectorAll('.quick-share-row').forEach(row => {
      row.style.display = 'flex';
    });

    overlay.style.display = 'flex';
    setTimeout(() => {
      overlay.style.opacity = '1';
      sheet.style.transform = 'translateY(0)';
    }, 10);
  };

  window.closeQuickShare = function() {
    const overlay = document.getElementById('quickShareOverlay');
    const sheet = document.getElementById('quickShareSheet');
    if (!overlay || !sheet) return;
    
    overlay.style.opacity = '0';
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
  };

  // Click on backdrop to close
  const shareOverlay = document.getElementById('quickShareOverlay');
  if (shareOverlay) {
    shareOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeQuickShare();
    });
  }

  // Filter friends on search input
  const shareSearch = document.getElementById('quickShareSearch');
  if (shareSearch) {
    shareSearch.addEventListener('input', function() {
      const q = this.value.trim().toLowerCase();
      document.querySelectorAll('.quick-share-row').forEach(row => {
        const username = row.dataset.username || '';
        const name = row.dataset.name || '';
        if (username.includes(q) || name.includes(q)) {
          row.style.display = 'flex';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // Quick Send Button AJAX handler
  document.querySelectorAll('.quick-send-btn').forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.preventDefault();
      const toUsername = this.dataset.toUsername;
      if (!toUsername || !activeSharePostId) return;
      
      this.disabled = true;
      this.textContent = 'Sending...';
      
      try {
        const res = await fetch('/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({
            toUsername: toUsername,
            postId: activeSharePostId
          })
        });
        
        if (res.ok) {
          this.innerHTML = '<i class="fas fa-check"></i> Sent';
          this.style.background = '#34c759'; // Success green
        } else {
          this.textContent = 'Failed';
          this.disabled = false;
        }
      } catch (err) {
        console.error('Error in quick share send:', err);
        this.textContent = 'Error';
        this.disabled = false;
      }
    });
  });

  // --- Dedicated Story Upload Modal Controller ---
  window.triggerStoryUpload = function() {
    closeStoryViewer(); // Close viewer if open
    
    const modal = document.getElementById('storyUploadModal');
    if (!modal) return;
    
    // Reset Form
    const form = document.getElementById('storyUploadForm');
    if (form) form.reset();
    
    document.getElementById('storyPreviewWrap').style.display = 'none';
    document.getElementById('storyPreviewImg').src = '';
    document.getElementById('storyPreviewImg').className = '';
    document.getElementById('storyFilterSelector').style.display = 'none';
    document.getElementById('storyUploadBtnWrap').style.display = 'block';
    document.getElementById('storySubmitBtn').disabled = true;
    document.getElementById('storyFilterInput').value = 'filter-normal';
    
    // Reset filter active borders
    document.querySelectorAll('.story-filter-opt div').forEach(div => {
      div.style.borderColor = 'transparent';
    });
    const firstOpt = document.querySelector('.story-filter-opt div');
    if (firstOpt) firstOpt.style.borderColor = 'var(--text-link)';

    modal.style.display = 'flex';
    setTimeout(() => {
      modal.style.opacity = '1';
    }, 10);
  };

  window.closeStoryUploadModal = function() {
    const modal = document.getElementById('storyUploadModal');
    if (!modal) return;
    
    modal.style.opacity = '0';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  };

  // Close story upload on background click
  const storyUploadModal = document.getElementById('storyUploadModal');
  if (storyUploadModal) {
    storyUploadModal.addEventListener('click', function(e) {
      if (e.target === this) closeStoryUploadModal();
    });
  }

  // Validate Story Form fields
  function validateStoryForm() {
    const hasImg = !!document.getElementById('storyImageInput').files[0];
    const hasText = !!document.getElementById('storyContentText').value.trim();
    const submitBtn = document.getElementById('storySubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = !(hasImg || hasText);
    }
  }

  // Cancel selected image to allow text-only stories
  window.cancelSelectedStoryImage = function() {
    const input = document.getElementById('storyImageInput');
    if (input) input.value = '';
    
    document.getElementById('storyPreviewWrap').style.display = 'none';
    document.getElementById('storyPreviewImg').src = '';
    document.getElementById('storyPreviewImg').className = '';
    document.getElementById('storyFilterSelector').style.display = 'none';
    document.getElementById('storyUploadBtnWrap').style.display = 'block';
    document.getElementById('storyFilterInput').value = 'filter-normal';
    
    validateStoryForm();
  };

  // Handle Story Image input change
  const storyImageInput = document.getElementById('storyImageInput');
  if (storyImageInput) {
    storyImageInput.addEventListener('change', function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          document.getElementById('storyPreviewImg').src = e.target.result;
          document.getElementById('storyPreviewWrap').style.display = 'block';
          document.getElementById('storyFilterSelector').style.display = 'block';
          document.getElementById('storyUploadBtnWrap').style.display = 'none';
          
          // Populate filter previews
          document.querySelectorAll('.story-filter-thumb').forEach(img => {
            img.src = e.target.result;
          });
          
          validateStoryForm();
        };
        reader.readAsDataURL(file);
      } else {
        window.cancelSelectedStoryImage();
      }
    });
  }

  // Handle Caption text changes
  const storyContentText = document.getElementById('storyContentText');
  if (storyContentText) {
    storyContentText.addEventListener('input', validateStoryForm);
  }

  // Handle Story Filter Selection clicks
  document.querySelectorAll('.story-filter-opt').forEach(opt => {
    opt.addEventListener('click', function() {
      // Toggle active border
      document.querySelectorAll('.story-filter-opt div').forEach(div => {
        div.style.borderColor = 'transparent';
      });
      this.querySelector('div').style.borderColor = 'var(--text-link)';
      
      const filter = this.dataset.filter;
      document.getElementById('storyFilterInput').value = filter;
      
      const previewImg = document.getElementById('storyPreviewImg');
      if (previewImg) {
        previewImg.className = '';
        if (filter !== 'filter-normal') {
          previewImg.classList.add(filter);
        }
      }
    });
  });

  // Handle permanent deletion of story slides
  const storyDeleteBtn = document.getElementById('storyDeleteBtn');
  if (storyDeleteBtn) {
    storyDeleteBtn.addEventListener('click', async function() {
      const user = window.STORY_DATA[currentUserIndex];
      if (!user) return;
      const slide = user.slides[currentSlideIndex];
      if (!slide || slide.id === 'fallback') return;

      if (!confirm('Delete this story slide permanently?')) return;

      // Pause story play
      clearInterval(storyTimer);
      storyDeleteBtn.disabled = true;

      try {
        const res = await fetch(`/delete/${slide.id}`, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
          }
        });
        
        if (res.ok) {
          // Slide deleted! Reload page to update EJS queries
          window.location.reload();
        } else {
          alert('Could not delete story slide. Please try again.');
          startStoryTimer();
        }
      } catch (err) {
        console.error('Delete story error:', err);
        alert('Could not delete story slide. Please try again.');
        startStoryTimer();
      } finally {
        storyDeleteBtn.disabled = false;
      }
    });
  }
})();
