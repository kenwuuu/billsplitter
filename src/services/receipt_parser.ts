/**
 * Welcome to your Cloudflare Worker!
 *
 * This worker is designed to:
 * 1. Accept a POST request containing a receipt image.
 * 2. Convert the image to a base64 string.
 * 3. Call the Google Gemini API with the image and a specific prompt.
 * 4. Instruct Gemini to return a structured JSON object.
 * 5. Return the JSON response from Gemini directly to the client.
 *
 * To deploy this worker:
 * 1. Make sure you have Wrangler CLI installed.
 * 2. Create a `wrangler.toml` file (an example is provided below).
 * 3. Set your Gemini API key as a secret in your Cloudflare account using the command:
 * `npx wrangler secret put GEMINI_API_KEY`
 * When prompted, paste your API key.
 * 4. Deploy the worker with `npx wrangler deploy`.
 *
 * How to use the deployed worker:
 * - Send a POST request to your worker's URL.
 * - The request body must be `multipart/form-data`.
 * - The form data must contain a field named `image` with your receipt image file.
 *
 * Example using cURL:
 * curl -X POST \
 * -F "image=@/path/to/your/receipt.jpg" \
 * https://your-worker-name.your-subdomain.workers.dev/
 *
 */

// The main fetch handler for the Cloudflare Worker
export default {
  async fetch(request: { method: string; formData: () => any; }, env: { GEMINI_API_KEY: string; }, ctx: any) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // We only want to handle POST requests
    if (request.method !== 'POST') {
      return methodNotAllowedResponse();
    }

    try {
      // Extract the multipart form data and convert image to base64
      const { imageFile, base64ImageData } = await extractImageFromRequest(request);

      // Build the Gemini API payload
      const payload = buildGeminiPayload(imageFile, base64ImageData);

      // Retrieve and validate the Gemini API key
      const apiKey = validateApiKey(env.GEMINI_API_KEY);

      // Make the API call to Gemini
      const result = await callGeminiAPI(apiKey, payload);

      // Extract the JSON text from the response payload
      const responseText = extractGeminiResponse(result);

      if (!responseText) {
        return unexpectedGeminiResponse(result);
      }

      // Return the JSON directly to the client
      return new Response(responseText, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*', // or your domain
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });

    } catch (error) {
      // Catch any unexpected errors during the process
      console.error('Error processing request:', error);
      return internalServerErrorResponse();
    }
  }
};

/**
 * Returns a 405 Method Not Allowed response.
 */
function methodNotAllowedResponse() {
  return new Response('Invalid method. Please send a POST request with the receipt image.', {
    status: 405,
    headers: { 'Allow': 'POST' }
  });
}

/**
 * Extracts the image file from the request and converts it to a base64 string.
 * @param {Request} request The incoming request.
 * @returns {Promise<{ imageFile: File, base64ImageData: string }>}
 */
async function extractImageFromRequest(request: Request) {
  // Extract the multipart form data from the request
  const formData = await request.formData();

  // Get the image file from the form data (the field name must be 'image')
  const imageFile = formData.get('image');

  // Check if the image file exists and is actually a file
  if (!imageFile || typeof imageFile === 'string') {
    throw new Error("An 'image' file must be provided in the form data.");
  }

  // Convert the image file's ArrayBuffer to a base64 string for the API call
  const arrayBuffer = await imageFile.arrayBuffer();
  const base64ImageData = arrayBufferToBase64(arrayBuffer);

  return { imageFile, base64ImageData };
}

/**
 * Builds the request payload for the Gemini API.
 * @param {File} imageFile The uploaded receipt image file.
 * @param {string} base64ImageData Base64-encoded image data.
 * @returns {object} The Gemini API payload.
 */
function buildGeminiPayload(imageFile: File, base64ImageData: string) {
  // This is the specific prompt to instruct Gemini on how to process the image
  const prompt =
    "Parse this receipt and extract the line item prices and the total cost. " +
    "Format the output as a JSON object with 'line_items' (a list of dicts with keys: {name, price}) " +
    "and 'total_amount' (a float).";

  // This is the payload we will send to the Gemini API
  return {
    contents: [{
      role: "user",
      parts: [{
        text: prompt
      }, {
        inlineData: {
          mimeType: imageFile.type,
          data: base64ImageData
        }
      }]
    }],
    // We use generationConfig to ask for a specific JSON format in the response.
    // This is more reliable than just asking in the prompt text.
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "line_items": {
            "type": "ARRAY",
            "items": {
              "type": "OBJECT",
              "properties": {
                "name": { "type": "STRING" },
                "price": { "type": "NUMBER" }
              },
              "required": ["name", "price"]
            }
          },
          "total_amount": { "type": "NUMBER" }
        },
        "required": ["line_items", "total_amount"]
      }
    }
  };
}

/**
 * Validates that the Gemini API key exists.
 * @param {string | undefined} apiKey The Gemini API key from the environment.
 * @returns {string} The validated API key.
 */
function validateApiKey(apiKey?: string) {
  // Retrieve the Gemini API key from the worker's secrets
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY secret is not configured.');
  }
  return apiKey;
}

/**
 * Calls the Gemini API with the provided payload.
 * @param {string} apiKey Gemini API key.
 * @param {object} payload Request payload.
 * @returns {Promise<any>} Parsed JSON response from Gemini.
 */
async function callGeminiAPI(apiKey: string, payload: object) {
  // The Gemini API endpoint for the specified model
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  // Make the API call to the Gemini model
  const geminiResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Handle non-successful responses from the Gemini API
  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error("Gemini API Error:", errorText);
    throw new Error(`Error from Gemini API: ${geminiResponse.statusText} - ${errorText}`);
  }

  return geminiResponse.json();
}

/**
 * Extracts the structured JSON text from Gemini's response.
 * @param {any} result The Gemini API response.
 * @returns {string | null} The JSON string or null if missing.
 */
function extractGeminiResponse(result: any) {
  // @ts-ignore
  return result?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/**
 * Returns a 500 response for unexpected Gemini API responses.
 */
function unexpectedGeminiResponse(result: object) {
  console.error("Unexpected Gemini API response structure:", JSON.stringify(result, null, 2));
  return new Response(JSON.stringify({ error: 'Failed to parse receipt due to an unexpected API response.' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Returns a generic 500 Internal Server Error response.
 */
function internalServerErrorResponse() {
  return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Helper function to convert an ArrayBuffer to a base64 string.
 * @param {ArrayBuffer} buffer The ArrayBuffer from the image file.
 * @returns {string} The base64 encoded string.
 */
function arrayBufferToBase64(buffer: Iterable<number>): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
