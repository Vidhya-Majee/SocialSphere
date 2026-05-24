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

  document.querySelectorAll('.comment-form input').forEach((input) => {
    const form = input.closest('form');
    const btn = form && form.querySelector('button[type="submit"]');
    if (!btn) return;
    const sync = () => { btn.disabled = !input.value.trim(); };
    input.addEventListener('input', sync);
    sync();
  });

  document.querySelectorAll('[data-like]').forEach((el) => {
    el.addEventListener('click', () => el.classList.add('heart-pop'));
  });

  const fileInputs = document.querySelectorAll('[data-file-label]');
  fileInputs.forEach((input) => {
    const label = document.querySelector(input.getAttribute('data-file-label'));
    if (!label) return;
    input.addEventListener('change', () => {
      const name = input.files[0] ? input.files[0].name : 'Add photo';
      label.textContent = name.length > 24 ? name.slice(0, 21) + '...' : name;
    });
  });
})();
