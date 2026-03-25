document.addEventListener('DOMContentLoaded', () => {
    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 60);
    });

    // Mobile menu toggle
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        const spans = navToggle.querySelectorAll('span');
        if (navLinks.classList.contains('open')) {
            spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
            spans[1].style.opacity = '0';
            spans[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
        } else {
            spans[0].style.transform = '';
            spans[1].style.opacity = '';
            spans[2].style.transform = '';
        }
    });

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
            const spans = navToggle.querySelectorAll('span');
            spans[0].style.transform = '';
            spans[1].style.opacity = '';
            spans[2].style.transform = '';
        });
    });

    // Adjust hero spacer height based on image
    const heroImg = document.querySelector('.hero-bg img');
    const heroSpacer = document.querySelector('.hero-spacer');
    const heroContent = document.querySelector('.hero-content');
    
    function adjustHeroSpacer() {
        if (heroImg && heroSpacer) {
            const imgHeight = heroImg.offsetHeight;
            heroSpacer.style.height = imgHeight + 'px';
            
            // Also adjust hero-content height for sticky to work
            if (heroContent) {
                heroContent.style.minHeight = imgHeight + 'px';
            }
        }
    }
    
    // Adjust on load and resize
    heroImg.addEventListener('load', adjustHeroSpacer);
    window.addEventListener('resize', adjustHeroSpacer);
    
    // Initial adjustment
    adjustHeroSpacer();

    // Scroll reveal
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.15 });

    reveals.forEach(el => observer.observe(el));

    // Hero particles
    const particlesContainer = document.getElementById('heroParticles');
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = 60 + Math.random() * 40 + '%';
        p.style.animationDelay = Math.random() * 6 + 's';
        p.style.animationDuration = 4 + Math.random() * 4 + 's';
        const size = 2 + Math.random() * 4;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        particlesContainer.appendChild(p);
    }

    // Parallax on hero - disabled for full image display
    // const heroBg = document.querySelector('.hero-bg img');
    // window.addEventListener('scroll', () => {
    //     const scrolled = window.scrollY;
    //     if (scrolled < window.innerHeight) {
    //         heroBg.style.transform = `translateY(${scrolled * 0.3}px)`;
    //     }
    // });

    // Progress bar animation
    const progressBars = document.querySelectorAll('.progress-bar-fill');
    const progressObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const width = entry.target.style.width;
                entry.target.style.width = '0%';
                setTimeout(() => {
                    entry.target.style.width = width;
                }, 200);
            }
        });
    }, { threshold: 0.5 });

    progressBars.forEach(bar => progressObserver.observe(bar));

    // PayPal subscription buttons
});
