/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality, GenerateContentResponse, GeneratedImage } from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

interface ReferenceImage {
  base64: string;
  mimeType: string;
}

const referenceImages: { [key: string]: ReferenceImage | null } = {
  char1: null,
  char2: null,
  char3: null,
  char4: null,
  bg: null,
};

const originalPrompt = 'Editorial wildlife photograph: a sleek black panther standing regally on a reflective salt flat at dusk, wearing a dramatic, sculptural couture gown inspired by organic forms. The landscape is vast and otherworldly but grounded in reality, with subtle shimmering textures and a warm, golden-hour glow. Captured with a cinematic 35mm lens, shallow depth of field, natural shadows, and authentic fur and fabric textures—evoking a high-fashion magazine cover with a surreal, yet believable, atmosphere.';

document.addEventListener('DOMContentLoaded', () => {
  const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
  if (promptInput) {
    promptInput.value = originalPrompt;
  }
  
  const generateBtn = document.getElementById('generate-button');
  generateBtn?.addEventListener('click', generateAndDisplayImages);
  
  setupUploadBoxes();
});


function setupUploadBoxes() {
    const charGrid = document.querySelector('.image-upload-grid');
    const bgContainer = document.getElementById('bg-upload-container');

    for (let i = 1; i <= 4; i++) {
        const id = `char${i}`;
        const wrapper = document.createElement('div');
        wrapper.className = 'upload-box-wrapper';
        wrapper.innerHTML = `
            <label for="file-input-${id}" class="upload-box" id="upload-box-${id}" aria-label="Upload character image ${i}">
                <span>${i}</span>
                <img id="preview-${id}" alt="Preview for character image ${i}" />
                <input type="file" id="file-input-${id}" accept="image/*" />
            </label>
            <button class="remove-btn" id="remove-btn-${id}" aria-label="Remove image ${i}">&times;</button>
            <div class="upload-checkbox">
                <input type="checkbox" id="checkbox-${id}" />
                <label for="checkbox-${id}">Use Image ${i}</label>
            </div>
        `;
        charGrid?.appendChild(wrapper);
        document.getElementById(`file-input-${id}`)?.addEventListener('change', (e) => handleFileChange(e, id));
        document.getElementById(`remove-btn-${id}`)?.addEventListener('click', () => handleRemoveImage(id));

    }
    
    const bgId = 'bg';
    const bgWrapper = document.createElement('div');
    bgWrapper.className = 'upload-box-wrapper';
    bgWrapper.innerHTML = `
        <label for="file-input-${bgId}" class="upload-box" id="upload-box-${bgId}" aria-label="Upload background image">
            <span>BG</span>
            <img id="preview-${bgId}" alt="Preview for background image" />
            <input type="file" id="file-input-${bgId}" accept="image/*" />
        </label>
        <button class="remove-btn" id="remove-btn-${bgId}" aria-label="Remove background image">&times;</button>
    `;
    bgContainer?.appendChild(bgWrapper);
    document.getElementById(`file-input-${bgId}`)?.addEventListener('change', (e) => handleFileChange(e, bgId));
    document.getElementById(`remove-btn-${bgId}`)?.addEventListener('click', () => handleRemoveImage(bgId));
}


function handleFileChange(event: Event, id: string) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    const preview = document.getElementById(`preview-${id}`) as HTMLImageElement;
    preview.src = dataUrl;

    const [header, base64] = dataUrl.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    
    referenceImages[id] = { base64, mimeType };

    const wrapper = preview.closest('.upload-box-wrapper');
    wrapper?.classList.add('has-image');
  };
  reader.readAsDataURL(file);
}

function handleRemoveImage(id: string) {
    // Clear the image data
    referenceImages[id] = null;

    // Reset the preview image
    const preview = document.getElementById(`preview-${id}`) as HTMLImageElement;
    if (preview) {
        preview.src = '';
    }

    // Reset the file input so the user can re-select the same file
    const fileInput = document.getElementById(`file-input-${id}`) as HTMLInputElement;
    if (fileInput) {
        fileInput.value = '';
    }

    // Update the UI state by removing the class from the wrapper
    const wrapper = preview.closest('.upload-box-wrapper');
    wrapper?.classList.remove('has-image');
    
    // Uncheck the checkbox if it's a character image
    if (id.startsWith('char')) {
        const checkbox = document.getElementById(`checkbox-${id}`) as HTMLInputElement;
        if (checkbox) {
            checkbox.checked = false;
        }
    }
}

function getSelectedImages(): ReferenceImage[] {
    const selected: ReferenceImage[] = [];

    // Give priority to the background image if it exists
    if (referenceImages.bg) {
        selected.push(referenceImages.bg);
    }

    // Add all checked character images
    for (let i = 1; i <= 4; i++) {
        const id = `char${i}`;
        const checkbox = document.getElementById(`checkbox-${id}`) as HTMLInputElement;
        if (checkbox.checked && referenceImages[id]) {
            selected.push(referenceImages[id]!);
        }
    }
    
    return selected;
}

