#!/usr/bin/env python3
"""
Face Detection Microservice
Provides accurate face detection using OpenCV and dlib
"""

from flask import Flask, request, jsonify
import cv2
import numpy as np
import base64
from io import BytesIO
from PIL import Image
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Initialize face detector
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

@app.route('/detect-faces', methods=['POST'])
def detect_faces():
    """
    Detect faces in uploaded image
    Returns: JSON with face count and bounding boxes
    """
    try:
        # Get image data from request
        data = request.get_json()
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'])
        image = Image.open(BytesIO(image_data))
        
        # Convert PIL to OpenCV format
        opencv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )
        
        # Format response
        face_data = []
        for (x, y, w, h) in faces:
            face_data.append({
                'x': int(x),
                'y': int(y),
                'width': int(w),
                'height': int(h)
            })
        
        result = {
            'faces_detected': len(faces),
            'faces': face_data,
            'has_faces': len(faces) > 0
        }
        
        logging.info(f"Detected {len(faces)} face(s)")
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"Error detecting faces: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/process-faces', methods=['POST'])
def process_faces():
    """
    Detect faces and return processed image with bounding boxes
    """
    try:
        # Get image data from request
        data = request.get_json()
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'])
        image = Image.open(BytesIO(image_data))
        
        # Convert PIL to OpenCV format
        opencv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )
        
        # Draw rectangles around faces
        processed_image = opencv_image.copy()
        for i, (x, y, w, h) in enumerate(faces):
            # Draw green rectangle
            cv2.rectangle(processed_image, (x, y), (x+w, y+h), (0, 255, 0), 3)
            # Add label
            cv2.putText(processed_image, f'FACE {i+1}', (x, y-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        # Convert back to base64
        _, buffer = cv2.imencode('.jpg', processed_image)
        processed_base64 = base64.b64encode(buffer).decode('utf-8')
        
        result = {
            'faces_detected': len(faces),
            'has_faces': len(faces) > 0,
            'processed_image': processed_base64
        }
        
        logging.info(f"Processed image with {len(faces)} face(s)")
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"Error processing faces: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/crop-faces', methods=['POST'])
def crop_faces():
    """
    Detect faces and return individual face crops as base64 images
    """
    try:
        # Get image data from request
        data = request.get_json()
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'])
        image = Image.open(BytesIO(image_data))
        
        # Convert PIL to OpenCV format
        opencv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )
        
        if len(faces) == 0:
            return jsonify({
                'faces_detected': 0,
                'has_faces': False,
                'face_crops': []
            })
        
        # Extract face crops
        face_crops = []
        for i, (x, y, w, h) in enumerate(faces):
            # Add padding around face (20% on each side)
            padding = int(min(w, h) * 0.2)
            x_start = max(0, x - padding)
            y_start = max(0, y - padding)
            x_end = min(opencv_image.shape[1], x + w + padding)
            y_end = min(opencv_image.shape[0], y + h + padding)
            
            # Crop face from original image
            face_crop = opencv_image[y_start:y_end, x_start:x_end]
            
            # Convert to base64
            _, buffer = cv2.imencode('.jpg', face_crop)
            face_base64 = base64.b64encode(buffer).decode('utf-8')
            
            face_crops.append({
                'face_id': i + 1,
                'bounding_box': {
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h)
                },
                'crop_coordinates': {
                    'x_start': int(x_start),
                    'y_start': int(y_start),
                    'x_end': int(x_end),
                    'y_end': int(y_end)
                },
                'face_crop_base64': face_base64
            })
        
        result = {
            'faces_detected': len(faces),
            'has_faces': True,
            'face_crops': face_crops
        }
        
        logging.info(f"Extracted {len(faces)} face crop(s)")
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"Error cropping faces: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'face-detection'})

if __name__ == '__main__':
    logging.info("Starting Face Detection Service on port 5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
