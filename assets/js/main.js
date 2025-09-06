// SENTINEL - Main JavaScript

let currentSlide = 1;
const totalSlides = 12;

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    initializeAnimations();
    initializeCharts();
    initializeCalculator();
    startLiveCounters();
    setupKeyboardNavigation();
});

// Slide Navigation
function changeSlide(direction) {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    
    slides[currentSlide - 1].classList.remove('active');
    dots[currentSlide - 1].classList.remove('active');
    
    currentSlide += direction;
    
    if (currentSlide > totalSlides) currentSlide = 1;
    if (currentSlide < 1) currentSlide = totalSlides;
    
    slides[currentSlide - 1].classList.add('active');
    dots[currentSlide - 1].classList.add('active');
    
    // Trigger slide-specific animations
    triggerSlideAnimations(currentSlide);
}

function goToSlide(slideNumber) {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    
    slides[currentSlide - 1].classList.remove('active');
    dots[currentSlide - 1].classList.remove('active');
    
    currentSlide = slideNumber;
    
    slides[currentSlide - 1].classList.add('active');
    dots[currentSlide - 1].classList.add('active');
    
    triggerSlideAnimations(currentSlide);
}

// Keyboard Navigation
function setupKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight') changeSlide(1);
        if (e.key === 'ArrowLeft') changeSlide(-1);
        if (e.key === 'Escape') goToSlide(1);
    });
}

// Slide-specific animations
function triggerSlideAnimations(slideNum) {
    switch(slideNum) {
        case 2:
            animateCrisisStats();
            break;
        case 3:
            animateMarketChart();
            break;
        case 5:
            animateDashboard();
            break;
        case 6:
            updateCalculator();
            break;
    }
}

// Crisis Statistics Animation (Slide 2)
function animateCrisisStats() {
    // Check if CountUp is available
    if (typeof countUp !== 'undefined' && countUp.CountUp) {
        // Animate readmission rate
        const readmissionCounter = new countUp.CountUp('readmissionRate', 19.5, {
            suffix: '%',
            duration: 2,
            decimalPlaces: 1
        });
        readmissionCounter.start();
        
        // Animate Medicare cost
        const medicareCounter = new countUp.CountUp('medicareCost', 17.4, {
            prefix: '$',
            suffix: 'B',
            duration: 2.5,
            decimalPlaces: 1
        });
        medicareCounter.start();
        
        // Animate malpractice cost
        const malpracticeCounter = new countUp.CountUp('malpracticeCost', 348000, {
            prefix: '$',
            separator: ',',
            duration: 3
        });
        malpracticeCounter.start();
    } else {
        // Fallback if CountUp isn't loaded
        document.getElementById('readmissionRate').textContent = '19.5%';
        document.getElementById('medicareCost').textContent = '$17.4B';
        document.getElementById('malpracticeCost').textContent = '$348,000';
    }
}

// Live Counters (Slide 2)
function startLiveCounters() {
    let readmissions = 0;
    let cost = 0;
    
    setInterval(() => {
        // Every 5 minutes = 300 seconds, 1 readmission
        // So every 3 seconds = 0.01 readmissions
        readmissions += 0.01;
        cost = readmissions * 15000;
        
        if (document.getElementById('liveReadmissions')) {
            document.getElementById('liveReadmissions').textContent = readmissions.toFixed(0);
            document.getElementById('liveCost').textContent = '$' + cost.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }
    }, 3000);
}

// Market Chart (Slide 3)
let marketChartInstance = null;

