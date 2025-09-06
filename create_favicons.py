#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw, ImageFont

# Create favicon PNGs in different sizes
sizes = [
    (16, "favicon-16x16.png"),
    (32, "favicon-32x32.png"),
    (180, "apple-touch-icon.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png")
]

for size, filename in sizes:
    # Create a new image with navy background
    img = Image.new('RGBA', (size, size), (10, 22, 40, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw a golden shield shape
    shield_color = (255, 215, 0, 255)  # Gold
    
    # Simplified shield for small sizes
    if size <= 32:
        # Just draw a golden S
        text_size = int(size * 0.6)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", text_size)
        except:
            font = ImageFont.load_default()
        
        text = "S"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (size - text_width) // 2
        y = (size - text_height) // 2
        draw.text((x, y), text, fill=shield_color, font=font)
    else:
        # Draw shield outline
        shield_points = [
            (size * 0.5, size * 0.1),  # Top center
            (size * 0.2, size * 0.25),  # Top left
            (size * 0.2, size * 0.6),   # Mid left
            (size * 0.5, size * 0.9),   # Bottom center
            (size * 0.8, size * 0.6),   # Mid right
            (size * 0.8, size * 0.25),  # Top right
        ]
        draw.polygon(shield_points, outline=shield_color, width=max(2, size//50))
        
        # Draw S in center
        text_size = int(size * 0.35)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", text_size)
        except:
            font = ImageFont.load_default()
        
        text = "S"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (size - text_width) // 2
        y = (size - text_height) // 2
        draw.text((x, y), text, fill=shield_color, font=font)
    
    # Save the image
    filepath = f"/home/jason/repos/SENTINEL/assets/images/{filename}"
    img.save(filepath, "PNG")
    print(f"✓ Created {filename} ({size}x{size})")

# Also create an ICO file
from PIL import Image
import io

ico_sizes = [(16, 16), (32, 32), (48, 48)]
ico_imgs = []

for size in ico_sizes:
    img = Image.new('RGBA', size, (10, 22, 40, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw golden S
    text_size = int(size[0] * 0.6)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", text_size)
    except:
        font = ImageFont.load_default()
    
    text = "S"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size[0] - text_width) // 2
    y = (size[1] - text_height) // 2
    draw.text((x, y), text, fill=(255, 215, 0, 255), font=font)
    
    ico_imgs.append(img)

# Save as ICO
ico_imgs[0].save("/home/jason/repos/SENTINEL/favicon.ico", format="ICO", sizes=ico_sizes)
print("✓ Created favicon.ico")

print("\n✅ All favicons created successfully!")