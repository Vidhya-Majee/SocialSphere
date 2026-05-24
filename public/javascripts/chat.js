(function () {
  const cfg = window.CHAT_CONFIG;
  if (!cfg) return;

  const box = document.getElementById('chatMessages');
  const form = document.getElementById('chatForm');
  const textInput = document.getElementById('chatTextInput');
  const imageInput = document.getElementById('chatImageInput');
  const sendShareBtn = document.getElementById('sendShareBtn');
  const cancelShareBtn = document.getElementById('cancelShareBtn');
  const sharePreview = document.getElementById('sharePreview');

  let lastTime = null;
  const existing = box.querySelectorAll('.chat-bubble');
  if (existing.length) {
    lastTime = existing[existing.length - 1].dataset.time || null;
  }

  function scrollBottom() {
    box.scrollTop = box.scrollHeight;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function profileSrc(pic) {
    if (!pic) return cfg.defaultAvatar;
    return cfg.profileImgBase + encodeURIComponent(pic);
  }

  function renderMessage(m) {
    const mine = m.sender && String(m.sender._id) === String(cfg.myId);
    const wrap = document.createElement('div');
    wrap.className = 'chat-bubble' + (mine ? ' chat-bubble--mine' : '');
    wrap.dataset.id = m._id;
    wrap.dataset.time = typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString();

    let inner = '';
    if (!mine && m.sender) {
      inner += `<img class="avatar chat-bubble__avatar" src="${profileSrc(m.sender.profilepic)}" alt="">`;
    }
    inner += '<div class="chat-bubble__content">';

    if (m.type === 'text') {
      inner += `<p class="chat-bubble__text">${esc(m.text)}</p>`;
    } else if (m.type === 'link') {
      inner += `<p class="chat-bubble__text">${esc(m.text)}</p>`;
      inner += `<a href="${esc(m.linkUrl)}" target="_blank" rel="noopener" class="chat-link-card"><i class="fas fa-link"></i> ${esc(m.linkUrl)}</a>`;
    } else if (m.type === 'image') {
      inner += `<img class="chat-bubble__image" src="${cfg.profileImgBase}${encodeURIComponent(m.image)}" alt="">`;
      if (m.text && m.text.trim()) inner += `<p class="chat-bubble__text">${esc(m.text)}</p>`;
    } else if (m.type === 'post' && m.post) {
      const pu = m.post.user || {};
      inner += '<div class="chat-post-share">';
      inner += `<div class="chat-post-share__head"><img class="avatar" src="${profileSrc(pu.profilepic)}" alt=""><strong>${esc(pu.username || 'post')}</strong></div>`;
      if (m.post.image) inner += `<img src="${cfg.profileImgBase}${encodeURIComponent(m.post.image)}" alt="">`;
      if (m.post.content && m.post.content.trim()) {
        const t = m.post.content.trim();
        inner += `<p>${esc(t.slice(0, 120))}${t.length > 120 ? '…' : ''}</p>`;
      }
      inner += `<a href="/feed#post-${m.post._id}" class="text-link">View post</a></div>`;
    }

    inner += '</div>';
    wrap.innerHTML = inner;
    return wrap;
  }

  function appendMessages(list) {
    const ids = new Set([...box.querySelectorAll('.chat-bubble')].map((el) => el.dataset.id));
    let added = false;
    list.forEach((m) => {
      if (ids.has(m._id)) return;
      box.appendChild(renderMessage(m));
      lastTime = m.createdAt;
      added = true;
    });
    if (added) scrollBottom();
  }

  async function poll() {
    try {
      const url = `/api/messages/${cfg.conversationId}` + (lastTime ? `?after=${encodeURIComponent(lastTime)}` : '');
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages && data.messages.length) appendMessages(data.messages);
    } catch (_) {}
  }

  async function sendPayload(formData) {
    const res = await fetch('/messages/send', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Send failed');
    if (data.message) appendMessages([data.message]);
    return data;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      if (!fd.get('text') && !fd.get('image')?.name) return;
      try {
        await sendPayload(fd);
        textInput.value = '';
        if (imageInput) imageInput.value = '';
      } catch (err) {
        alert(err.message || 'Could not send');
      }
    });
  }

  if (sendShareBtn) {
    sendShareBtn.addEventListener('click', async () => {
      const fd = new FormData();
      fd.append('conversationId', cfg.conversationId);
      fd.append('postId', sendShareBtn.dataset.postId);
      fd.append('text', 'Shared a post');
      try {
        await sendPayload(fd);
        if (sharePreview) sharePreview.remove();
      } catch (err) {
        alert(err.message || 'Could not share');
      }
    });
  }

  if (cancelShareBtn && sharePreview) {
    cancelShareBtn.addEventListener('click', () => sharePreview.remove());
  }

  scrollBottom();
  setInterval(poll, 2500);
})();
