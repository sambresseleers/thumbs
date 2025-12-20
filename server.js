const express = require('express');
const fs = require('fs').promises;
const fsExtra = require('fs-extra');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Load environment variables with defaults
const config = {
  port: process.env.PORT || 3000,
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 1,
  thumbnailQuality: parseInt(process.env.THUMBNAIL_QUALITY) || 85,
  outputFormat: process.env.OUTPUT_FORMAT || 'jpg',
  textOverlay: {
    enabled: process.env.TEXT_OVERLAY === 'true' || false,
    text: process.env.TEXT_OVERLAY_TEXT || 'Thumbnail',
    fontSize: parseInt(process.env.TEXT_OVERLAY_FONTSIZE) || 24,
    fontColor: process.env.TEXT_OVERLAY_COLOR || 'white',
    x: parseInt(process.env.TEXT_OVERLAY_X) || 10,
    y: parseInt(process.env.TEXT_OVERLAY_Y) || 10
  }
};

// Log configuration on startup
console.log('Starting with configuration:', JSON.stringify(config, null, 2));

// State management
class JobQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.jobHistory = [];
    this.loadJobs();
  }

  async loadJobs() {
    try {
      const dataPath = path.join(__dirname, 'data', 'jobs.json');
      if (await fsExtra.pathExists(dataPath)) {
        const data = await fsExtra.readJson(dataPath);
        this.queue = data.queue || [];
        this.jobHistory = data.history || [];
        console.log(`Loaded ${this.queue.length} queued jobs from storage`);
      }
    } catch (error) {
      console.warn('Could not load job storage:', error.message);
    }
  }

  async saveJobs() {
    try {
      const dataDir = path.join(__dirname, 'data');
      await fsExtra.ensureDir(dataDir);
      const dataPath = path.join(dataDir, 'jobs.json');
      await fsExtra.writeJson(dataPath, {
        queue: this.queue,
        history: this.jobHistory.slice(-1000) // Keep last 1000 jobs
      }, { spaces: 2 });
    } catch (error) {
      console.error('Failed to save jobs:', error);
    }
  }

  addJob(filePath, options = {}) {
    const job = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      filePath,
      fileName: path.basename(filePath),
      status: 'queued',
      addedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
      options: { ...config.textOverlay, ...options }
    };
    
    this.queue.push(job);
    this.saveJobs();
    console.log(`Job added: ${job.fileName} (ID: ${job.id})`);
    return job;
  }

  removeJob(jobId) {
    const index = this.queue.findIndex(job => job.id === jobId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      this.saveJobs();
      console.log(`Job removed: ${removed.fileName}`);
      return removed;
    }
    return null;
  }

  getNextJob() {
    return this.queue.find(job => job.status === 'queued');
  }

  updateJobStatus(jobId, updates) {
    const job = this.queue.find(j => j.id === jobId);
    if (job) {
      Object.assign(job, updates);
      this.saveJobs();
    }
  }

  addToHistory(job) {
    this.jobHistory.push({
      ...job,
      archivedAt: new Date().toISOString()
    });
    // Keep history manageable
    if (this.jobHistory.length > 1000) {
      this.jobHistory = this.jobHistory.slice(-1000);
    }
    this.saveJobs();
  }
}

