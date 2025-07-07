# Import required FastAPI components for building the API
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# Import Pydantic for data validation and settings management
from pydantic import BaseModel
# Import OpenAI client for interacting with OpenAI's API
from openai import OpenAI
import os
import logging
from typing import Optional
import tempfile
import shutil

# Configure logging for better debugging on Vercel
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import aimakerspace components for RAG functionality
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'aimakerspace'))
try:
    from aimakerspace.text_utils import PDFLoader, CharacterTextSplitter
    from aimakerspace.vectordatabase import VectorDatabase
    from aimakerspace.openai_utils.embedding import EmbeddingModel
except ImportError as e:
    logger.error(f"Failed to import aimakerspace modules: {e}")
    # Fallback imports for development
    PDFLoader = None
    CharacterTextSplitter = None
    VectorDatabase = None
    EmbeddingModel = None

# Initialize FastAPI application with a title
app = FastAPI(title="OpenAI Chat API")

# Configure CORS (Cross-Origin Resource Sharing) middleware
# This allows the API to be accessed from different domains/origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from any origin
    allow_credentials=True,  # Allows cookies to be included in requests
    allow_methods=["*"],  # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers in requests
)

# Global variables to store the vector database and processed documents
vector_db = None
processed_documents = []

# Define the data model for chat requests using Pydantic
# This ensures incoming request data is properly validated
class ChatRequest(BaseModel):
    developer_message: str  # Message from the developer/system
    user_message: str      # Message from the user
    model: Optional[str] = "gpt-4.1-mini"  # Optional model selection with default
    api_key: str          # OpenAI API key for authentication

# Define the data model for RAG chat requests
class RAGChatRequest(BaseModel):
    user_message: str      # Message from the user
    model: Optional[str] = "gpt-4.1-mini"  # Optional model selection with default
    api_key: str          # OpenAI API key for authentication

# Define the main chat endpoint that handles POST requests
@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        logger.info(f"Received chat request with model: {request.model}")
        
        # Initialize OpenAI client with the provided API key
        client = OpenAI(
            api_key=request.api_key,
            base_url="https://api.openai.com/v1"  # Explicitly set the base URL for project keys
        )
        
        # Create an async generator function for streaming responses
        async def generate():
            try:
                # Create a streaming chat completion request
                stream = client.chat.completions.create(
                    model=request.model or "gpt-4.1-mini",
                    messages=[
                        {"role": "developer", "content": request.developer_message + "\n\n**Important**: Format your responses using markdown for better readability:\n- Use **bold** for emphasis\n- Use *italics* for secondary emphasis\n- Use bullet points (• or -) for lists\n- Use numbered lists when appropriate\n- Use `code` for technical terms or file names\n- Use ```code blocks``` for longer code examples\n- Use > for quotes or important notes\n- Use proper line breaks and spacing"},
                        {"role": "user", "content": request.user_message}
                    ],
                    stream=True  # Enable streaming response
                )
                
                # Yield each chunk of the response as it becomes available
                for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                logger.error(f"Error in streaming response: {str(e)}")
                yield f"Error: {str(e)}"

        # Return a streaming response to the client
        return StreamingResponse(generate(), media_type="text/plain")
    
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        # Handle any errors that occur during processing
        raise HTTPException(status_code=500, detail=str(e))

# Define PDF upload endpoint
@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...), api_key: str = Form(None)):
    global vector_db, processed_documents
    
    try:
        logger.info(f"Received PDF upload: {file.filename}")
        
        # Validate file type
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
        from aimakerspace.text_utils import PDFLoader, CharacterTextSplitter
        from aimakerspace.vectordatabase import VectorDatabase
        from aimakerspace.openai_utils.embedding import EmbeddingModel
        
        # Create temporary file to store the uploaded PDF
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_file_path = temp_file.name
        
        try:
            # Load and process the PDF
            pdf_loader = PDFLoader(temp_file_path)
            documents = pdf_loader.load_documents()
            
            if not documents:
                raise HTTPException(status_code=400, detail="No text could be extracted from the PDF")
            
            # Split documents into chunks
            text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = text_splitter.split_texts(documents)
            
            logger.info(f"Extracted {len(chunks)} chunks from PDF")
            
            # Initialize vector database with embeddings, passing the user's API key
            embedding_model = EmbeddingModel(api_key=api_key)
            vector_db = VectorDatabase(embedding_model)
            
            # Build vector database from chunks
            await vector_db.abuild_from_list(chunks)
            processed_documents = chunks
            
            logger.info("PDF successfully processed and indexed")
            
            return {
                "message": "PDF uploaded and processed successfully",
                "chunks_count": len(chunks),
                "filename": file.filename
            }
            
        finally:
            # Clean up temporary file
            os.unlink(temp_file_path)
            
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Define RAG chat endpoint
@app.post("/api/rag-chat")
async def rag_chat(request: RAGChatRequest):
    global vector_db, processed_documents
    
    try:
        logger.info(f"Received RAG chat request with model: {request.model}")
        
        if vector_db is None or not processed_documents:
            raise HTTPException(status_code=400, detail="No PDF has been uploaded and processed yet")
        
        # Search for relevant documents
        relevant_chunks = vector_db.search_by_text(
            request.user_message, 
            k=3, 
            return_as_text=True
        )
        # If not returning as text, extract the text part from the tuple
        if not all(isinstance(chunk, str) for chunk in relevant_chunks):
            relevant_chunks = [chunk[0] for chunk in relevant_chunks]
        # Create context from relevant chunks
        context = "\n\n".join(
            chunk if isinstance(chunk, str) else chunk[0]
            for chunk in relevant_chunks
        )
        
        # Initialize OpenAI client with user's API key
        client = OpenAI(
            api_key=request.api_key,
            base_url="https://api.openai.com/v1"
        )
        
        # Create system message with context
        system_message = f"""
You are a helpful AI assistant that answers questions based on the provided document context.

Document Context:
{context}

Please answer the user's question based on the information in the document context. If the answer cannot be found in the context, say so clearly. Be concise and accurate.

**Important:** Format your responses using markdown for better readability:
- Use **bold** for emphasis
- Use *italics* for secondary emphasis
- Use bullet points (with `-` or `*`) for lists
- Use numbered lists when appropriate
- Use `code` for technical terms or file names
- Use triple backticks for code blocks
- Use `>` for blockquotes
- **Always put a blank line between paragraphs and between list items for proper spacing**
- If you use a list, put a blank line before and after the list
"""
        
        # Create an async generator function for streaming responses
        async def generate():
            try:
                # Create a streaming chat completion request
                stream = client.chat.completions.create(
                    model=request.model or "gpt-4.1-mini",
                    messages=[
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": request.user_message}
                    ],
                    stream=True
                )
                
                # Yield each chunk of the response as it becomes available
                for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                logger.error(f"Error in RAG streaming response: {str(e)}")
                yield f"Error: {str(e)}"

        # Return a streaming response to the client
        return StreamingResponse(generate(), media_type="text/plain")
    
    except Exception as e:
        logger.error(f"Error in RAG chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Define a health check endpoint to verify API status
@app.get("/api/health")
async def health_check():
    logger.info("Health check endpoint called")
    return {"status": "ok"}

# Define endpoint to check if PDF is loaded
@app.get("/api/pdf-status")
async def pdf_status():
    global vector_db, processed_documents
    return {
        "pdf_loaded": vector_db is not None,
        "chunks_count": len(processed_documents) if processed_documents else 0
    }

# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
