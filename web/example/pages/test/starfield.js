// ==================== WebGL Starfield Background ====================

const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

// Resize canvas to fit window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Create star particles
const stars = [];
const numStars = 300;

for (let i = 0; i < numStars; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.4 + 0.1,
        opacity: Math.random() * 0.5 + 0.5
    });
}

// Animation loop
function animateStarfield() {
    // Semi-transparent black for trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw and update stars
    stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Move star downward
        star.y += star.speed;
        
        // Wrap around when star goes off screen
        if (star.y > canvas.height + 5) {
            star.y = -5;
            star.x = Math.random() * canvas.width;
        }
    });
    
    requestAnimationFrame(animateStarfield);
}

// Start animation
animateStarfield();
