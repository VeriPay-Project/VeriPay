from pdf2image import convert_from_path
import os

def pdf_to_images(pdf_path, output_dir="temp_images"):
    os.makedirs(output_dir, exist_ok=True)

    images = convert_from_path(pdf_path)
    image_paths = []

    base = os.path.splitext(os.path.basename(pdf_path))[0]

    for i, img in enumerate(images):
        path = os.path.join(output_dir, f"{base}_page_{i}.png")
        img.save(path, "PNG")
        image_paths.append(path)

    return image_paths
