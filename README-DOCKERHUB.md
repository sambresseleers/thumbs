# Video Thumbnailer Docker Image

Web-based video thumbnail generator with queue management and folder scanning.

## Features

- **Web Interface**: Easy-to-use browser-based interface
- **Folder Scanning**: Recursively scans folders for video files
- **Queue Management**: Process videos sequentially with automatic queuing
- **Text Overlay**: Optional text overlay on thumbnails
- **Skip Existing**: Automatically skips files with existing thumbnails
- **Persistent Queue**: Jobs are saved and survive container restart
- **Multi-architecture**: Supports amd64, arm64, arm/v7

## Quick Start

### Docker Run
```bash
docker run -d \
  --name video-thumbnailer \
  -p 3000:3000 \
  -v /path/to/your/videos:/videos:ro \
  -v thumbnailer-data:/app/data \
  sambresseleers/video-thumbnailer:latest