const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuration
const config = {
  port: process.env.PORT || 3000,
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 1,
  thumbnailQuality: parseInt(process.env.THUMBNAIL_QUALITY) || 85,
  outputFormat: process.env.OUTPUT_FORMAT || 'jpg'
};

// Simple in-memory job queue
class JobQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async addJob(filePath) {
    // Check if thumbnail already exists before adding to queue
    const thumbnailPath = getThumbnailPath(filePath);
    try {
      await fs.access(thumbnailPath);
      // Thumbnail exists, don't add to queue
      console.log(`Skipping ${path.basename(filePath)} - thumbnail already exists`);
      return null;
    } catch {
      // Thumbnail doesn't exist, add to queue
      const job = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        filePath,
        fileName: path.basename(filePath),
        status: 'queued',
        addedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        error: null
      };
      
      this.queue.push(job);
      console.log(`Job added: ${job.fileName} (ID: ${job.id})`);
      return job;
    }
  }

  removeJob(jobId) {
    const index = this.queue.findIndex(job => job.id === jobId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
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
    }
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
function getThumbnailPath(videoPath) {
  const dir = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));
  return path.join(dir, `${baseName}_thumb.${config.outputFormat}`);
}

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
  
  // Double-check thumbnail doesn't exist
  if (await fileExists(outputPath)) {
    console.log(`Thumbnail already exists for ${job.fileName}, skipping`);
    return { skipped: true, outputPath };
  }
  
  // Try multiple time points
  const timePoints = ['00:00:05', '00:00:10', '00:00:15', '00:00:30'];
  
  for (const timePoint of timePoints) {
    try {
      const ffmpegCmd = `ffmpeg -i "${inputPath}" -ss ${timePoint} -vframes 1 -q:v ${config.thumbnailQuality} "${outputPath}"`;
      
      console.log(`Trying ${job.fileName} at ${timePoint}:`, ffmpegCmd);
      
      const { stdout, stderr } = await execAsync(ffmpegCmd, { timeout: 300000 });
      
      if (stderr && !stderr.includes('Output file is empty')) {
        console.log(`FFmpeg output:`, stderr);
      }
      
      // Check if output file was created
      if (await fileExists(outputPath)) {
        console.log(`Successfully created thumbnail at ${timePoint}`);
        return { success: true, outputPath, ffmpegOutput: stderr };
      }
      
      // If file wasn't created, try next time point
      console.log(`No thumbnail created at ${timePoint}, trying next...`);
      
    } catch (error) {
      console.log(`Failed at ${timePoint}:`, error.message);
      // Continue to next time point
    }
  }
  
  // If all time points fail, try the "thumbnail" filter
  console.log(`All time points failed, trying thumbnail filter for ${job.fileName}`);
  try {
    const altCmd = `ffmpeg -i "${inputPath}" -vf "thumbnail" -vframes 1 -q:v ${config.thumbnailQuality} "${outputPath}"`;
    const { stdout, stderr } = await execAsync(altCmd, { timeout: 300000 });
    
    if (await fileExists(outputPath)) {
      console.log(`Successfully created thumbnail using filter`);
      return { success: true, outputPath, ffmpegOutput: stderr };
    }
  } catch (altError) {
    console.error(`Thumbnail filter also failed:`, altError.message);
  }
  
  // Final fallback: Use first frame
  console.log(`Trying first frame for ${job.fileName}`);
  try {
    const firstFrameCmd = `ffmpeg -i "${inputPath}" -vf "select=eq(n\\,0)" -vframes 1 -q:v ${config.thumbnailQuality} "${outputPath}"`;
    const { stdout, stderr } = await execAsync(firstFrameCmd, { timeout: 300000 });
    
    if (await fileExists(outputPath)) {
      console.log(`Successfully created thumbnail from first frame`);
      return { success: true, outputPath, ffmpegOutput: stderr };
    }
  } catch (firstFrameError) {
    console.error(`First frame also failed:`, firstFrameError.message);
  }
  
  throw new Error(`Failed to create thumbnail for ${job.fileName} after trying all methods`);
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
    
    jobQueue.updateJobStatus(job.id, {
      status: result.skipped ? 'skipped' : 'completed',
      completedAt: new Date().toISOString(),
      outputPath: result.outputPath
    });
    
    console.log(`Job completed: ${job.fileName} (${job.status})`);
  } catch (error) {
    jobQueue.updateJobStatus(job.id, {
      status: 'error',
      completedAt: new Date().toISOString(),
      error: error.message
    });
    console.error(`Job failed: ${job.fileName} - ${error.message}`);
  } finally {
    // Remove completed/error/skipped jobs from queue after processing
    const index = jobQueue.queue.findIndex(j => j.id === job.id);
    if (index !== -1) {
      jobQueue.queue.splice(index, 1);
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
      processing: jobQueue.queue.filter(j => j.status === 'processing').length
    }
  });
});

// Scan folder and add files to queue
app.post('/api/scan', async (req, res) => {
  try {
    const { folderPath } = req.body;
    
    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path required' });
    }
    
    console.log(`Scanning folder: ${folderPath}`);
    const videoFiles = await scanDirectory(folderPath);
    
    // Add files to queue (skipping those with existing thumbnails)
    const jobs = [];
    let skipped = 0;
    
    for (const file of videoFiles) {
      const job = await jobQueue.addJob(file);
      if (job) {
        jobs.push(job);
      } else {
        skipped++;
      }
    }
    
    // Start processing if not already running
    if (jobs.length > 0 && !jobQueue.processing) {
      setTimeout(() => processNextJob(), 100);
    }
    
    res.json({
      success: true,
      message: `Found ${videoFiles.length} video files, added ${jobs.length} to queue, skipped ${skipped}`,
      jobsAdded: jobs.length,
      skipped: skipped,
      totalFiles: videoFiles.length
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add single file to queue
app.post('/api/add', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }
    
    const job = await jobQueue.addJob(filePath);
    
    if (job) {
      if (!jobQueue.processing) {
        setTimeout(() => processNextJob(), 100);
      }
      res.json({ success: true, job, message: 'Job added to queue' });
    } else {
      res.json({ success: true, job: null, message: 'File already has thumbnail, skipped' });
    }
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

// Get system info
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
        outputFormat: config.outputFormat
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
║  📊 Mode: Stateless (no persistence)                 ║
║  🔍 Auto-skip: Files with existing thumbnails        ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
});