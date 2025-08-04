import express, { Request, Response } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';


dotenv.config();
const app = express();
const upload = multer({ dest: 'uploads/' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

interface LineItem {
  name: string;
  price: number;
}

interface Receipt {
  line_items: LineItem[];
  total_amount: number;
}

const receiptSchema = {
  type: 'object',
  properties: {
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
        },
        required: ['name', 'price'],
      },
    },
    total_amount: { type: 'number' },
  },
  required: ['line_items', 'total_amount'],
};

// Helper to encode image file to base64 and determine MIME type
async function readFileAndEncode(filePath: string): Promise<Part> {
  const imageBuffer = await fs.readFile(filePath);
  const mimeType = 'image/png'; // + path.extname(filePath).substring(1); // e.g., 'image/png'
  return {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: mimeType,
    },
  };
}

app.post('/parse_receipt/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const filePath = path.resolve(file.path);
    const imagePart = await readFileAndEncode(filePath); // Use the new helper

    const prompt = `
      Parse this receipt and extract the line item prices and the total cost. 
      Format the output as a JSON object with 'line_items' (a list of dicts with keys: {name, price}) 
      and 'total_amount' (a float).
    `;

    console.log('filepath', filePath)

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            imagePart,
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    const responseText = await response.text();

    // Add a check to ensure responseText is not empty or malformed before parsing
    if (!responseText || !responseText.trim().startsWith('{')) {
      console.error('Invalid JSON response:', responseText);
      return res.status(500).json({ error: 'Invalid JSON response from AI.' });
    }

    const responseJson = JSON.parse(responseText);
    const receiptText = responseJson['candidates'][0]['content']['parts'][0]['text'];

    const parsed: Receipt = JSON.parse(receiptText);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Parsing error:', error);
    return res.status(500).json({ error: error.message || 'Something went wrong.' });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path).catch(console.error);
    }
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});