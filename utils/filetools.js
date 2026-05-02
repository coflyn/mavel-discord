const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function tempPath(ext) {
  return path.join(
    TEMP_DIR,
    `morph_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`,
  );
}

async function bundleImagesToPdf(imagePaths) {
  const pdfDoc = await PDFDocument.create();

  for (const imgPath of imagePaths) {
    if (!fs.existsSync(imgPath)) continue;

    try {
      const imgBuffer = fs.readFileSync(imgPath);
      const isPng = imgPath.toLowerCase().endsWith(".png");

      const imageBuffer = await sharp(imgBuffer)
        .resize(1500, 2000, {
          fit: "inside",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .sharpen({ sigma: 1.5, m1: 0.5, j2: 0.2 })
        .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
        .toBuffer();

      const image = await pdfDoc.embedJpg(imageBuffer);
      const { width, height } = image.scale(1);

      const page = pdfDoc.addPage([width, height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width,
        height,
      });
    } catch (e) {
      console.error(`[FILETOOLS] Failed to embed image ${imgPath}:`, e.message);
    }
  }

  const pdfBytes = await pdfDoc.save();
  const outFile = tempPath("pdf");
  fs.writeFileSync(outFile, pdfBytes);
  return outFile;
}

module.exports = {
  bundleImagesToPdf,
  tempPath,
  TEMP_DIR,
  getTempDir: () => {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    return TEMP_DIR;
  }
};
