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
  async fetch(request, env, ctx) {
    // We only want to handle POST requests
    if (request.method !== 'POST') {
      return new Response('Invalid method. Please send a POST request with the receipt image.', {
        status: 405,
        headers: { 'Allow': 'POST' }
      });
    }

    try {
      // Extract the multipart form data from the request
      const formData = await request.formData();
      // Get the image file from the form data (the field name must be 'image')
      const imageFile = formData.get('image');

      // Check if the image file exists and is actually a file
      if (!imageFile || typeof imageFile === 'string') {
        return new Response(JSON.stringify({ error: "An 'image' file must be provided in the form data." }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Convert the image file's ArrayBuffer to a base64 string for the API call
      const arrayBuffer = await imageFile.arrayBuffer();
      const base64ImageData = arrayBufferToBase64(arrayBuffer);

      // This is the specific prompt to instruct Gemini on how to process the image
      const prompt = "Parse this receipt and extract the line item prices and the total cost. Format the output as a JSON object with 'line_items' (a list of dicts with keys: {name, price}) and 'total_amount' (a float).";

      // This is the payload we will send to the Gemini API
      const payload = {
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

      // Retrieve the Gemini API key from the worker's secrets
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret is not configured.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

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
        return new Response(JSON.stringify({
          error: `Error from Gemini API: ${geminiResponse.statusText}`,
          details: errorText
        }), {
          status: geminiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await geminiResponse.json();

      // Extract the JSON text from the response payload
      const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText) {
        console.error("Unexpected Gemini API response structure:", JSON.stringify(result, null, 2));
        return new Response(JSON.stringify({ error: 'Failed to parse receipt due to an unexpected API response.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Since we requested "application/json" as the response MIME type,
      // the 'responseText' is already a well-formatted JSON string.
      // We return it directly with the correct content type.
      return new Response(responseText, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // Catch any unexpected errors during the process
      console.error('Error processing request:', error);
      return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};

/**
 * Helper function to convert an ArrayBuffer to a base64 string.
 * @param {ArrayBuffer} buffer The ArrayBuffer from the image file.
 * @returns {string} The base64 encoded string.
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

