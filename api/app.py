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
    from aimakerspace.text_utils import CSVLoader
except ImportError as e:
    logger.error(f"Failed to import aimakerspace modules: {e}")
    # Fallback imports for development
    PDFLoader = None
    CharacterTextSplitter = None
    VectorDatabase = None
    EmbeddingModel = None
    CSVLoader = None

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

# Global vector_db for storing the current document's vector database
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

# Define CSV upload endpoint
@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...), api_key: str = Form(None)):
    logger.info(f"Received CSV upload: {file.filename}")
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as temp_file:
            temp_file.write(await file.read())
            temp_file_path = temp_file.name
        csv_loader = CSVLoader(temp_file_path)
        chunks = csv_loader.load_documents()
        if not chunks:
            raise HTTPException(status_code=400, detail="No data could be extracted from the CSV file")
        # Chunking is not needed as each row is a chunk
        logger.info(f"Extracted {len(chunks)} chunks from CSV file")
        # Embed and index chunks for RAG
        from aimakerspace.vectordatabase import VectorDatabase
        from aimakerspace.openai_utils.embedding import EmbeddingModel
        global vector_db
        embedding_model = EmbeddingModel(api_key=api_key)
        vector_db = await VectorDatabase(embedding_model).abuild_from_list(chunks)
        logger.info("CSV successfully processed and indexed")
        return {"message": "CSV uploaded and processed successfully", "chunks_count": len(chunks)}
    except Exception as e:
        logger.error(f"Error processing CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")

# CSV RAG chat endpoint
@app.post("/api/rag-chat-csv")
async def rag_chat_csv(user_message: str = Form(...), api_key: str = Form(None)):
    if vector_db is None:
        raise HTTPException(status_code=400, detail="No CSV has been uploaded and processed yet")
    try:
        # Retrieve relevant chunks
        relevant_chunks = vector_db.search_by_text(user_message, k=5, return_as_text=True)
        context = "\n".join(relevant_chunks) if relevant_chunks else ""
        # Compose prompt for LLM
        prompt = f"You are a helpful AI music assistant. Use the following song data to answer the user's question.\n\n{context}\n\nUser: {user_message}\nAssistant (in markdown):"
        from aimakerspace.openai_utils.chatmodel import ChatOpenAI
        chat = ChatOpenAI(api_key=api_key)
        messages = [
            {"role": "system", "content": "You are a helpful AI music assistant. Use the provided song data to answer user questions in markdown."},
            {"role": "user", "content": prompt}
        ]
        response = chat.run(messages, text_only=True)
        return {"response": response}
    except Exception as e:
        logger.error(f"Error in RAG CSV chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in RAG CSV chat: {str(e)}")

# PDF RAG chat endpoint
@app.post("/api/rag-chat")
async def rag_chat(user_message: str = Form(...), api_key: str = Form(None)):
    global vector_db, processed_documents
    if vector_db is None or not processed_documents:
        raise HTTPException(status_code=400, detail="No PDF has been uploaded and processed yet")
    try:
        # Retrieve relevant chunks
        relevant_chunks = vector_db.search_by_text(user_message, k=5, return_as_text=True)
        context = "\n".join(relevant_chunks) if relevant_chunks else ""
        # Compose prompt for LLM
        prompt = f"You are a helpful AI assistant. Use the following PDF document context to answer the user's question.\n\n{context}\n\nUser: {user_message}\nAssistant (in markdown):"
        from aimakerspace.openai_utils.chatmodel import ChatOpenAI
        chat = ChatOpenAI(api_key=api_key)
        messages = [
            {"role": "system", "content": "You are a helpful AI assistant. Use the provided PDF document context to answer user questions in markdown."},
            {"role": "user", "content": prompt}
        ]
        response = chat.run(messages, text_only=True)
        return {"response": response}
    except Exception as e:
        logger.error(f"Error in RAG PDF chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in RAG PDF chat: {str(e)}")

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
