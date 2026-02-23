class Starfield {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.stars = [];
        this.numStars = 200;
        this.resizeTimeout = null;
        
        this.resize();
        this.init();
        this.animate();
        
        window.addEventListener('resize', () => this.handleResize());
    }
    
    handleResize() {
        // Debounce resize to avoid too many recalculations
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.resize();
        }, 100);
    }
    
    resize() {
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;
        
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Scale existing star positions proportionally
        if (oldWidth > 0 && oldHeight > 0 && this.stars.length > 0) {
            const scaleX = this.canvas.width / oldWidth;
            const scaleY = this.canvas.height / oldHeight;
            
            this.stars.forEach(star => {
                star.x *= scaleX;
                star.y *= scaleY;
            });
            
            // Adjust star count based on new canvas area to maintain density
            const oldArea = oldWidth * oldHeight;
            const newArea = this.canvas.width * this.canvas.height;
            const targetStars = Math.round(this.numStars * (newArea / (oldArea || 1)));
            
            // Add stars if canvas got bigger
            while (this.stars.length < targetStars) {
                this.stars.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    radius: Math.random() * 1.5,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    opacity: Math.random()
                });
            }
            
            // Remove stars if canvas got smaller
            while (this.stars.length > targetStars) {
                this.stars.pop();
            }
        }
    }
    
    init() {
        this.stars = [];
        for (let i = 0; i < this.numStars; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 1.5,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                opacity: Math.random()
            });
        }
    }
    
    animate() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.stars.forEach(star => {
            star.x += star.vx;
            star.y += star.vy;
            
            if (star.x < 0 || star.x > this.canvas.width) star.vx *= -1;
            if (star.y < 0 || star.y > this.canvas.height) star.vy *= -1;
            
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
            this.ctx.fill();
        });
        
        requestAnimationFrame(() => this.animate());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Starfield('starfield');
});