function animateMarketChart() {
    const ctx = document.getElementById('marketChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (marketChartInstance) {
        marketChartInstance.destroy();
    }
    
    marketChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031', '2032', '2033', '2034'],
            datasets: [{
                label: 'Outpatient Surgery Market',
                data: [380, 403, 433, 465, 499, 536, 575, 617, 662, 711, 763],
                borderColor: '#ffd700',
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                tension: 0.4,
                borderWidth: 3
            }, {
                label: 'Concierge Medicine Market',
                data: [7.25, 8.0, 8.82, 9.74, 10.75, 11.86, 13.09, 14.45, 15.94, 17.59, 19.36],
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                tension: 0.4,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'white',
                        font: {
                            size: 14
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Market Growth Projections (in Billions)',
                    color: 'white',
                    font: {
                        size: 18
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: 'white',
                        callback: function(value) {
                            return '$' + value + 'B';
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: 'white'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

// Dashboard Animation (Slide 5)
let vitalsChartInstance = null;

function animateDashboard() {
    const ctx = document.getElementById('vitalsChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (vitalsChartInstance) {
        vitalsChartInstance.destroy();
    }
    
    // Simulated vital signs data
    const labels = [];
    const heartRateData = [];
    const bpData = [];
    
    for (let i = 0; i < 24; i++) {
        labels.push(i + ':00');
        heartRateData.push(65 + Math.random() * 20);
        bpData.push(110 + Math.random() * 15);
    }
    
    vitalsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Heart Rate',
                data: heartRateData,
                borderColor: '#28a745',
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.4
            }, {
                label: 'Blood Pressure',
                data: bpData,
                borderColor: '#ffc107',
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: 'white',
                        font: {
                            size: 11
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: 'white',
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: 'white',
                        font: {
                            size: 10
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

// ROI Calculator (Slide 6)
function initializeCalculator() {
    const inputs = ['monthlySurgeries', 'avgRevenue', 'readmissionRate'];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', updateCalculator);
        }
    });
}

function updateCalculator() {
    const surgeries = parseFloat(document.getElementById('monthlySurgeries')?.value || 100);
    const avgRevenue = parseFloat(document.getElementById('avgRevenue')?.value || 8000);
    const readmissionRate = parseFloat(document.getElementById('readmissionRate')?.value || 19.5) / 100;
    
    // Calculate prevented readmissions
    const preventedReadmissions = Math.round(surgeries * readmissionRate * 0.87); // 87% reduction
    const savedCosts = preventedReadmissions * 15000; // $15k per readmission
    
    // Calculate malpractice risk reduction
    const malpracticeReduction = 348000; // Average claim avoided
    
    // Calculate new patient revenue (30% increase in referrals)
    const newPatients = Math.round(surgeries * 0.3);
    const newRevenue = newPatients * avgRevenue;
    
    // Calculate total ROI
    const totalBenefit = savedCosts + malpracticeReduction + newRevenue;
    const investment = surgeries * 2352; // Gold tier pricing
    const netROI = totalBenefit - investment;
    const roiPercent = ((netROI / investment) * 100).toFixed(0);
    
    // Update display
    if (document.getElementById('preventedReadmissions')) {
        document.getElementById('preventedReadmissions').textContent = preventedReadmissions;
        document.getElementById('savedCosts').textContent = '$' + savedCosts.toLocaleString();
        document.getElementById('riskReduction').textContent = '$' + malpracticeReduction.toLocaleString();
        document.getElementById('newRevenue').textContent = '$' + newRevenue.toLocaleString();
        document.getElementById('totalROI').textContent = '$' + totalBenefit.toLocaleString();
        document.getElementById('roiPercent').textContent = roiPercent + '%';
    }
}

// CTA Functions
function scheduleCall() {
    // In production, this would open a Calendly link or similar
    alert('Opening scheduling page...\nIn production, this would connect to your calendar system.');
    window.open('https://calendly.com/sentinel-care/roi-assessment', '_blank');
}

function requestTour() {
    alert('Tour request submitted!\nOur team will contact you within 24 hours.');
}

function claimPilot() {
    alert('Congratulations! You\'ve claimed your 3 FREE pilot cases.\nOur implementation team will contact you immediately.');
}

// Initialize animations
function initializeAnimations() {
    // Add smooth scroll behavior
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Add hover effects to cards
    const cards = document.querySelectorAll('.stat-card, .solution-card, .tier-card, .metric-card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px) scale(1.02)';
        });
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
}

// Initialize charts on first load if on specific slides
function initializeCharts() {
    if (currentSlide === 3) animateMarketChart();
    if (currentSlide === 5) animateDashboard();
}

// Touch support for mobile
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
});

document.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    if (touchEndX < touchStartX - 50) {
        changeSlide(1); // Swipe left - next slide
    }
    if (touchEndX > touchStartX + 50) {
        changeSlide(-1); // Swipe right - previous slide
    }
}

// Fullscreen support
document.addEventListener('keydown', function(e) {
    if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
});

// Auto-advance timer (optional - disabled by default)
let autoAdvance = false;
let autoAdvanceTimer;

function toggleAutoAdvance() {
    autoAdvance = !autoAdvance;
    if (autoAdvance) {
        autoAdvanceTimer = setInterval(() => {
            changeSlide(1);
        }, 10000); // 10 seconds per slide
    } else {
        clearInterval(autoAdvanceTimer);
    }
}

// Add 'A' key to toggle auto-advance
document.addEventListener('keydown', function(e) {
    if (e.key === 'a' || e.key === 'A') {
        toggleAutoAdvance();
    }
});

console.log('SENTINEL Presentation System Initialized');
console.log('Controls: Arrow keys to navigate, F for fullscreen, A for auto-advance');