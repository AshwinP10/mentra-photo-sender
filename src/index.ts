import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { AppServer, AppSession, PhotoData } from '@mentra/sdk';

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

/**
 * Simple Photo Sender App
 * Takes photos from Mentra glasses and sends them to /photos endpoint
 */
class SimpleMentraPhotoApp extends AppServer {
  private photos: PhotoData[] = []; // Store photos in memory

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
    this.setupRoutes();
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
        
        // Store photo and send to endpoint
        this.photos.push(photo);
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
