document.addEventListener("DOMContentLoaded", () => {
    const user = JSON.parse(localStorage.getItem('scrs_user'));
    
    if (!user || user.role !== 'Student') {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('welcome-text').textContent = `Hello, ${user.username}!`;

    const complaintForm = document.getElementById('complaint-form');
    const complaintList = document.getElementById('complaint-list');

    // Load initial complaints
    fetchComplaints();

    // Handle Submission
    complaintForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = complaintForm.querySelector('button');
        const token = localStorage.getItem('scrs_token');
        
        btn.textContent = 'Submitting...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('student_id', user.student_id);
        formData.append('title', document.getElementById('complaint-title').value);
        formData.append('category', document.getElementById('complaint-category').value);
        formData.append('location', document.getElementById('complaint-location').value);
        formData.append('description', document.getElementById('complaint-description').value);
        formData.append('priority', document.getElementById('complaint-priority').value);
        
        const mediaFile = document.getElementById('complaint-media').files[0];
        if (mediaFile) {
            formData.append('media', mediaFile);
        }

        try {
            const response = await fetch(`${API_BASE}/api/complaints/submit`, {
                method: 'POST',
                headers: { 
                    // Note: Browser automatically sets Content-Type to multipart/form-data with boundary when using FormData
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                alert('Complaint submitted!');
                complaintForm.reset();
                fetchComplaints();
            } else {
                alert('Submission failed: ' + data.message);
            }
        } catch (error) {
            console.error('Submission error:', error);
            alert('Error submitting complaint');
        } finally {
            btn.textContent = 'Submit Complaint';
            btn.disabled = false;
        }
    });

    // Initialize Socket.io and Room
    const socket = io(API_BASE);
    socket.emit('join', `student_${user.student_id}`);

    socket.on('status_updated', (data) => {
        console.log('Real-time update received:', data);
        // Optionally show a notification toast here
        fetchComplaints();
    });

    // Load initial complaints
    fetchComplaints();

    async function fetchComplaints() {
        try {
            const token = localStorage.getItem('scrs_token');
            const response = await fetch(`${API_BASE}/api/complaints/student/${user.student_id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.success) {
                renderComplaints(data.complaints);
            }
        } catch (error) {
            console.error('Error fetching complaints:', error);
        }
    }

    function renderComplaints(complaints) {
        if (complaints.length === 0) {
            complaintList.innerHTML = '<p class="text-center" style="color: var(--text-secondary); padding: 2rem;">No reports yet.</p>';
            return;
        }

        complaintList.innerHTML = complaints.map(c => {
            const isVideo = c.media_url && (c.media_url.endsWith('.mp4') || c.media_url.endsWith('.mov') || c.media_url.includes('/video/upload/'));
            
            return `
            <div class="complaint-card glass-panel" style="margin-bottom: 1.5rem; padding: 1.5rem; border-left: 4px solid var(--gold);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}" style="font-weight: 800;">${c.status}</span>
                        <span class="status-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); margin-left: 0.5rem; font-size: 0.75rem;">
                             ${c.priority || 'Medium'} Priority
                        </span>
                    </div>
                    <small style="color: var(--text-secondary); opacity: 0.7;">${new Date(c.created_at).toLocaleString()}</small>
                </div>
                
                <h3 style="margin-bottom: 0.5rem; color: white; font-weight: 700;">${c.title || c.category}</h3>
                <div style="margin-bottom: 1rem; font-size: 0.85rem; color: var(--gold); opacity: 0.8; font-weight: 600;">
                    <i class="fa-solid fa-location-dot"></i> ${c.location} | <i class="fa-solid fa-tag"></i> ${c.category}
                </div>
                
                <p style="font-size: 0.95rem; color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 1.5rem;">${c.description}</p>
                
                ${c.media_url ? `
                    <div class="media-preview" style="margin-top: 1rem; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); max-width: 400px;">
                        ${isVideo ? 
                            `<video src="${c.media_url}" controls style="width: 100%; display: block;"></video>` : 
                            `<img src="${c.media_url}" style="width: 100%; display: block; cursor: pointer;" onclick="window.open('${c.media_url}', '_blank')">`
                        }
                    </div>
                ` : ''}
                
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fa-solid fa-building"></i> Assigned: <strong>${c.department_name}</strong></span>
                    <span style="font-family: monospace; opacity: 0.5;">ID: #${c.id}</span>
                </div>
            </div>
        `}).join('');
    }
});

function logout() {
    localStorage.removeItem('scrs_token');
    localStorage.removeItem('scrs_user');
    window.location.href = 'login.html';
}
