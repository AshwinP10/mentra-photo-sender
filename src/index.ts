import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { AppServer, AppSession, PhotoData } from '@mentra/sdk';
import { createClient } from '@supabase/supabase-js';

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

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
    this.setupRoutes();
    this.logger.info('Supabase client initialized for encounters storage');
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
        
        // Store photo locally and upload to Supabase
        this.photos.push(photo);
        await this.uploadPhotoAndCreateEncounter(photo, userId);
        await this.sendPhotoToEndpoint(photo, userId);
        
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
