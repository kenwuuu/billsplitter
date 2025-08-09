import tempfile
from pathlib import Path

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
async def parse_receipt(image: UploadFile = File(...)):
    """
    Upload a receipt image and get parsed line items and total amount.
    """
    try:
        # Write uploaded image to temp file because it just has to be this way
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(image.filename).suffix) as temp:
            temp.write(await image.read())
            temp_path = temp.name

        # Upload to Gemini then delete temp file
        receipt_image = client.files.upload(file=temp_path)
        os.remove(temp_path)

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

        if isinstance(parsed_data, list):
            parsed_data = parsed_data[0]

        # Validate the parsed data against the Pydantic model
        receipt_info = Receipt(**parsed_data)

        return receipt_info

    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)