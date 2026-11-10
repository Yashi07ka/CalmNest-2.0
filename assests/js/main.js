document.documentElement.classList.add('js');

const burger = document.querySelector('.burger');
const links = document.querySelector('.links');
if (burger) {
  burger.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
}

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

const yr = document.getElementById('year');
if (yr) yr.textContent = new Date().getFullYear();