function setMessage(message: string, isError = false) {
    const imageGallery = document.getElementById('image-gallery');
    if (imageGallery) {
        imageGallery.innerHTML = `<div class="message ${isError ? 'error' : ''}">${message}</div>`;
    }
}

async function generateAndDisplayImages() {
  const generateBtn = document.getElementById('generate-button') as HTMLButtonElement;
  const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
  const aspectRatioSelect = document.getElementById('aspect-ratio-select') as HTMLSelectElement;
  
  generateBtn.disabled = true;
  setMessage('Generating images, please wait...');

  try {
    const prompt = promptInput.value;
    const selectedImages = getSelectedImages();
    const aspectRatio = aspectRatioSelect.value as AspectRatio;

    if (selectedImages.length > 0) {
        const imageParts = selectedImages.map(img => ({
            inlineData: { data: img.base64, mimeType: img.mimeType }
        }));

        // Smarter prompt engineering to guide the model with multiple images
        const hasBg = selectedImages.length > 0 && referenceImages.bg === selectedImages[0];
        const numCharacters = hasBg ? selectedImages.length - 1 : selectedImages.length;
        const instructions: string[] = [];

        if (hasBg) {
            instructions.push("Use the first provided image as the main background. Critically, you must remove any people from this image, using only the scenery as the background for the final composition.");
        }
        
        if (numCharacters > 0) {
            const charText = numCharacters === 1 ? 'character' : 'characters';
            if (hasBg) {
                instructions.push(`Integrate the ${numCharacters} ${charText} from the other reference images into the background scene.`);
            } else {
                instructions.push(`Combine the ${numCharacters} ${charText} from the reference images into a single cohesive scene based on the text prompt.`);
            }
            instructions.push("Crucially, ensure each distinct character appears only once in the final image and that no characters are omitted or duplicated.");
        }

        let finalPrompt = prompt;
        if (instructions.length > 0) {
            finalPrompt = `${instructions.join(' ')}\n\nHere is the creative brief: "${prompt}"`;
        }
        finalPrompt = `${finalPrompt}\n\nFinally, the image must have a ${aspectRatio} aspect ratio.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    ...imageParts,
                    { text: finalPrompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        const imagePartsFromResponse = response.candidates?.[0]?.content?.parts.filter(p => p.inlineData);
        if (imagePartsFromResponse && imagePartsFromResponse.length > 0) {
            const images = imagePartsFromResponse.map(part => ({
                image: { 
                    imageBytes: part.inlineData!.data,
                    mimeType: part.inlineData!.mimeType,
                 }
            })) as Partial<GeneratedImage>[];
            displayImages(images);
        } else {
             const modelTextResponse = response.candidates?.[0]?.content?.parts
              .filter(p => p.text).map(p => p.text).join(' ') || 'No image was generated by the model.';
            throw new Error(modelTextResponse);
        }

    } else {
        // Use text-to-image model
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 3,
                aspectRatio: aspectRatio,
                outputMimeType: 'image/jpeg',
            },
        });
        
        displayImages(response.generatedImages);
    }

  } catch (error) {
    console.error("Error generating images:", error);
    const errorMessage = error instanceof Error ? error.message : "Could not load images. Please check the console for details.";
    setMessage(`Error: ${errorMessage}`, true);
  } finally {
    generateBtn.disabled = false;
  }
}

function displayImages(generatedImages: Partial<GeneratedImage>[] | undefined) {
    const imageGallery = document.getElementById('image-gallery');
    if (!imageGallery) return;

    imageGallery.textContent = '';
    
    if (!generatedImages || generatedImages.length === 0) {
        setMessage('No images were generated or the response was empty.');
        return;
    }

    generatedImages.forEach((generatedImage, index) => {
        if (generatedImage.image?.imageBytes) {
            const mimeType = generatedImage.image.mimeType || 'image/jpeg';
            const fileExtension = mimeType.split('/')[1] || 'jpeg';
            const src = `data:${mimeType};base64,${generatedImage.image.imageBytes}`;

            // Create a wrapper for the image and button
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';
            
            // Create the image element
            const img = document.createElement('img');
            img.src = src;
            img.alt = `Generated Image ${index + 1}`;
            
            // Create the download button
            const downloadBtn = document.createElement('a');
            downloadBtn.href = src;
            downloadBtn.download = `generated-image-${index + 1}.${fileExtension}`;
            downloadBtn.className = 'download-btn';
            downloadBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                </svg>
                <span>Tải về</span>
            `;
            downloadBtn.setAttribute('aria-label', `Download image ${index + 1}`);
            downloadBtn.setAttribute('role', 'button');

            // Append image and button to the wrapper
            galleryItem.appendChild(img);
            galleryItem.appendChild(downloadBtn);
            
            // Append the wrapper to the gallery
            imageGallery.appendChild(galleryItem);
        }
    });
}