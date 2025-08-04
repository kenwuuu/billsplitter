from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel
from typing import List
from google import genai
import json
import os
import uvicorn


load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
app = FastAPI()


class LineItem(BaseModel):
    name: str
    price: float

class Receipt(BaseModel):
    line_items: List[LineItem]
    total_amount: float


@app.post("/parse_receipt/")
async def parse_receipt(file: UploadFile = File(...)):
    """
    Upload a receipt image and get parsed line items and total amount.
    """
    try:
        # Read the image file
        image_data = await file.read()

        # Prepare the prompt for the Gemini model
        receipt_image = client.files.upload(file='tests/test_images/test.png')
        prompt = ("Parse this receipt and extract the line item prices and the total cost. "
                  "Format the output as a JSON object with 'line_items' (a list of dicts with keys: {item, price}) "
                  "and 'total_amount' (a float).")


        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=[prompt, receipt_image],
            config={
                "response_mime_type": "application/json",
                "response_schema": list[Receipt],
            },
        )

        response_text = response.text
        parsed_data = json.loads(response_text)

        # Validate the parsed data against the Pydantic model
        receipt_info = Receipt(**parsed_data)

        return receipt_info

    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)