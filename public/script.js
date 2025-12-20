class VideoThumbnailer {
    constructor() {
        this.baseUrl = window.location.origin;
        this.currentPath = '';
        this.refreshInterval = null;
        this.selectedFiles = new Set();
        
        this.initializeElements();
        this.bindEvents();
        this.loadSystemInfo();
        this.startAutoRefresh();
    }
    
    initializeElements() {
        // Main buttons
        this.scanFolderBtn = document.getElementById('scan-folder-btn');
        this.clearQueueBtn = document.getElementById('clear-queue-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.addFolderBtn = document.getElementById('add-folder-btn');
        this.browserBackBtn = document.getElementById('browser-back');
        
        // Stats elements
        this.statQueued = document.getElementById('stat-queued');
        this.statProcessing = document.getElementById('stat-processing');
        this.statCompleted = document.getElementById('stat-completed');
        this.statErrors = document.getElementById('stat-errors');
        
        // Containers
        this.fileList = document.getElementById('file-list');
        this.queueList = document.getElementById('queue-list');
        this.currentPathElement = document.getElementById('current-path');
        this.processingStatus = document.getElementById('processing-status');
        
        // Modal elements
        this.folderModal = document.getElementById('folder-modal');
        this.folderPathInput = document.getElementById('folder-path');
        this.browseBtn = document.getElementById('browse-btn');
        this.confirmScanBtn = document.getElementById('confirm-scan');
        
        // Settings
        this.maxJobsSelect = document.getElementById('max-jobs');
        this.qualitySlider = document.getElementById('quality');
        this.qualityValue = document.getElementById('quality-value');
        this.textOverlayCheckbox = document.getElementById('text-overlay');
    }
    
    bindEvents() {
        // Button events
        this.scanFolderBtn.addEventListener('click', () => this.showFolderModal());
        this.clearQueueBtn.addEventListener('click', () => this.clearQueue());
        this.refreshBtn.addEventListener('click', () => this.refreshData());
        this.addFolderBtn.addEventListener('click', () => this.addCurrentFolderToQueue());
        this.browserBackBtn.addEventListener('click', () => this.navigateUp());
        
        // Modal events
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.hideModal());
        });
        
        this.browseBtn.addEventListener('click', () => this.browseFolder());
        this.confirmScanBtn.addEventListener('click', () => this.scanFolder());
        
        // Settings events
        this.qualitySlider.addEventListener('input', (e) => {
            this.qualityValue.textContent = e.target.value;
        });
        
        // Close modal when clicking outside
        this.folderModal.addEventListener('click', (e) => {
            if (e.target === this.folderModal) {
                this.hideModal();
            }
        });
        
        // Initial folder browse
        this.browseDirectory('/');
    }
    
    showFolderModal() {
        this.folderModal.classList.add('active');
        this.folderPathInput.value = this.currentPath || '';
        this.folderPathInput.focus();
    }
    
    hideModal() {
        this.folderModal.classList.remove('active');
    }
    
    async browseFolder() {
        // In a real app, you might use Electron or a file input
        // For this web version, we'll just use the current path
        const path = prompt('Enter folder path:', this.currentPath || '/');
        if (path) {
            this.folderPathInput.value = path;
        }
    }
    
    async scanFolder() {
        const folderPath = this.folderPathInput.value.trim();
        if (!folderPath) {
            alert('Please enter a folder path');
            return;
        }
        
        try {
            this.confirmScanBtn.disabled = true;
            this.confirmScanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
            
            const response = await fetch(`${this.baseUrl}/api/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification(`Found ${data.totalFiles} videos, added ${data.jobsAdded} to queue`, 'success');
                this.hideModal();
                this.refreshData();
            } else {
                throw new Error(data.error || 'Scan failed');
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            this.confirmScanBtn.disabled = false;
            this.confirmScanBtn.innerHTML = '<i class="fas fa-search"></i> Scan Folder';
        }
    }
    
    async browseDirectory(path) {
        try {
            const response = await fetch(`${this.baseUrl}/api/browse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.currentPath = data.path;
                this.currentPathElement.textContent = data.path;
                this.renderFileList(data);
            } else {
                throw new Error(data.error || 'Browse failed');
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    
    navigateUp() {
        if (this.currentPath) {
            const parentPath = this.currentPath.split('/').slice(0, -1).join('/') || '/';
            this.browseDirectory(parentPath);
        }
    }
    
    renderFileList(data) {
        this.fileList.innerHTML = '';
        
        if (data.items.length === 0) {
            this.fileList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open fa-3x"></i>
                    <p>Empty folder</p>
                </div>
            `;
            return;
        }
        
        data.items.forEach(item => {
            const fileElement = document.createElement('div');
            fileElement.className = 'file-item';
            fileElement.dataset.path = item.path;
            
            const icon = item.type === 'directory' ? 'fa-folder' : this.getFileIcon(item.extension);
            const size = item.type === 'directory' ? '' : this.formatFileSize(item.size);
            
            fileElement.innerHTML = `
                <div class="file-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="file-name">${this.escapeHtml(item.name)}</div>
                <div class="file-size">${size}</div>
            `;
            
            fileElement.addEventListener('click', (e) => {
                if (item.type === 'directory') {
                    this.browseDirectory(item.path);
                } else {
                    fileElement.classList.toggle('selected');
                    const path = fileElement.dataset.path;
                    
                    if (this.selectedFiles.has(path)) {
                        this.selectedFiles.delete(path);
                    } else {
                        this.selectedFiles.add(path);
                    }
                }
            });
            
            this.fileList.appendChild(fileElement);
        });
    }
    
    getFileIcon(extension) {
        const iconMap = {
            '.ts': 'fa-video',
            '.mp4': 'fa-file-video',
            '.mov': 'fa-file-video',
            '.avi': 'fa-file-video',
            '.jpg': 'fa-file-image',
            '.png': 'fa-file-image',
            '.jpeg': 'fa-file-image'
        };
        
        return iconMap[extension] || 'fa-file';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async addCurrentFolderToQueue() {
        try {
            const response = await fetch(`${this.baseUrl}/api/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath: this.currentPath })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification(`Added ${data.jobsAdded} videos to queue`, 'success');
                this.refreshData();
            } else {
                throw new Error(data.error || 'Failed to add folder');
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    
    async refreshData() {
        try {
            const [queueResponse, systemResponse] = await Promise.all([
                fetch(`${this.baseUrl}/api/queue`),
                fetch(`${this.baseUrl}/api/system`)
            ]);
            
            const queueData = await queueResponse.json();
            const systemData = await systemResponse.json();
            
            this.updateStats(queueData);
            this.updateQueueList(queueData.queue);
            this.updateProcessingStatus(queueData.processing);
            this.updateSystemInfo(systemData);
        } catch (error) {
            console.error('Refresh failed:', error);
        }
    }
    
    updateStats(data) {
        this.statQueued.textContent = data.stats.queued;
        this.statProcessing.textContent = data.stats.processing;
        this.statCompleted.textContent = data.stats.completed;
        this.statErrors.textContent = data.stats.errors;
    }
    
    updateQueueList(queue) {
        this.queueList.innerHTML = '';
        
        if (queue.length === 0) {
            this.queueList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox fa-3x"></i>
                    <p>No jobs in queue</p>
                    <p class="subtext">Add folders using the file browser</p>
                </div>
            `;
            return;
        }
        
        queue.forEach(job => {
            const jobElement = document.createElement('div');
            jobElement.className = 'queue-item';
            jobElement.dataset.id = job.id;
            
            const statusClass = `status-${job.status}`;
            const statusText = job.status.charAt(0).toUpperCase() + job.status.slice(1);
            
            jobElement.innerHTML = `
                <div class="job-status ${statusClass}" title="${statusText}"></div>
                <div class="job-info">
                    <div class="job-filename">${this.escapeHtml(job.fileName)}</div>
                    <div class="job-path">${this.escapeHtml(job.filePath)}</div>
                </div>
                <div class="job-actions">
                    ${job.status === 'queued' ? `
                        <button class="action-btn remove-btn" onclick="app.removeJob('${job.id}')">
                            <i class="fas fa-times"></i> Remove
                        </button>
                    ` : ''}
                </div>
            `;
            
            this.queueList.appendChild(jobElement);
        });
    }
    
    updateProcessingStatus(isProcessing) {
        this.processingStatus.textContent = isProcessing ? 'Processing' : 'Idle';
        this.processingStatus.className = isProcessing ? 'status-processing' : 'status-idle';
    }
    
    updateSystemInfo(systemData) {
        document.getElementById('ffmpeg-version').textContent = systemData.ffmpeg;
        document.getElementById('persistence-status').textContent = 'Active';
        document.getElementById('docker-status').textContent = systemData.platform === 'linux' ? 'Running' : 'Native';
    }
    
    async removeJob(jobId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/job/${jobId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification('Job removed from queue', 'success');
                this.refreshData();
            } else {
                throw new Error(data.error || 'Failed to remove job');
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    
    async clearQueue() {
        if (!confirm('Are you sure you want to clear all jobs from the queue?')) {
            return;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/api/queue`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification(data.message, 'success');
                this.refreshData();
            } else {
                throw new Error(data.error || 'Failed to clear queue');
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    
    async loadSystemInfo() {
        try {
            const response = await fetch(`${this.baseUrl}/api/system`);
            const data = await response.json();
            this.updateSystemInfo(data);
        } catch (error) {
            console.error('Failed to load system info:', error);
        }
    }
    
    startAutoRefresh() {
        // Refresh every 3 seconds
        this.refreshInterval = setInterval(() => this.refreshData(), 3000);
        
        // Also refresh on visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshData();
            }
        });
    }
    
    showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${this.escapeHtml(message)}</span>
            <button class="notification-close"><i class="fas fa-times"></i></button>
        `;
        
        document.body.appendChild(notification);
        
        // Add styles if not already added
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 15px 20px;
                    border-radius: var(--border-radius);
                    background: white;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
                    max-width: 400px;
                    border-left: 4px solid var(--primary-color);
                }
                
                .notification-success {
                    border-left-color: var(--success-color);
                }
                
                .notification-error {
                    border-left-color: var(--danger-color);
                }
                
                .notification i {
                    font-size: 1.2rem;
                }
                
                .notification-success i {
                    color: var(--success-color);
                }
                
                .notification-error i {
                    color: var(--danger-color);
                }
                
                .notification span {
                    flex: 1;
                }
                
                .notification-close {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #666;
                    padding: 5px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .notification-close:hover {
                    color: var(--danger-color);
                }
                
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(styles);
        }
        
        // Close button event
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new VideoThumbnailer();
    app.refreshData();
});

// Make app globally available for onclick handlers
window.app = app;