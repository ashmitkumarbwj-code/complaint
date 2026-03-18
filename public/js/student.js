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
        formData.append('category', document.getElementById('complaint-category').value);
        formData.append('location', document.getElementById('complaint-location').value);
        formData.append('description', document.getElementById('complaint-description').value);
        formData.append('priority', document.getElementById('complaint-priority').value);
        
        const mediaFile = document.getElementById('complaint-media').files[0];
        if (mediaFile) {
            formData.append('media', mediaFile);
        }

        try {
            const response = await fetch('/api/complaints/submit', {
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
    const socket = io();
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
            const response = await fetch(`/api/complaints/student/${user.student_id}`, {
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
            complaintList.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No reports yet.</p>';
            return;
        }

        complaintList.innerHTML = complaints.map(c => `
            <div class="complaint-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div>
                        <span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span>
                        <span class="status-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); margin-left: 0.5rem;">
                            Priority: ${c.priority || 'Medium'}
                        </span>
                    </div>
                    <small style="color: var(--text-secondary);">${new Date(c.created_at).toLocaleDateString()}</small>
                </div>
                <h4 style="margin-bottom: 0.5rem;">${c.category} at ${c.location}</h4>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">${c.description}</p>
                ${c.media_url ? `
                    <div style="margin-top: 0.8rem;">
                        <a href="${c.media_url}" target="_blank" class="status-badge" style="background: rgba(255,255,255,0.1); color: var(--primary-color); text-decoration: none;">
                            <i class="fa-solid fa-paperclip"></i> View Attachment
                        </a>
                    </div>
                ` : ''}
                <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--primary-color);">
                    <i class="fa-solid fa-building"></i> Routed to: ${c.department_name}
                </div>
            </div>
        `).join('');
    }
});

function logout() {
    localStorage.removeItem('scrs_token');
    localStorage.removeItem('scrs_user');
    window.location.href = 'login.html';
}
