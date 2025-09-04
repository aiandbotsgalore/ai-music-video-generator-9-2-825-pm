
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const result = reader.result as string | null;
            if (!result) return reject(new Error("Failed to convert blob to base64."));
            // Strip the data URL prefix
            const comma = result.indexOf(",");
            const base64 = comma >= 0 ? result.slice(comma + 1) : result;
            if (!base64) return reject(new Error("Failed to extract base64 from data URL."));
            resolve(base64);
        };
        reader.onerror = (e) => reject(e);
    });
}

/**
 * Resizes an image blob to be under a specified maximum byte size.
 * It iteratively reduces image dimensions and quality until the target is met.
 * @param blob The initial image blob.
 * @param maxBytes The target maximum size in bytes.
 * @param mime The output MIME type.
 * @returns A promise that resolves with the resized blob.
 */
export async function resizeBlobToMaxBytes(blob: Blob, maxBytes: number, mime = 'image/jpeg'): Promise<Blob> {
    // If the blob is already small enough, return it immediately.
    if (blob.size <= maxBytes) {
        return blob;
    }

    const createImage = (b: Blob): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
            const url = URL.createObjectURL(b);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); res(img); };
            img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
            img.src = url;
        });

    const toBlob = (canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> =>
        new Promise((resolve, reject) => {
            canvas.toBlob(b => {
                if (b) resolve(b);
                else reject(new Error('Canvas toBlob returned null.'));
            }, mime, quality)
        });

    let currentBlob = blob;
    let img = await createImage(currentBlob);
    let { width, height } = img;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context.');

    let quality = 0.92;
    let iterations = 0;

    // Iteratively downscale until the size is acceptable or we hit a minimum size/quality.
    while (currentBlob.size > maxBytes && iterations < 10) {
        // Reduce dimensions by a factor, but not smaller than 64px.
        const scale = Math.sqrt(maxBytes / currentBlob.size) * 0.9;
        width = Math.max(64, Math.round(width * scale));
        height = Math.max(64, Math.round(height * scale));

        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const resizedBlob = await toBlob(canvas, quality);
        
        // If the size is still too large, reduce quality for the next attempt.
        if (resizedBlob.size > maxBytes) {
            quality *= 0.85;
        }
        
        currentBlob = resizedBlob;
        img = await createImage(currentBlob); // Create a new image for the next potential resize
        iterations++;
    }
    
    return currentBlob;
}