// Initialize
const app = express();
const jobQueue = new JobQueue();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Utility functions
async function scanDirectory(dirPath, extensions = ['.ts', '.mp4', '.mov', '.avi']) {
  const files = [];
  
  async function scanRecursive(currentPath) {
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(currentPath, item.name);
        
        if (item.isDirectory()) {
          await scanRecursive(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning ${currentPath}:`, error.message);
    }
  }
  
  await scanRecursive(dirPath);
  return files;
}

function getThumbnailPath(videoPath) {
  const dir = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));
  return path.join(dir, `${baseName}_thumb.${config.outputFormat}`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function processVideoWithFFmpeg(job) {
  const inputPath = job.filePath;
  const outputPath = getThumbnailPath(inputPath);
  
  // Check if thumbnail already exists
  if (await fileExists(outputPath)) {
    console.log(`Thumbnail already exists for ${job.fileName}, skipping`);
    return { skipped: true, outputPath };
  }
  
  // Build FFmpeg command
  let ffmpegCmd = `ffmpeg -i "${inputPath}" -vf `;
  
  // Add text overlay if enabled
  if (job.options.enabled) {
    const text = job.options.text.replace(/:/g, '\\:'); // Escape colons for FFmpeg
    ffmpegCmd += `"drawtext=text='${text}':fontsize=${job.options.fontSize}:fontcolor=${job.options.fontColor}:x=${job.options.x}:y=${job.options.y}" `;
  } else {
    ffmpegCmd += `"thumbnail" `;
  }
  
  // Capture thumbnail at 10% of video duration
  ffmpegCmd += `-ss 10% -vframes 1 -q:v ${config.thumbnailQuality} "${outputPath}"`;
  
  console.log(`Processing ${job.fileName} with command:`, ffmpegCmd);
  
  try {
    const { stdout, stderr } = await execAsync(ffmpegCmd, { timeout: 300000 }); // 5 minute timeout
    
    if (stderr) {
      console.log(`FFmpeg output for ${job.fileName}:`, stderr);
    }
    
    return { success: true, outputPath, ffmpegOutput: stderr };
  } catch (error) {
    console.error(`FFmpeg error for ${job.fileName}:`, error.message);
    throw error;
  }
}

async function processNextJob() {
  if (jobQueue.processing || config.maxConcurrentJobs <= 0) {
    return;
  }
  
  const job = jobQueue.getNextJob();
  if (!job) {
    console.log('No jobs in queue');
    return;
  }
  
  jobQueue.processing = true;
  jobQueue.updateJobStatus(job.id, {
    status: 'processing',
    startedAt: new Date().toISOString()
  });
  
  console.log(`Starting job: ${job.fileName}`);
  
  try {
    const result = await processVideoWithFFmpeg(job);
    
    if (result.skipped) {
      jobQueue.updateJobStatus(job.id, {
        status: 'skipped',
        completedAt: new Date().toISOString(),
        outputPath: result.outputPath
      });
    } else {
      jobQueue.updateJobStatus(job.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        outputPath: result.outputPath
      });
    }
    
    console.log(`Job completed: ${job.fileName} (${job.status})`);
  } catch (error) {
    jobQueue.updateJobStatus(job.id, {
      status: 'error',
      completedAt: new Date().toISOString(),
      error: error.message
    });
    console.error(`Job failed: ${job.fileName} - ${error.message}`);
  } finally {
    // Move to history
    const completedJob = jobQueue.queue.find(j => j.id === job.id);
    jobQueue.addToHistory(completedJob);
    
    // Remove from active queue
    const index = jobQueue.queue.findIndex(j => j.id === job.id);
    if (index !== -1) {
      jobQueue.queue.splice(index, 1);
      jobQueue.saveJobs();
    }
    
    jobQueue.processing = false;
    
    // Process next job
    setTimeout(() => processNextJob(), 100);
  }
}

// API Routes

// Get current queue
app.get('/api/queue', (req, res) => {
  res.json({
    queue: jobQueue.queue,
    processing: jobQueue.processing,
    stats: {
      total: jobQueue.queue.length,
      queued: jobQueue.queue.filter(j => j.status === 'queued').length,
      processing: jobQueue.queue.filter(j => j.status === 'processing').length,
      completed: jobQueue.jobHistory.filter(j => j.status === 'completed').length,
      errors: jobQueue.jobHistory.filter(j => j.status === 'error').length
    }
  });
});

// Scan folder and add files to queue
app.post('/api/scan', async (req, res) => {
  try {
    const { folderPath } = req.body;
    
    if (!folderPath || !await fileExists(folderPath)) {
      return res.status(400).json({ error: 'Invalid folder path' });
    }
    
    console.log(`Scanning folder: ${folderPath}`);
    const videoFiles = await scanDirectory(folderPath);
    
    // Filter out files that already have thumbnails
    const jobs = [];
    for (const file of videoFiles) {
      const thumbnailPath = getThumbnailPath(file);
      if (!await fileExists(thumbnailPath)) {
        const job = jobQueue.addJob(file);
        jobs.push(job);
      } else {
        console.log(`Skipping ${path.basename(file)} - thumbnail exists`);
      }
    }
    
    // Start processing if not already running
    if (jobs.length > 0 && !jobQueue.processing) {
      setTimeout(() => processNextJob(), 100);
    }
    
    res.json({
      success: true,
      message: `Found ${videoFiles.length} video files, added ${jobs.length} to queue`,
      jobsAdded: jobs.length,
      totalFiles: videoFiles.length
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add single file to queue
app.post('/api/add', (req, res) => {
  try {
    const { filePath, options } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }
    
    const job = jobQueue.addJob(filePath, options);
    
    if (!jobQueue.processing) {
      setTimeout(() => processNextJob(), 100);
    }
    
    res.json({ success: true, job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove job from queue
app.delete('/api/job/:id', (req, res) => {
  try {
    const { id } = req.params;
    const removed = jobQueue.removeJob(id);
    
    if (removed) {
      res.json({ success: true, message: 'Job removed', job: removed });
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all jobs
app.delete('/api/queue', (req, res) => {
  try {
    const count = jobQueue.queue.length;
    jobQueue.queue = [];
    jobQueue.saveJobs();
    res.json({ success: true, message: `Cleared ${count} jobs` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get file browser listing
app.post('/api/browse', async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    const targetPath = dirPath || process.cwd();
    
    if (!await fileExists(targetPath)) {
      return res.status(400).json({ error: 'Path does not exist' });
    }
    
    const items = await fs.readdir(targetPath, { withFileTypes: true });
    const result = {
      path: targetPath,
      parent: path.dirname(targetPath),
      items: []
    };
    
    for (const item of items) {
      const fullPath = path.join(targetPath, item.name);
      const stat = await fs.stat(fullPath);
      
      result.items.push({
        name: item.name,
        path: fullPath,
        type: item.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime,
        extension: path.extname(item.name).toLowerCase()
      });
    }
    
    // Sort: directories first, then files
    result.items.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'directory' ? -1 : 1;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get system info and FFmpeg status
app.get('/api/system', async (req, res) => {
  try {
    // Check if FFmpeg is available
    let ffmpegVersion = 'Unknown';
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const match = stdout.match(/ffmpeg version (\S+)/);
      ffmpegVersion = match ? match[1] : 'Available';
    } catch {
      ffmpegVersion = 'Not found';
    }
    
    res.json({
      ffmpeg: ffmpegVersion,
      platform: process.platform,
      node: process.version,
      config: {
        maxConcurrentJobs: config.maxConcurrentJobs,
        thumbnailQuality: config.thumbnailQuality,
        outputFormat: config.outputFormat,
        textOverlay: config.textOverlay.enabled
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║       Video Thumbnailer Server Started                ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  🌐 Server URL: http://localhost:${config.port}              ║
║  📁 API Endpoint: http://localhost:${config.port}/api       ║
║  ⏱️  Queue Size: ${jobQueue.queue.length} jobs                 ║
║  🐳 Docker Ready: ${process.env.NODE_ENV === 'production' ? 'Yes' : 'Development'} ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
  
  // Start processing if there are queued jobs
  if (jobQueue.queue.length > 0 && !jobQueue.processing) {
    console.log('Resuming processing of queued jobs...');
    setTimeout(() => processNextJob(), 1000);
  }
});