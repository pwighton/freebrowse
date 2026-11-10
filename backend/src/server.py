import os
import json
import mimetypes
import logging
import uuid
import base64
from pathlib import Path
from typing import Union

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ai_session import build_router as build_ai_router
from data_listing import list_data_files

# Configure logging.  Possible logging levels are:
#   - logging.DEBUG
#   - logging.INFO
#   - logging.WARNING
#   - logging.ERROR
#   - logging.CRITICAL
logging.basicConfig(level=logging.INFO,
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

static_dir = os.getenv('NIIVUE_BUILD_DIR')
data_dir = os.getenv('DATA_DIR')
scene_schema_id = os.getenv('SCENE_SCHEMA_ID')
imaging_extensions_str = os.getenv('IMAGING_EXTENSIONS', '["*.nii", "*.nii.gz", "*.zarr"]')
imaging_extensions = json.loads(imaging_extensions_str)
serverless_mode = os.getenv('SERVERLESS_MODE', 'false').lower() == 'true'
ai_dir = os.getenv('AI_DIR')
models_dir = os.getenv('MODELS_DIR')
enable_ai = os.getenv('ENABLE_AI', 'false').lower() == 'true' and not serverless_mode
enable_ai_history = os.getenv('ENABLE_AI_HISTORY', 'false').lower() == 'true' and enable_ai
ai_cache_ttl_seconds = int(os.getenv('AI_SESSION_CACHE_TTL_SECONDS', '1800'))

logger.info(f"NIIVUE_BUILD_DIR: {static_dir}")
logger.info(f"DATA_DIR: {data_dir}")
logger.info(f"SCENE_SCHEMA_ID: {scene_schema_id}")
logger.info(f"IMAGING_EXTENSIONS: {imaging_extensions}")
logger.info(f"SERVERLESS_MODE: {serverless_mode}")
logger.info(f"AI_DIR: {ai_dir}")
logger.info(f"MODELS_DIR: {models_dir}")
logger.info(f"ENABLE_AI: {enable_ai}")
logger.info(f"ENABLE_AI_HISTORY: {enable_ai_history}")
logger.info(f"AI_SESSION_CACHE_TTL_SECONDS: {ai_cache_ttl_seconds}")

# Register the MIME type so that .gz files (or .nii.gz files) are served correctly.
mimetypes.add_type("application/gzip", ".nii.gz", strict=True)

class SaveSceneRequest(BaseModel):
    filename: str
    # format="json": `data` is the JSON document object (written via json.dump).
    # format="cbor": `data` is a base64 string of binary CBOR (written as bytes).
    data: Union[dict, str]
    format: str = "json"

class SaveVolumeRequest(BaseModel):
    filename: str
    data: str  # base64 encoded NIfTI data

app = FastAPI()

# Define API routes BEFORE static file mounts to prevent catch-all behavior
@app.get("/data/nvd")
def list_niivue_documents():
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    logger.debug(f"Looking for niivue documents (.nvd) files recursivly in {data_dir}")
    try:
        return list_data_files(data_dir, ["*.nvd"])
    except Exception as e:
        return {"error": str(e)}

@app.get("/data/vol")
def list_imaging_files():
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    logger.debug(f"Looking for imaging files {imaging_extensions} recursively in {data_dir}")
    try:
        # A zarr store (a `*.zarr` directory) is listed as one entry; the /data
        # mount below serves the files inside it.
        return list_data_files(data_dir, imaging_extensions)
    except Exception as e:
        return {"error": str(e)}

@app.post("/data/nvd")
def save_scene(request: SaveSceneRequest):
    """
    Save scene data to a file in the DATA_DIR directory.

    Args:
        request: Contains filename and scene data

    Returns:
        Success message or error
    """
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    try:
        # Validate filename
        if not request.filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        
        # Ensure filename ends with .nvd
        if not request.filename.endswith('.nvd'):
            filename = request.filename + '.nvd'
        else:
            filename = request.filename
        
        # Create full file path
        file_path = Path(data_dir) / filename

        # Create directory if it doesn't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Write the document. JSON documents are stored as pretty-printed JSON;
        # CBOR documents arrive base64-encoded and are written as raw bytes.
        if request.format == 'cbor':
            if not isinstance(request.data, str):
                raise HTTPException(status_code=400, detail="CBOR data must be a base64 string")
            try:
                cbor_bytes = base64.b64decode(request.data)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64 data: {str(e)}")
            with open(file_path, 'wb') as f:
                f.write(cbor_bytes)
        else:
            with open(file_path, 'w') as f:
                json.dump(request.data, f, indent=2)

        logger.info(f"Scene saved successfully to {file_path}")
        
        return {
            "success": True,
            "message": f"Scene saved successfully to {filename}",
            "file_path": str(file_path.relative_to(data_dir))
        }
        
    except Exception as e:
        logger.error(f"Error saving scene: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save scene: {str(e)}")

@app.post("/data/nii")
def save_volume(request: SaveVolumeRequest):
    """
    Save volume data to a file in the DATA_DIR directory.

    Args:
        request: Contains filename and base64 encoded NIfTI data

    Returns:
        Success message or error
    """
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    try:
        # Validate filename
        if not request.filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        
        # Remove 'data/' prefix if present (frontend URLs vs backend paths)
        filename = request.filename
        if filename.startswith('data/'):
            filename = filename[5:]  # Remove 'data/' prefix
        
        # Ensure filename has .nii or .nii.gz extension
        if not filename.endswith('.nii') and not filename.endswith('.nii.gz'):
            filename = filename + '.nii.gz'  # Default to compressed
        
        # Decode base64 data
        try:
            volume_data = base64.b64decode(request.data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid base64 data: {str(e)}")
        
        # Create full file path
        file_path = Path(data_dir) / filename
        
        # Create directory if it doesn't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write the binary data to file
        with open(file_path, 'wb') as f:
            f.write(volume_data)
        
        logger.info(f"Volume saved successfully to {file_path}")
        
        return {
            "success": True,
            "message": f"Volume saved successfully to {filename}",
            "file_path": str(file_path.relative_to(data_dir))
        }
        
    except Exception as e:
        logger.error(f"Error saving volume: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save volume: {str(e)}")

# Register the AI router before the /data static mount so explicit routes win.
if enable_ai:
    app.include_router(build_ai_router(
        ai_dir=Path(ai_dir) if ai_dir else Path('./ai-sessions'),
        data_dir=Path(data_dir) if data_dir else Path('./data'),
        models_dir=Path(models_dir) if models_dir else Path('./models'),
        ttl_seconds=ai_cache_ttl_seconds,
        enabled=True,
        enable_history=enable_ai_history,
    ))

# Mount static directories AFTER all API routes
app.mount("/static", StaticFiles(directory=static_dir, html=True), name="static")

# Only mount data directory if not in serverless mode
if not serverless_mode:
    app.mount("/data", StaticFiles(directory=data_dir, html=False), name="data")
