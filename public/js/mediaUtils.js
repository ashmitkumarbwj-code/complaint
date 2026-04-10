/**
 * public/js/mediaUtils.js
 * Centralized utility for handling complaint media (images/videos)
 * Supports Cloudinary transformations, zoom, and fallback UI.
 */

window.MediaUtils = {
    /**
     * Transforms a Cloudinary URL to include optimization parameters.
     */
    transformUrl: function(url, type = 'image') {
        if (!url || !url.includes('cloudinary.com')) return url;
        
        // Handle cases where /upload/ might be missing or different
        const parts = url.split('/upload/');
        if (parts.length !== 2) return url;

        // Transformations: 
        // f_auto: automatic format (WebP/AVIF if supported)
        // q_auto: automatic quality
        // w_auto: responsive width (for images)
        // c_limit: limit size to original if smaller
        const transform = type === 'video' 
            ? 'f_auto,q_auto' 
            : 'f_auto,q_auto,w_auto:breakpoints,c_limit,w_1200';

        return `${parts[0]}/upload/${transform}/${parts[1]}`;
    },

    /**
     * Detects if a URL points to a video.
     */
    isVideo: function(url) {
        if (!url) return false;
        return url.match(/\.(mp4|mov|avi|wmv|flv|webm)($|\?)/i) || url.includes('/video/upload/');
    },

    /**
     * Renders the media HTML with fallback, loading state, and optimization.
     */
    render: function(url, containerId) {
        if (!url) {
            return `<div class="media-fallback"><i class="fas fa-info-circle"></i> No media attached</div>`;
        }

        const isVideo = this.isVideo(url);
        const transformedUrl = this.transformUrl(url, isVideo ? 'video' : 'image');

        if (isVideo) {
            return `
                <div class="media-wrapper video-wrapper loading-skeleton">
                    <video 
                        src="${transformedUrl}" 
                        controls 
                        preload="none"
                        class="complaint-video" 
                        controlsList="nodownload"
                        onloadeddata="this.parentElement.classList.remove('loading-skeleton')"
                        onerror="window.MediaUtils.handleError(this, 'video')"
                    >
                        Your browser does not support the video tag.
                    </video>
                    <button class="btn-fullscreen" onclick="window.MediaUtils.toggleFullscreen(this.previousElementSibling)">
                        <i class="fas fa-expand"></i>
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="media-wrapper image-wrapper loading-skeleton">
                    <img 
                        src="${transformedUrl}" 
                        class="complaint-img zoomable" 
                        onmouseover="this.parentElement.classList.add('hovered')"
                        onmouseout="this.parentElement.classList.remove('hovered')"
                        onclick="window.MediaUtils.toggleZoom(this)"
                        onload="this.parentElement.classList.remove('loading-skeleton')"
                        onerror="window.MediaUtils.handleError(this, 'image')"
                        alt="Complaint Evidence"
                        loading="lazy"
                    >
                    <div class="img-overlay"><i class="fas fa-search-plus"></i> Click to Zoom</div>
                </div>
            `;
        }
    },


    /**
     * Handles media loading errors.
     */
    handleError: function(element, type) {
        const wrapper = element.parentElement;
        wrapper.innerHTML = `
            <div class="media-fallback error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Failed to load ${type}. <a href="${element.src}" target="_blank">Open Link</a></span>
            </div>
        `;
    },

    /**
     * Toggles image zoom (Lightbox effect).
     */
    toggleZoom: function(img) {
        if (img.classList.contains('zoomed')) {
            img.classList.remove('zoomed');
            document.body.style.overflow = '';
            const backdrop = document.querySelector('.zoom-backdrop');
            if (backdrop) backdrop.remove();
        } else {
            img.classList.add('zoomed');
            document.body.style.overflow = 'hidden';
            
            const backdrop = document.createElement('div');
            backdrop.className = 'zoom-backdrop';
            backdrop.onclick = () => this.toggleZoom(img);
            document.body.appendChild(backdrop);
        }
    },

    /**
     * Toggles video fullscreen.
     */
    toggleFullscreen: function(video) {
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) {
            video.msRequestFullscreen();
        }
    }
};
