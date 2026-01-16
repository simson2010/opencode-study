# OpenCode Development Workspace

## Usage

### logs.tar

The `logs.tar` file contains archived logs and is tracked using Git LFS (Large File Storage). 

To work with logs.tar:
```bash
# Clone with LFS files
git clone --recurse-submodules <repo-url>
git lfs pull

# Extract logs
tar -xvf logs.tar
```

This file is managed via Git LFS and requires Git LFS to be installed to pull the large file contents.

### Cloning Without Submodules

If you only need the working files and don't want to clone submodules:

```bash
# Clone without submodules
git clone <repo-url>

# Pull LFS files
cd <repo-name>
git lfs pull
```

### Viewing Logs

To view logs in the browser using the log viewer:

```bash
# Run the simple Python HTTP server
python3 server.py

# Or make it executable and run directly
chmod +x server.py
./server.py
```

Then open your browser and navigate to:
- http://localhost:8000/log-viewer.html

Press Ctrl+C to stop the server.
