// ===================================
// Particles.js Configuration
// ===================================
particlesJS("particles-js", {
    "particles": {
        "number": { "value": 80, "density": { "enable": true, "value_area": 800 } },
        "color": { "value": "#ffffff" },
        "shape": { "type": "circle" },
        "opacity": { "value": 0.5, "random": true },
        "size": { "value": 3, "random": true },
        "line_linked": {
            "enable": true,
            "distance": 150,
            "color": "#ffffff",
            "opacity": 0.4,
            "width": 1
        },
        "move": {
            "enable": true,
            "speed": 2,
            "direction": "none",
            "random": false,
            "straight": false,
            "out_mode": "out",
            "bounce": false
        }
    },
    "interactivity": {
        "detect_on": "canvas",
        "events": {
            "onhover": { "enable": true, "mode": "repulse" },
            "onclick": { "enable": true, "mode": "push" },
            "resize": true
        },
        "modes": {
            "repulse": { "distance": 100, "duration": 0.4 },
            "push": { "particles_nb": 4 }
        }
    },
    "retina_detect": true
});

// ===================================
// Analytics Fetch
// ===================================
async function fetchAnalytics() {
    try {
        const response = await fetch('/api/dashboards/public/stats');
        const data = await response.json();

        document.getElementById('solved-count').textContent = data.solved;
        document.getElementById('unresolved-count').textContent = data.unresolved;

        // Update Chart
        updateChart(data.solved, data.unresolved);
    } catch (error) {
        console.error('Error fetching analytics:', error);
    }
}

// ===================================
// Chart.js Implementation
// ===================================
let chartInstance = null;

function updateChart(solved, unresolved) {
    const ctx = document.getElementById('complaintChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Solved', 'Unresolved'],
            datasets: [{
                label: 'Complaint Status',
                data: [solved, unresolved],
                backgroundColor: ['#28a745', '#dc3545'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    fetchAnalytics();
    setInterval(fetchAnalytics, 30000); // Refresh every 30 seconds
});