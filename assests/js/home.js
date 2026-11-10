// Breathing exercise: 4s in, 6s out
const btn = document.getElementById('breathBtn');
const circle = document.getElementById('circle');
const txt = document.getElementById('breathTxt');
let running = false, timer;

function cycle() {
  if (!running) return;
  circle.className = 'circle in'; txt.textContent = 'Breathe in';
  timer = setTimeout(() => {
    if (!running) return;
    circle.className = 'circle out'; txt.textContent = 'Breathe out';
    timer = setTimeout(cycle, 6000);
  }, 4000);
}
btn.addEventListener('click', () => {
  running = !running;
  btn.textContent = running ? 'Pause' : 'Start breathing';
  if (running) cycle();
  else { clearTimeout(timer); circle.className = 'circle'; txt.textContent = 'Ready?'; }
});

// Affirmations
const lines = [
  "You don't have to do everything today. One small step still counts.",
  "Rest is part of the work, not a reward for finishing it.",
  "Your worth isn't measured by your grades or your productivity.",
  "It's okay to ask for help. That's strength, not weakness.",
  "Be as kind to yourself as you'd be to a good friend.",
  "Hard days end. You've gotten through every one so far."
];
let i = 0;
const q = document.getElementById('affirm');
document.getElementById('affBtn').addEventListener('click', () => {
  q.style.opacity = 0;
  setTimeout(() => { i = (i + 1) % lines.length; q.textContent = lines[i]; q.style.opacity = 1; }, 350);
});