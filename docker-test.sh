#!/bin/bash
# Docker test script

echo "=== Testing Video Thumbnailer Docker Build ==="

# Build the image
echo "Building Docker image..."
docker build -t video-thumbnailer-test .

# Create test directories
mkdir -p test-data test-logs test-videos
echo "Test file" > test-videos/test.txt

# Run container
echo "Running container..."
docker run -d \
  --name thumbnailer-test \
  -p 3001:3000 \
  -v $(pwd)/test-data:/app/data \
  -v $(pwd)/test-logs:/app/logs \
  -v $(pwd)/test-videos:/videos:ro \
  video-thumbnailer-test

echo "Container started. Waiting for health check..."
sleep 10

# Test health endpoint
if curl -f http://localhost:3001/api/system > /dev/null 2>&1; then
    echo "✓ Container is healthy"
else
    echo "✗ Container failed health check"
    docker logs thumbnailer-test
    exit 1
fi

# Cleanup
echo "Cleaning up..."
docker stop thumbnailer-test
docker rm thumbnailer-test
docker rmi video-thumbnailer-test
rm -rf test-data test-logs test-videos

echo "=== Test completed successfully ==="