/**
 * nav.js — transição suave ao navegar entre catecismos.
 * Intercepta cliques em .btn-outro-catecismo e faz fade-out antes de navegar.
 */
document.querySelectorAll('.btn-outro-catecismo').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const href = link.href;
    document.body.classList.add('page-saindo');
    setTimeout(() => { window.location.href = href; }, 270);
  });
});
