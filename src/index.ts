import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { AppServer, AppSession, PhotoData } from '@mentra/sdk';
import { createClient } from '@supabase/supabase-js';
import { createCanvas, Image } from 'canvas';

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL ?? (() => { throw new Error('SUPABASE_URL is not set in .env file'); })();
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_KEY is not set in .env file'); })();

/**
 * Simple Photo Sender App
 * Takes photos from Mentra glasses and sends them to /photos endpoint
 */
class SimpleMentraPhotoApp extends AppServer {
  private photos: PhotoData[] = []; // Store photos in memory
  private supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  private faceApiInitialized = false;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
    this.setupRoutes();
    this.initializeFaceAPI();
    this.logger.info('Supabase client initialized for encounters storage');
  }

  /**
   * Initialize Python face detection service
   */
  private async initializeFaceAPI(): Promise<void> {
    try {
      // Check if Python face detection service is running
      const response = await fetch('http://localhost:5000/health');
      if (response.ok) {
        this.faceApiInitialized = true;
        this.logger.info('Python face detection service connected successfully');
      } else {
        throw new Error('Face detection service not responding');
      }
    } catch (error) {
      this.logger.error('Failed to connect to Python face detection service:', error);
      this.logger.info('Face detection will be disabled - all photos will be processed');
    }
  }

  /**
   * Handle new session creation and button press events
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    this.logger.info(`Session started for user ${userId}`);

    // Take photo when button is pressed
    session.events.onButtonPress(async (button) => {
      this.logger.info(`Button pressed: ${button.buttonId}, type: ${button.pressType}`);
      
      try {
        session.layouts.showTextWall("Taking photo...", {durationMs: 2000});
        const photo = await session.camera.requestPhoto();
        this.logger.info(`Photo taken for user ${userId}, timestamp: ${photo.timestamp}`);
        
        // Store photo locally
        this.photos.push(photo);
        
        // Check for face before uploading to Supabase
        const hasFace = await this.detectFace(photo);
        if (!hasFace) {
          this.logger.info(`❌ Face not detected in photo ${photo.requestId} - skipping Supabase upload`);
          session.layouts.showTextWall("No face detected - photo not saved", {durationMs: 2000});
          return;
        }
        
        // Process and upload photo with face
        const processedPhoto = await this.processPhotoWithFace(photo);
        await this.uploadPhotoAndCreateEncounter(processedPhoto, userId);
        await this.sendPhotoToEndpoint(processedPhoto, userId);
        
        session.layouts.showTextWall("Photo sent successfully!", {durationMs: 2000});
      } catch (error) {
        this.logger.error(`Error taking photo: ${error}`);
        session.layouts.showTextWall("Error taking photo", {durationMs: 2000});
      }
    });
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    this.logger.info(`Session stopped for user ${userId}, reason: ${reason}`);
  }

  /**
   * Detect if there's a face in the photo using Python service
   */
  private async detectFace(photo: PhotoData): Promise<boolean> {
    if (!this.faceApiInitialized) {
      this.logger.warn('Face detection not initialized - allowing all photos');
      return true;
    }

    try {
      // Convert photo buffer to base64
      const base64Image = photo.buffer.toString('base64');
      
      // Call Python face detection service
      const response = await fetch('http://localhost:5000/detect-faces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Image })
      });

      if (!response.ok) {
        throw new Error(`Face detection service error: ${response.status}`);
      }

      const result = await response.json();
      const faceCount = result.faces_detected;
      
      this.logger.info(`🔍 Python service detected ${faceCount} face(s) in photo ${photo.requestId}`);
      
      return result.has_faces;
    } catch (error) {
      this.logger.error('Error during Python face detection:', error);
      // If face detection fails, allow the photo to be processed
      return true;
    }
  }

  /**
   * Process photo with face - get processed image from Python service
   */
  private async processPhotoWithFace(photo: PhotoData): Promise<PhotoData> {
    if (!this.faceApiInitialized) {
      return photo; // Return original if face API not initialized
    }

    try {
      // Convert photo buffer to base64
      const base64Image = photo.buffer.toString('base64');
      
      // Get face crops from Python service
      const cropResponse = await fetch('http://localhost:5000/crop-faces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Image })
      });

      if (!cropResponse.ok) {
        throw new Error(`Face cropping service error: ${cropResponse.status}`);
      }

      const cropResult = await cropResponse.json();
      
      if (!cropResult.has_faces) {
        return photo; // No faces found, return original
      }

      // Store face crops in Supabase
      await this.storeFaceCrops(cropResult.face_crops, photo.requestId);
      
      // Call original face processing service for bounding boxes
      const response = await fetch('http://localhost:5000/process-faces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Image })
      });

      if (!response.ok) {
        throw new Error(`Face processing service error: ${response.status}`);
      }

      const result = await response.json();
      
      // Convert processed image back to buffer
      const processedBuffer = Buffer.from(result.processed_image, 'base64');
      
      this.logger.info(`✅ Face processed: ${result.faces_detected} face(s) highlighted and cropped in photo ${photo.requestId}`);
      
      // Return new PhotoData with processed image
      return {
        ...photo,
        buffer: processedBuffer,
        size: processedBuffer.length
      };
      
    } catch (error) {
      this.logger.error('Error processing photo with face:', error);
      return photo; // Return original on error
    }
  }

  /**
   * Store individual face crops in Supabase
   */
  private async storeFaceCrops(faceCrops: any[], photoRequestId: string): Promise<void> {
    try {
      for (const faceCrop of faceCrops) {
        // Create temporary person ID (will be replaced with actual person matching in Phase 3)
        const tempPersonId = `temp_person_${Date.now()}_${faceCrop.face_id}`;
        
        // Upload face crop to face_crops bucket
        const cropFileName = `${tempPersonId}/${photoRequestId}_face_${faceCrop.face_id}.jpg`;
        const cropBuffer = Buffer.from(faceCrop.face_crop_base64, 'base64');
        
        const { error: cropUploadError } = await this.supabase.storage
          .from('face_crops')
          .upload(cropFileName, cropBuffer, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (cropUploadError) {
          throw cropUploadError;
        }

        // Get public URL for the face crop
        const { data: cropUrlData } = this.supabase.storage
          .from('face_crops')
          .getPublicUrl(cropFileName);

        // Store face crop metadata in database
        const { error: dbError } = await this.supabase
          .from('testphoto')
          .insert({
            image_url: cropUrlData.publicUrl,
            status: 'face_crop',
            created_at: new Date().toISOString(),
            // Store additional metadata as JSON
            metadata: {
              photo_request_id: photoRequestId,
              face_id: faceCrop.face_id,
              temp_person_id: tempPersonId,
              bounding_box: faceCrop.bounding_box,
              crop_coordinates: faceCrop.crop_coordinates
            }
          });

        if (dbError) {
          throw dbError;
        }

        this.logger.info(`📸 Face crop stored: ${cropFileName} for temp person ${tempPersonId}`);
      }
    } catch (error) {
      this.logger.error('Error storing face crops:', error);
      throw error;
    }
  }

  /**
   * Upload photo to Supabase storage and create encounter record
   */
  private async uploadPhotoAndCreateEncounter(photo: PhotoData, userId: string): Promise<void> {
    try {
      // Upload photo to Supabase storage
      const fileName = `${userId}/${photo.requestId}_${photo.timestamp}.jpg`;
      
      const { error: uploadError } = await this.supabase.storage
        .from('testphoto')
        .upload(fileName, photo.buffer, {
          contentType: photo.mimeType,
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL for the uploaded image
      const { data: urlData } = this.supabase.storage
        .from('testphoto')
        .getPublicUrl(fileName);

      // Create record in testphoto table (simplified)
      const { error } = await this.supabase
        .from('testphoto')
        .insert({
          image_url: urlData.publicUrl,
          status: 'uploaded',
          created_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      this.logger.info(`Photo uploaded and encounter created for ${photo.requestId}, user ${userId}`);
      this.logger.info(`Image URL: ${urlData.publicUrl}`);
      
    } catch (error) {
      this.logger.error(`Error uploading photo and creating encounter for ${photo.requestId}:`, error);
      throw error;
    }
  }


  /**
   * Send photo to the /photos endpoint
   */
  private async sendPhotoToEndpoint(photo: PhotoData, userId: string): Promise<void> {
    try {
      // Here you would typically send to an external endpoint
      // For now, we'll just log and store locally
      this.logger.info(`Sending photo ${photo.requestId} to /photos endpoint for user ${userId}`);
      this.logger.info(`Photo details: ${photo.filename}, ${photo.size} bytes, ${photo.mimeType}`);
      
      // You can add actual HTTP POST request here to send to external service
      // Example:
      // await fetch('https://your-external-service.com/photos', {
      //   method: 'POST',
      //   headers: { 'Content-Type': photo.mimeType },
      //   body: photo.buffer
      // });
      
    } catch (error) {
      this.logger.error(`Error sending photo to endpoint: ${error}`);
      throw error;
    }
  }

  /**
   * Set up simple routes
   */
  private setupRoutes(): void {
    const app = this.getExpressApp();
    
    // Simple /photos endpoint to receive and display photos
    app.get('/photos', (req, res) => {
      const photoList = this.photos.map(photo => ({
        requestId: photo.requestId,
        timestamp: photo.timestamp,
        filename: photo.filename,
        size: photo.size,
        mimeType: photo.mimeType
      }));

      res.json({
        message: 'Photos from Mentra glasses',
        count: this.photos.length,
        photos: photoList
      });
    });

    // Get specific photo by requestId
    app.get('/photos/:requestId', (req, res) => {
      const requestId = req.params.requestId;
      const photo = this.photos.find(p => p.requestId === requestId);
      
      if (!photo) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      res.set({
        'Content-Type': photo.mimeType,
        'Cache-Control': 'no-cache'
      });
      res.send(photo.buffer);
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({ 
        message: 'Simple Mentra Photo Sender App',
        endpoints: {
          photos: '/photos',
          'photo by id': '/photos/:requestId'
        },
        photoCount: this.photos.length
      });
    });
  }
}

// Start the server
const mentraApp = new SimpleMentraPhotoApp();
mentraApp.start().catch(console.error);
