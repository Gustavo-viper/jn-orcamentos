// aplica o tema antes da renderização (evita "piscar")
try {
  var t = localStorage.getItem('jn_theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
