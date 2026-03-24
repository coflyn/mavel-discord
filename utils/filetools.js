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
      const imageBuffer = await sharp(fs.readFileSync(imgPath))
        .resize(1200, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
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
  tempPath
};
