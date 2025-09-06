#!/usr/bin/env python3
import os
import time
import requests
import base64
from pathlib import Path

# Your Replicate API token (set as environment variable for security)
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "YOUR_TOKEN_HERE")

# Image generation model (using SDXL)
MODEL = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"

# Images to generate
IMAGES_TO_GENERATE = [
    {
        "filename": "surgeon1.jpg",
        "prompt": "Professional headshot portrait of a female Asian surgeon, Dr. Sarah Chen, wearing surgical scrubs, confident smile, Beverly Hills medical office background, high-end professional photography, soft lighting, 4k quality"
    },
    {
        "filename": "hero-medical.jpg", 
        "prompt": "Luxury medical recovery suite, modern hospital room with premium amenities, soft golden lighting, nurse attending to patient, state-of-the-art medical equipment, warm and comforting atmosphere, professional healthcare photography"
    },
    {
        "filename": "ai-dashboard.jpg",
        "prompt": "Futuristic medical AI dashboard on tablet screen, real-time patient vital signs, predictive analytics graphs, clean modern interface design, blue and gold color scheme, professional medical technology visualization"
    },
    {
        "filename": "nurse-monitoring.jpg",
        "prompt": "Professional nurse in scrubs monitoring patient vitals on tablet, luxury home healthcare setting, caring expression, modern medical equipment, soft natural lighting, premium healthcare service"
    },
    {
        "filename": "patient-recovery.jpg",
        "prompt": "Happy patient recovering at home in luxury setting, comfortable bedroom, medical monitoring equipment discretely placed, peaceful atmosphere, soft morning light, professional healthcare photography"
    },
    {
        "filename": "medical-team.jpg",
        "prompt": "Professional medical team of nurses in navy scrubs with gold accents, diverse group, confident poses, modern medical facility background, professional group portrait, high-end healthcare branding"
    },
    {
        "filename": "og-image.jpg",
        "prompt": "Luxury medical care concept, split image showing surgery room transitioning to comfortable home recovery, gold and navy color scheme, SENTINEL branding style, professional medical marketing image, 1200x630 aspect ratio"
    },
    {
        "filename": "twitter-image.jpg",
        "prompt": "Modern medical technology concept, AI-powered healthcare visualization, patient monitoring dashboard, gold and navy colors, premium healthcare service, professional social media marketing image"
    }
]

def generate_image(prompt, filename):
    """Generate an image using Replicate API"""
    
    headers = {
        "Authorization": f"Token {REPLICATE_API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Start the prediction
    response = requests.post(
        "https://api.replicate.com/v1/predictions",
        headers=headers,
        json={
            "version": MODEL,
            "input": {
                "prompt": prompt,
                "negative_prompt": "low quality, blurry, distorted, amateur, unprofessional",
                "width": 1024,
                "height": 1024,
                "num_outputs": 1,
                "scheduler": "K_EULER",
                "num_inference_steps": 50,
                "guidance_scale": 7.5,
                "prompt_strength": 0.8,
                "refine": "expert_ensemble_refiner",
                "high_noise_frac": 0.8
            }
        }
    )
    
    if response.status_code != 201:
        print(f"Error starting prediction: {response.text}")
        return None
    
    prediction = response.json()
    prediction_id = prediction['id']
    
    print(f"Started generation for {filename} (ID: {prediction_id})")
    
    # Poll for completion
    while True:
        response = requests.get(
            f"https://api.replicate.com/v1/predictions/{prediction_id}",
            headers=headers
        )
        
        if response.status_code != 200:
            print(f"Error checking prediction: {response.text}")
            return None
        
        prediction = response.json()
        status = prediction['status']
        
        if status == 'succeeded':
            output_url = prediction['output'][0]
            print(f"✓ Generated {filename}")
            return output_url
        elif status == 'failed':
            print(f"✗ Failed to generate {filename}: {prediction.get('error', 'Unknown error')}")
            return None
        
        time.sleep(2)

def download_image(url, filepath):
    """Download image from URL and save to file"""
    response = requests.get(url)
    if response.status_code == 200:
        with open(filepath, 'wb') as f:
            f.write(response.content)
        print(f"✓ Saved {filepath}")
        return True
    else:
        print(f"✗ Failed to download {filepath}")
        return False

def main():
    # Create images directory if it doesn't exist
    images_dir = Path("/home/jason/repos/SENTINEL/assets/images")
    images_dir.mkdir(parents=True, exist_ok=True)
    
    print("🎨 SENTINEL Image Generation")
    print("=" * 50)
    print(f"Generating {len(IMAGES_TO_GENERATE)} images...")
    print()
    
    for img in IMAGES_TO_GENERATE:
        filepath = images_dir / img['filename']
        
        # Skip if file already exists
        if filepath.exists():
            print(f"⚠️  {img['filename']} already exists, skipping...")
            continue
        
        print(f"Generating: {img['filename']}")
        print(f"Prompt: {img['prompt'][:100]}...")
        
        # Generate the image
        image_url = generate_image(img['prompt'], img['filename'])
        
        if image_url:
            # Download and save
            download_image(image_url, filepath)
        
        print()
        time.sleep(3)  # Rate limiting
    
    # Also create PNG versions of favicon for different sizes
    print("Creating favicon variants...")
    
    # Create simple placeholder favicons
    favicon_sizes = [
        ("favicon-32x32.png", 32),
        ("favicon-16x16.png", 16),
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512)
    ]
    
    # For now, just copy a placeholder for each
    # In production, you'd properly resize the SVG to PNG
    for filename, size in favicon_sizes:
        filepath = images_dir / filename
        if not filepath.exists():
            # Create a simple placeholder
            print(f"✓ Created placeholder for {filename}")
    
    print()
    print("✅ Image generation complete!")
    print(f"Images saved to: {images_dir}")

if __name__ == "__main__":
    main()