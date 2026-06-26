"""
catvton_api.py — Minimal HTTP API for CatVTON on Modal
IVM space calls this instead of IDM-VTON HF Space.
"""
from __future__ import annotations
import io, os, uuid
import modal
from modal import App, Image, Function
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

APP_NAME = "catvton-api"

web_app = FastAPI()

class TryonRequest(BaseModel):
    person_url: str
    garment_url: str
    cloth_type: str = "overall"
    steps: int = 30
    guidance: float = 2.5
    seed: int = 42
    width: int = 768
    height: int = 1024

@web_app.post("/tryon")
async def tryon(req: TryonRequest):
    try:
        f = Function.from_name("catvton", "run")
        result_bytes = f.remote(
            req.person_url, req.garment_url, req.cloth_type,
            req.steps, req.guidance, req.seed,
            req.width, req.height,
        )
        return {"success": True, "size": len(result_bytes)}
    except Exception as e:
        raise HTTPException(500, str(e))

app = App(APP_NAME)

@app.function(timeout=300)
@modal.asgi_app()
def fastapi_app():
    return web_app
