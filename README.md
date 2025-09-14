# MentraOS Camera App with Face Detection

This app captures photos from Mentra glasses, detects faces using Python/OpenCV, and stores photos with faces in Supabase. Photos without faces are automatically discarded.

## Features

- **Smart Face Detection**: Only saves photos containing human faces
- **Accurate Bounding Boxes**: Uses OpenCV for precise face detection
- **Supabase Integration**: Stores photos and metadata in cloud database
- **Web Interface**: View captured photos with face highlighting
- **Real-time Processing**: Instant face detection and photo filtering

## Architecture

- **Node.js App** (port 3000): Main Mentra glasses interface
- **Python Service** (port 5000): Face detection microservice using OpenCV
- **Supabase**: Cloud storage for photos and database records

## Setup

### 1. Install Dependencies
```bash
# Node.js dependencies
bun install

# Python dependencies
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Update `.env` with:
```bash
# MentraOS Configuration
PACKAGE_NAME=com.yourname.camera
MENTRAOS_API_KEY=your_api_key_here
PORT=3000

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

### 3. Setup Supabase Database

Run this SQL in your Supabase SQL Editor:
```sql
-- Create testphoto table
CREATE TABLE public.testphoto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  status TEXT DEFAULT 'uploaded',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('testphoto', 'testphoto', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage permissions
CREATE POLICY "Allow all access to service role"
ON storage.objects 
FOR ALL
USING (auth.role() = 'service_role');
```

### 4. Register App with MentraOS

1. Navigate to [console.mentra.glass](https://console.mentra.glass/)
2. Click "Sign In" and log in
3. Click "Create App"
4. Set package name (e.g., `com.yourname.camera`)
5. Set your ngrok URL as "Public URL"

## Running the App

### 1. Start Python Face Detection Service
```bash
python face_detection_service.py
```
Service will run on `http://localhost:5000`

### 2. Start Node.js App
```bash
bun run dev
```
App will run on `http://localhost:3000`

### 3. Setup Ngrok (for external access)
```bash
ngrok http --url=your-static-url 3000
```

### 4. Connect Mentra Glasses
- Pair your glasses with the app
- Press camera button to take photos
- Only photos with detected faces will be saved

## Viewing Photos

### Web Interface
- **All Photos**: `http://localhost:3000/photos`
- **Individual Photo**: `http://localhost:3000/photos/{photo-id}`
- **App Status**: `http://localhost:3000/`

### Supabase Dashboard
- **Storage**: View uploaded images in `testphoto` bucket
- **Database**: Check `testphoto` table for photo records

## Face Detection Behavior

✅ **Face Detected**: Photo processed with green bounding boxes and saved to Supabase  
❌ **No Face Detected**: Photo discarded, logged as "Face not detected - skipping Supabase upload"

## API Endpoints

### Node.js App (Port 3000)
- `GET /` - App status and info
- `GET /photos` - List all captured photos
- `GET /photos/:requestId` - Get specific photo

### Python Service (Port 5000)
- `GET /health` - Service health check
- `POST /detect-faces` - Detect faces in image
- `POST /process-faces` - Process image with face bounding boxes

## Troubleshooting

### Python Service Not Starting
```bash
# Install missing dependencies
pip install flask opencv-python pillow numpy

# Check if port 5000 is available
netstat -an | findstr :5000
```

### Face Detection Not Working
- Ensure Python service is running on port 5000
- Check logs for "Python face detection service connected successfully"
- Verify OpenCV installation: `python -c "import cv2; print(cv2.__version__)"`

### Supabase Upload Errors
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.env`
- Check if `testphoto` bucket and table exist
- Ensure storage policies are set correctly

## Development

### Logs
- **Node.js**: Face detection results and Supabase operations
- **Python**: Face detection processing and API requests

### Testing Face Detection
Send test image to Python service:
```bash
curl -X POST http://localhost:5000/detect-faces \
  -H "Content-Type: application/json" \
  -d '{"image": "base64_encoded_image_here"}'
bun run dev
```
App will run on `http://localhost:3000`

### 3. Connect Mentra Glasses
- Pair your glasses with the app
- Press camera button to take photos
- Only photos with detected faces will be saved

## Viewing Photos

### Web Interface
- **All Photos**: `http://localhost:3000/photos`
- **Individual Photo**: `http://localhost:3000/photos/{photo-id}`
- **App Status**: `http://localhost:3000/`

### Supabase Dashboard
- **Storage**: View uploaded images in `testphoto` bucket
- **Database**: Check `testphoto` table for photo records

## Face Detection Behavior

✅ **Face Detected**: Photo processed with green bounding boxes and saved to Supabase  
❌ **No Face Detected**: Photo discarded, logged as "Face not detected - skipping Supabase upload"

Check out the full documentation at [docs.mentra.glass](https://docs.mentra.glass/camera)
